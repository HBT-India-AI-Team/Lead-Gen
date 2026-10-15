import { exec, get } from '../../config/database.js';

// PHASE 2 schema addition: extends the EXISTING `tender_proposals` table
// (src/db/migrations/addTenderProposalSchema.js) with the structured fields
// the Ollama Proposal Agent produces, rather than creating a new table —
// per the PHASE 2 spec's explicit "if one exists, reuse it" instruction.
// The legacy columns (proposal_summary, email_draft, status) and the legacy
// generation path (tenderProposalService.js / POST /api/tender-proposals)
// are completely untouched; this only adds new nullable columns alongside
// them. Guarded by information_schema checks, same idempotent pattern as
// every other ALTER TABLE migration in this codebase
// (addLeadQualificationSchema.js, addDocumentProcessingSchema.js) — safe to
// call on every boot.
//
// JSON columns hold the structured Ollama output as-is (recommended
// product, funding estimate, rationale, missing-information list) rather
// than being normalized into more columns, per the spec's "use JSON where
// appropriate rather than creating excessive columns" instruction.
// `proposal_score` stays its own nullable INT (mirrors
// tenders.qualification_score's exact shape/CHECK) since it's the one
// scalar the PHASE 2 spec explicitly calls out as sortable/queryable later
// — and is genuinely NULL whenever no approved scoring methodology backs a
// number, never defaulted.

async function columnExists(table, column) {
  const row = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return !!row && row.count > 0;
}

async function checkConstraintExists(name) {
  const row = await get(
    `SELECT COUNT(*) AS count FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = ?`,
    [name]
  );
  return !!row && row.count > 0;
}

async function addProposalGenerationColumns() {
  if (!(await columnExists('tender_proposals', 'email_subject'))) {
    console.log('[DB Migrate] Adding tender_proposals.email_subject...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN email_subject VARCHAR(500) NULL AFTER email_draft;`);
  }

  if (!(await columnExists('tender_proposals', 'recommended_product'))) {
    console.log('[DB Migrate] Adding tender_proposals.recommended_product...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN recommended_product JSON NULL AFTER email_subject;`);
  }

  if (!(await columnExists('tender_proposals', 'estimated_funding_requirement'))) {
    console.log('[DB Migrate] Adding tender_proposals.estimated_funding_requirement...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN estimated_funding_requirement JSON NULL AFTER recommended_product;`);
  }

  if (!(await columnExists('tender_proposals', 'proposal_score'))) {
    console.log('[DB Migrate] Adding tender_proposals.proposal_score...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN proposal_score INT NULL AFTER estimated_funding_requirement;`);
  }

  if (!(await checkConstraintExists('chk_tender_proposals_proposal_score'))) {
    console.log('[DB Migrate] Constraining tender_proposals.proposal_score...');
    await exec(`
      ALTER TABLE tender_proposals ADD CONSTRAINT chk_tender_proposals_proposal_score
        CHECK (proposal_score IS NULL OR proposal_score BETWEEN 0 AND 100);
    `);
  }

  if (!(await columnExists('tender_proposals', 'rationale'))) {
    console.log('[DB Migrate] Adding tender_proposals.rationale...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN rationale JSON NULL AFTER proposal_score;`);
  }

  if (!(await columnExists('tender_proposals', 'missing_information'))) {
    console.log('[DB Migrate] Adding tender_proposals.missing_information...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN missing_information JSON NULL AFTER rationale;`);
  }

  // Full, unmodified Ollama JSON response — kept verbatim alongside the
  // structured columns above (which are extracted from it) so nothing about
  // what the model actually returned is ever lost, matching the
  // qualification_reason.aiAnalysis precedent (PHASE 1).
  if (!(await columnExists('tender_proposals', 'raw_ai_response'))) {
    console.log('[DB Migrate] Adding tender_proposals.raw_ai_response...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN raw_ai_response JSON NULL AFTER missing_information;`);
  }
}

export async function ensureProposalGenerationSchema() {
  await addProposalGenerationColumns();
}