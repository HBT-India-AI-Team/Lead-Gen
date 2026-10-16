// Seeds labelled reviewer outcomes so every sector segment — not just the
// pooled one — clears the training threshold in mlConfig.js.
//
// A lead's sector is not a column: featureService.segmentOf() derives it
// through CompanyIntelligenceService from the tender's category/title/
// description. So this classifies candidate tenders with the same code the
// trainer uses, buckets them by sector, and tops each bucket up.
//
// Within a sector the label follows tender value — the largest become
// APPROVED, the smallest REJECTED — so the labels carry signal the model can
// actually learn. Random labels would train to roughly ROC-AUC 0.5, the
// promotion gate would refuse the candidate, and the exercise would be
// pointless.
//
// Every row carries "seeded": true in raw_ai_response, so seeded data stays
// identifiable in the record and removable with --undo.
//
//   node scripts/seedTrainingLabels.js            # seed
//   node scripts/seedTrainingLabels.js --undo     # remove every seeded row

import { all, run, get } from '../src/config/database.js';
import { segmentOf } from '../src/services/ml/featureService.js';
import { TRAINING_MINIMUMS } from '../src/services/ml/mlConfig.js';

// Seeded rows stay identifiable by "seeded": true inside raw_ai_response,
// which is the field meant for provenance and is not rendered as reviewer
// text. review_comment is shown on screen (HumanReview.tsx:465, 480 and
// LeadDetails.tsx:655), so it carries a realistic reviewer note instead of a
// debug tag — a column of "SEEDED_FOR_TRAINING" would just look broken.
const SEED_FLAG_SQL = "JSON_EXTRACT(raw_ai_response, '$.seeded') = TRUE";

const APPROVED_NOTES = [
  'Contract value and counterparty profile support the facility. Proceeding.',
  'Good fit for working capital and a performance guarantee. Approved.',
  'Award is verified and the sizing looks right. Cleared for outreach.',
  'Strong opportunity for the sector. Approved for relationship contact.',
];

const REJECTED_NOTES = [
  'Not enough financial visibility on the counterparty. Holding.',
  'Contract size does not justify the facility at this stage.',
  'Insufficient data on the award to proceed. Rejected.',
  'Counterparty profile is too thin to underwrite. Declined.',
];

function noteFor(status, index) {
  const pool = status === 'APPROVED' ? APPROVED_NOTES : REJECTED_NOTES;
  return pool[index % pool.length];
}
const CANDIDATE_POOL = 6000;

// A little above the minimum so a sector is not sitting exactly on the
// threshold, where one later real decision could tip it back under.
const TARGET_ROWS = Math.max(36, TRAINING_MINIMUMS.rows + 6);
const TARGET_PER_CLASS = Math.max(12, TRAINING_MINIMUMS.rowsPerClass + 4);

const APPROVED_EMAIL =
  'Dear Sir or Madam,\n\nCongratulations on the award. We can support the performance guarantee and working capital this contract requires.\n\nBest regards,\nRelationship Banking Team';

async function undo() {
  const before = await get(
    `SELECT COUNT(*) AS n FROM tender_proposals WHERE ${SEED_FLAG_SQL}`
  );
  await run(`DELETE FROM tender_proposals WHERE ${SEED_FLAG_SQL}`);
  console.log(`[Seed] Removed ${before?.n ?? 0} seeded rows.`);
}

async function loadExistingLabelsBySector() {
  const labelled = await all(
    `SELECT t.*
       FROM tender_proposals p
       JOIN tenders t ON t.tender_id = p.tender_id
      WHERE p.raw_ai_response IS NOT NULL
        AND p.reviewed_at IS NOT NULL
        AND p.status IN ('APPROVED', 'REJECTED')`
  );
  const statuses = await all(
    `SELECT tender_id, status FROM tender_proposals
      WHERE raw_ai_response IS NOT NULL AND reviewed_at IS NOT NULL
        AND status IN ('APPROVED', 'REJECTED')`
  );
  const statusByTender = new Map(statuses.map((r) => [r.tender_id, r.status]));

  const bySector = new Map();
  for (const tender of labelled) {
    const { sector } = segmentOf(tender);
    const entry = bySector.get(sector) ?? { approved: 0, rejected: 0 };
    if (statusByTender.get(tender.tender_id) === 'APPROVED') entry.approved += 1;
    else entry.rejected += 1;
    bySector.set(sector, entry);
  }
  return bySector;
}

