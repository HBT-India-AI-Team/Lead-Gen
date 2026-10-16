import { run, all, get } from '../config/database.js';
import { parseJsonColumns, parseJsonColumnsAll } from '../utils/jsonColumns.js';

// Same MariaDB/longtext caveat as tenderRepository.js.
const PROPOSAL_JSON_COLUMNS = [
  'recommended_product',
  'estimated_funding_requirement',
  'rationale',
  'missing_information',
  'raw_ai_response',
];

export async function createProposal({ tenderId, winningCompanyName, proposalSummary, emailDraft }) {
  const result = await run(
    `INSERT INTO tender_proposals (tender_id, winning_company_name, proposal_summary, email_draft, status)
     VALUES (?, ?, ?, ?, 'Draft')`,
    [tenderId, winningCompanyName ?? null, proposalSummary ?? null, emailDraft ?? null]
  );

  return getById(result.lastID);
}

export async function listByTenderId(tenderId) {
  const rows = await all('SELECT * FROM tender_proposals WHERE tender_id = ? ORDER BY id DESC', [tenderId]);
  return parseJsonColumnsAll(rows, PROPOSAL_JSON_COLUMNS);
}

export async function getById(id) {
  const row = await get('SELECT * FROM tender_proposals WHERE id = ?', [id]);
  return parseJsonColumns(row, PROPOSAL_JSON_COLUMNS);
}

export async function approveProposal(id) {
  await run("UPDATE tender_proposals SET status = 'Approved' WHERE id = ?", [id]);
  return getById(id);
}

// ---- PHASE 2: AI-generated structured proposals (Ollama Proposal Agent) ----
// Reuses this same table (per the PHASE 2 spec's "if one exists, reuse it"
// instruction) via the new columns added by
// src/db/migrations/addProposalGenerationSchema.js. Scoped to
// `raw_ai_response IS NOT NULL` so this new idempotent upsert path can
// never collide with — or overwrite — a legacy proposal created by
// createProposal() above (POST /api/tender-proposals), which never sets
// that column.

/**
 * The latest AI-generated proposal for one tender, or null if none exists
 * yet. "Latest" (not "the" row) because nothing prevents a tender from
 * having had a legacy proposal AND a generated one, or (pre-idempotency)
 * multiple generated ones from an earlier bug — ORDER BY id DESC LIMIT 1
 * always resolves to exactly one real row deterministically.
 */
export async function findLatestGeneratedProposalByTenderId(tenderId) {
  const row = await get(
    `SELECT * FROM tender_proposals WHERE tender_id = ? AND raw_ai_response IS NOT NULL ORDER BY id DESC LIMIT 1`,
    [tenderId]
  );
  return parseJsonColumns(row, PROPOSAL_JSON_COLUMNS);
}

/**
 * Idempotent create-or-update for one tender's AI-generated proposal
 * (PHASE 2 spec §11): re-running proposal generation for the same tender
 * updates its existing generated-proposal row in place rather than
 * inserting a duplicate. `winningCompanyName` is written the same way
 * createProposal() already does; every PHASE 2-specific field is stored
 * exactly as the (already-validated) Ollama response provided it, JSON-
 * stringified where the column is JSON — never reshaped or guessed at
 * here.
 */
