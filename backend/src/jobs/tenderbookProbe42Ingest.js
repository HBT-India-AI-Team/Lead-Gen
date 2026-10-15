import path from 'path';
import { fileURLToPath } from 'url';
import { all } from '../config/database.js';
import { runTenderBookAutomation } from '../automation/index.js';
import { runTenderBookWinnerEnrichment } from './tenderbookEnrichWinners.js';
import { qualifyLead } from '../services/leadQualificationPipelineService.js';

const __filename = fileURLToPath(import.meta.url);

const LOG_PREFIX = '[TenderBook Probe42 Ingest]';

// One-off backfill (run by hand — no scheduler exists anywhere in this repo;
// see mcaIngest.js/tenderbookEnrichWinners.js, both invoked the same way):
//   1. Scrape the latest TenderBook tenders (reuses runTenderBookAutomation()
//      unchanged — never re-scrapes categories itself).
//   2. Backfill winning_company_name/winning_bid_amount on any TenderBook
//      tender still missing one (reuses runTenderBookWinnerEnrichment()
//      unchanged).
//   3. For every TenderBook tender that now has a winner but has never
//      completed qualification, run the existing PHASE 1 pipeline
//      (qualifyLead()). That pipeline already does the real Probe42 lookup
//      (probe42Repository.findByCompanyName() — XLS-imported demo profiles,
//      exact/normalized company-name match, confirmed the only matching
//      strategy in use; no live Probe42 API exists in this codebase) and
//      persists the result into tenders.qualification_reason.factors, the
//      one place this app already treats as the source of truth for "what
//      does Probe42 say about this lead" (see addLeadQualificationSchema.js's
//      own comment on that column, and ScoreBreakdown.tsx on the frontend,
//      which reads it directly).
//
// Deliberately reuses qualifyLead() instead of writing a second Probe42
// lookup/write path: this repo already resolves Probe42 data on demand from
// winning_company_name (qualification AND the separate Health Check feature
// both do this — see probe42Repository.js), never by persisting a frozen
// copy of the profile. Adding a second storage location for the same data
// would risk drifting from probe42_demo_profiles after a re-import and
// duplicate a mechanism that already handles "no profile found" correctly
// (factors show unavailable, tender is kept, nothing blocks). One caveat:
// qualification_reason.factors only carries the 5 Probe42-informed SCORING
// factors (availability/revenue/profit/credit rating/compliance) — Probe42's
// incorporation_date isn't a scoring input anywhere in this app today, so
// this backfill doesn't persist it either; it remains resolvable live via
// probe42Repository.findByCompanyName() using the tender's winning_company_name
// (e.g. from the Health Check feature) same as before this job existed.
//
// A winner with no Probe42 match is never treated as a failure here: it's a
// real, successfully qualified tender whose Probe42 factors simply read
// "unavailable" — same business meaning as everywhere else in the app.

async function findQualificationCandidates() {
  return all(`
    SELECT tender_id
    FROM tenders
    WHERE url LIKE '%tenderbook.in%'
      AND winning_company_name IS NOT NULL
      AND qualification_completed_at IS NULL
    ORDER BY id
  `);
}

function parseFactors(tender) {
  if (!tender?.qualification_reason) return null;
  const reason = typeof tender.qualification_reason === 'string'
    ? JSON.parse(tender.qualification_reason)
    : tender.qualification_reason;
  return reason?.factors ?? null;
}

export async function runTenderBookProbe42Ingest() {
  console.log(`${LOG_PREFIX} Step 1/3: scraping latest TenderBook tenders...`);
  await runTenderBookAutomation();

  console.log(`${LOG_PREFIX} Step 2/3: backfilling winning companies on tenders missing one...`);
  const enrichmentResult = await runTenderBookWinnerEnrichment();

  console.log(`${LOG_PREFIX} Step 3/3: linking winning companies to Probe42 profiles via qualification...`);
  const candidates = await findQualificationCandidates();
  console.log(`${LOG_PREFIX} ${candidates.length} tender(s) have a winning company but no completed qualification.`);

  let qualified = 0;
  let probe42Matched = 0;
  let probe42Unmatched = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const tender = await qualifyLead(candidate.tender_id);
      qualified++;

      const factors = parseFactors(tender);
      const matched = Boolean(factors?.probe42Availability?.matched);

      if (matched) {
        probe42Matched++;
        console.log(`${LOG_PREFIX} LINKED  : ${candidate.tender_id} -> Probe42 profile found (score ${tender.qualification_score}).`);
      } else {
        probe42Unmatched++;
        console.log(`${LOG_PREFIX} NO MATCH: ${candidate.tender_id} -> no Probe42 profile for this winner (score ${tender.qualification_score}).`);
      }
    } catch (error) {
      failed++;
      console.log(`${LOG_PREFIX} FAILED  : ${candidate.tender_id} - ${error.message}`);
    }
  }

  const summary = {
    winnersEnriched: enrichmentResult.updated,
    qualificationCandidates: candidates.length,
    qualified,
    probe42Matched,
    probe42Unmatched,
    failed,
  };

  console.log('');
  console.log('==========================================');
  console.log(`${LOG_PREFIX} COMPLETE`);
  console.log('==========================================');
  console.log(`Winning companies backfilled        : ${summary.winnersEnriched}`);
  console.log(`Tenders eligible for qualification  : ${summary.qualificationCandidates}`);
  console.log(`Successfully qualified              : ${summary.qualified}`);
  console.log(`  - matched to a Probe42 profile    : ${summary.probe42Matched}`);
  console.log(`  - no Probe42 profile found        : ${summary.probe42Unmatched}`);
  console.log(`Failed                              : ${summary.failed}`);
  console.log('==========================================');

  return summary;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runTenderBookProbe42Ingest()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`${LOG_PREFIX} Fatal error:`, error);
      process.exit(1);
    });
}