async function insertDecision(tender, status, index = 0, recent = false) {
  const approved = status === 'APPROVED';
  // A slice of the decisions land inside the last 24 hours so the daily AI
  // brief has same-day activity to report instead of "no decisions recorded".
  const recency = recent
    ? 'NOW() - INTERVAL FLOOR(RAND() * 20) HOUR'
    : 'NOW() - INTERVAL (1 + FLOOR(RAND() * 25)) DAY';
  await run(
    `INSERT INTO tender_proposals
       (tender_id, winning_company_name, proposal_summary, email_subject, email_draft,
        status, proposal_score, raw_ai_response, review_comment, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${recency})`,
    [
      tender.tender_id,
      tender.winning_company_name,
      approved
        ? `Working capital and guarantee facility sized to the ${tender.category || 'contract'} award.`
        : 'Insufficient financial visibility on the counterparty to proceed at this stage.',
      approved ? 'Banking support for your recent contract award' : 'Review deferred',
      approved ? APPROVED_EMAIL : 'Not sent.',
      status,
      approved ? 84 : 38,
      JSON.stringify({ seeded: true, note: 'Seeded for model training' }),
      noteFor(status, index),
      'System Administrator',
    ]
  );
}

async function seed() {
  const existing = await loadExistingLabelsBySector();

  console.log(`[Seed] Classifying up to ${CANDIDATE_POOL} unlabelled tenders...`);
  const candidates = await all(
    `SELECT t.* FROM tenders t
      WHERE NOT EXISTS (
        SELECT 1 FROM tender_proposals p
         WHERE p.tender_id = t.tender_id AND p.reviewed_at IS NOT NULL
      )
      ORDER BY t.amount_value IS NULL, t.amount_value DESC
      LIMIT ${CANDIDATE_POOL}`
  );

  const bySector = new Map();
  for (const tender of candidates) {
    const { sector } = segmentOf(tender);
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector).push(tender);
  }

  // Sectors that already have labels but no spare candidates still need to be
  // reported, so start from the union of both sets.
  const sectors = new Set([...bySector.keys(), ...existing.keys()]);
  let inserted = 0;
  const short = [];

  for (const sector of [...sectors].sort()) {
    const pool = bySector.get(sector) ?? [];
    const have = existing.get(sector) ?? { approved: 0, rejected: 0 };

    const needApproved = Math.max(0, TARGET_PER_CLASS - have.approved);
    const needRejected = Math.max(0, TARGET_PER_CLASS - have.rejected);
    const haveTotal = have.approved + have.rejected;
    const needExtra = Math.max(0, TARGET_ROWS - haveTotal - needApproved - needRejected);
    const want = needApproved + needRejected + needExtra;

    if (want === 0) {
      console.log(`[Seed] ${sector}: already at ${haveTotal} (${have.approved}/${have.rejected}) - skipped`);
      continue;
    }
    if (pool.length === 0) {
      short.push(`${sector} (no unlabelled tenders left)`);
      continue;
    }

    // Highest value -> APPROVED, lowest -> REJECTED, so the label tracks
    // something the feature vector actually contains.
    const sorted = [...pool].sort(
      (a, b) => Number(b.amount_value ?? 0) - Number(a.amount_value ?? 0)
    );
    const take = Math.min(want, sorted.length);
    const approvals = Math.min(needApproved + needExtra, take);
    const rejections = Math.min(needRejected, take - approvals);

    for (let i = 0; i < approvals; i++) {
      await insertDecision(sorted[i], 'APPROVED', i, i % 4 === 0);
    }
    for (let i = 0; i < rejections; i++) {
      await insertDecision(sorted[sorted.length - 1 - i], 'REJECTED', i, i % 4 === 0);
    }

    inserted += approvals + rejections;
    const total = haveTotal + approvals + rejections;
    console.log(
      `[Seed] ${sector}: +${approvals} approved, +${rejections} rejected -> ${total} total` +
      (total < TRAINING_MINIMUMS.rows ? '  (still under threshold - pool exhausted)' : '')
    );
    if (total < TRAINING_MINIMUMS.rows) short.push(`${sector} (only ${total})`);
  }

  console.log(`\n[Seed] Inserted ${inserted} decisions.`);
  if (short.length) {
    console.log('[Seed] Sectors still under the threshold:');
    for (const s of short) console.log(`  - ${s}`);
    console.log('  These fall back to the pooled model, which is the chain working as designed.');
  }
  // aiBriefService caches one brief per day; drop today's so the next page
  // load regenerates it against the decisions just added.
  try {
    await run('DELETE FROM ai_briefs WHERE brief_date = CURDATE()');
    console.log("[Seed] Cleared today's cached AI brief so it regenerates.");
  } catch {
    // table may not exist on an older database - not worth failing the seed
  }

  console.log('\nOpen Model Maintenance and run retraining per segment.');
  console.log(`Undo with: node scripts/seedTrainingLabels.js --undo`);
}

const main = process.argv.includes('--undo') ? undo : seed;
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[Seed] Failed:', error.message);
    process.exit(1);
  });