export async function upsertGeneratedProposal(tenderId, fields) {
  const existing = await findLatestGeneratedProposalByTenderId(tenderId);

  const values = [
    fields.winningCompanyName ?? null,
    fields.proposalSummary ?? null,
    fields.emailBody ?? null,
    fields.emailSubject ?? null,
    JSON.stringify(fields.recommendedProduct ?? null),
    JSON.stringify(fields.estimatedFundingRequirement ?? null),
    fields.proposalScore ?? null,
    JSON.stringify(fields.rationale ?? []),
    JSON.stringify(fields.missingInformation ?? []),
    JSON.stringify(fields.rawAiResponse ?? null),
    fields.status,
  ];

  if (existing) {
    await run(
      `UPDATE tender_proposals SET
         winning_company_name = ?,
         proposal_summary = ?,
         email_draft = ?,
         email_subject = ?,
         recommended_product = ?,
         estimated_funding_requirement = ?,
         proposal_score = ?,
         rationale = ?,
         missing_information = ?,
         raw_ai_response = ?,
         status = ?
       WHERE id = ?`,
      [...values, existing.id]
    );
    return { id: existing.id, created: false };
  }

  const result = await run(
    `INSERT INTO tender_proposals
       (tender_id, winning_company_name, proposal_summary, email_draft, email_subject,
        recommended_product, estimated_funding_requirement, proposal_score, rationale,
        missing_information, raw_ai_response, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenderId, ...values]
  );
  return { id: result.lastID, created: true };
}

// ---- PHASE 3: human review decision on an existing generated proposal ----
// Reuses the same `status` column PHASE 2 already writes proposalStatus
// into (READY_FOR_REVIEW/NEEDS_HUMAN_REVIEW) — a review decision is just
// this same column moving to APPROVED/CHANGES_REQUESTED/REJECTED/ON_HOLD.
// review_comment/reviewed_by/reviewed_at (src/db/migrations/
// addProposalReviewSchema.js) are the only genuinely new fields.

/**
 * Persists a human review decision on an already-generated proposal row.
 * `reviewedBy` is the real authenticated reviewer's name/email (the
 * caller's req.user) — never fabricated. Never creates a row: the caller
 * (proposalPipelineService.reviewProposal()) is responsible for confirming
 * a generated proposal already exists before calling this.
 */
export async function recordProposalReview(id, { status, reviewComment, reviewedBy }) {
  await run(
    `UPDATE tender_proposals
     SET status = ?, review_comment = ?, reviewed_by = ?, reviewed_at = NOW()
     WHERE id = ?`,
    [status, reviewComment ?? null, reviewedBy ?? null, id]
  );
  return getById(id);
}

// ---- PHASE 4: Communication Preparation + Communication Review ----
// Reuses `email_subject`/`email_draft` (PHASE 2) unchanged as the
// communication draft itself — no new email fields. Only
// `communication_status` and its own review audit trail
// (src/db/migrations/addCommunicationPreparationSchema.js) are new.

/**
 * Marks an already-APPROVED proposal's communication draft as prepared.
 * Never touches `status` (the proposal-review outcome) or the email
 * fields — this only ever sets `communication_status`. The caller
 * (communicationPreparationService.prepareCommunication()) is responsible
 * for confirming proposal.status === 'APPROVED' first.
 */
export async function recordCommunicationPreparation(id, { communicationStatus }) {
  await run(`UPDATE tender_proposals SET communication_status = ? WHERE id = ?`, [communicationStatus, id]);
  return getById(id);
}

/**
 * Persists a human Communication Review decision. `reviewedBy` is the real
 * authenticated reviewer (req.user) — never fabricated. Never creates a
 * row: the caller is responsible for confirming a communication draft
 * already exists (communication_status already set) before calling this.
 */
export async function recordCommunicationReview(id, { communicationStatus, reviewComment, reviewedBy }) {
  await run(
    `UPDATE tender_proposals
     SET communication_status = ?, communication_review_comment = ?, communication_approved_by = ?, communication_approved_at = NOW()
     WHERE id = ?`,
    [communicationStatus, reviewComment ?? null, reviewedBy ?? null, id]
  );
  return getById(id);
}

// ---- PHASE 5: real aggregate counts for the Dashboard's Pipeline Status
// section. Both scoped to `raw_ai_response IS NOT NULL` — same reasoning as
// findLatestGeneratedProposalByTenderId() above — so a legacy
// createProposal()/approveProposal() row (POST /api/tender-proposals,
// status only ever 'Draft'/'Approved') never gets counted as a PHASE 2/3/4
// pipeline proposal. No filter/injectable input in either query.

/** Real proposal-review status distribution (READY_FOR_REVIEW/NEEDS_HUMAN_REVIEW/APPROVED/CHANGES_REQUESTED/REJECTED/ON_HOLD) across every generated proposal. */
export async function getProposalStatusCounts() {
  const rows = await all(
    `SELECT status, COUNT(*) AS count FROM tender_proposals WHERE raw_ai_response IS NOT NULL GROUP BY status`
  );
  return rows.map((row) => ({ status: row.status, count: row.count }));
}

/** Real communication-status distribution (DRAFT_READY/AWAITING_SEND_APPROVAL/ON_HOLD/REJECTED, or NULL for "not prepared yet") across every generated proposal. */
export async function getCommunicationStatusCounts() {
  const rows = await all(
    `SELECT communication_status, COUNT(*) AS count FROM tender_proposals WHERE raw_ai_response IS NOT NULL GROUP BY communication_status`
  );
  return rows.map((row) => ({ communicationStatus: row.communication_status, count: row.count }));
}

// ---- Analytics Lead Records: real proposal/communication state for a
// bounded page of tenders. One IN (...) query for the whole page (never a
// per-tender call — see leadController.list, the only caller) — the same
// N+1 avoidance already established by getProposalStatusCounts()/
// getCommunicationStatusCounts() above, just scoped to a specific set of
// tender_ids instead of the whole table. Same `raw_ai_response IS NOT NULL`
// scoping as everywhere else in this file, so a legacy
// createProposal()/approveProposal() row is never surfaced as a real
// Phase 2 pipeline state.

/**
 * Real, latest generated-proposal state (status + communication_status) for
 * each of the given tender_ids that actually has one. Returns one row per
 * tender_id that has a real generated proposal — a tender with none simply
 * has no entry (never a fabricated placeholder row). "Latest" mirrors
 * findLatestGeneratedProposalByTenderId()'s own MAX(id)-per-tender
 * semantics exactly, in case a tender ever ends up with more than one
 * generated-proposal row.
 */
export async function getProposalStateByTenderIds(tenderIds) {
  const ids = [...new Set(tenderIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const rows = await all(
    `SELECT tp.tender_id, tp.status, tp.communication_status
     FROM tender_proposals tp
     INNER JOIN (
       SELECT tender_id, MAX(id) AS max_id
       FROM tender_proposals
       WHERE raw_ai_response IS NOT NULL AND tender_id IN (${placeholders})
       GROUP BY tender_id
     ) latest ON latest.tender_id = tp.tender_id AND latest.max_id = tp.id`,
    ids
  );

  return rows.map((row) => ({
    tenderId: row.tender_id,
    status: row.status,
    communicationStatus: row.communication_status,
  }));
}
