import { exec, get } from '../../config/database.js';

// Idempotent schema migration for the Lead Qualification workflow (Phase 1).
// Adds the pipeline/lead status + deterministic-scoring columns directly to
// `tenders` — a "lead" in this app IS a tenders row (see tenderRepository.js,
// the "Tender Leads" page, the pre-existing `lead_category` column) — rather
// than a new table, since tenders is the existing structure this workflow
// extends. All columns are nullable/default-safe so the ~1,901 existing rows
// are untouched: every one becomes pipeline_status='IDENTIFYING',
// lead_status='IDENTIFYING' (the documented "new/unprocessed tender" state),
// with every qualification_* column NULL until something actually qualifies
// that row. Guarded by information_schema checks, same pattern as every
// other tenders column added in src/db/migrations/addDocumentProcessingSchema.js
// — safe to call on every boot.
//
// Two separate status columns, never merged into one field, matching the
// business requirement that Pipeline Status (workflow stage) and Lead
// Status (qualification outcome) are distinct concepts.

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

const PIPELINE_STATUSES = [
  'IDENTIFYING',
  'READY_FOR_QUALIFY',
  'QUALIFYING',
  'READY_FOR_PROPOSAL',
  'AWAITING_PROPOSAL_REVIEW',
  'AWAITING_QUALITY_REVIEW',
  'ON_HOLD',
];

const LEAD_STATUSES = [
  'IDENTIFYING',
  'QUALIFY',
  'QUALIFIED_BAD',
  'QUALIFIED_HITL',
  'QUALIFIED_GOOD',
];

async function addPipelineStatusColumn() {
  if (!(await columnExists('tenders', 'pipeline_status'))) {
    console.log('[DB Migrate] Adding tenders.pipeline_status...');
    await exec(`ALTER TABLE tenders ADD COLUMN pipeline_status VARCHAR(30) NOT NULL DEFAULT 'IDENTIFYING';`);
  }

  if (!(await checkConstraintExists('chk_tenders_pipeline_status'))) {
    console.log('[DB Migrate] Constraining tenders.pipeline_status...');
    await exec(`
      ALTER TABLE tenders ADD CONSTRAINT chk_tenders_pipeline_status
        CHECK (pipeline_status IN (${PIPELINE_STATUSES.map((s) => `'${s}'`).join(', ')}));
    `);
  }
}

async function addLeadStatusColumn() {
  if (!(await columnExists('tenders', 'lead_status'))) {
    console.log('[DB Migrate] Adding tenders.lead_status...');
    await exec(`ALTER TABLE tenders ADD COLUMN lead_status VARCHAR(30) NOT NULL DEFAULT 'IDENTIFYING' AFTER pipeline_status;`);
  }

  if (!(await checkConstraintExists('chk_tenders_lead_status'))) {
    console.log('[DB Migrate] Constraining tenders.lead_status...');
    await exec(`
      ALTER TABLE tenders ADD CONSTRAINT chk_tenders_lead_status
        CHECK (lead_status IN (${LEAD_STATUSES.map((s) => `'${s}'`).join(', ')}));
    `);
  }
}

async function addQualificationResultColumns() {
  if (!(await columnExists('tenders', 'qualification_score'))) {
    console.log('[DB Migrate] Adding tenders.qualification_score...');
    await exec(`ALTER TABLE tenders ADD COLUMN qualification_score INT NULL AFTER lead_status;`);
  }

  if (!(await checkConstraintExists('chk_tenders_qualification_score'))) {
    console.log('[DB Migrate] Constraining tenders.qualification_score...');
    await exec(`
      ALTER TABLE tenders ADD CONSTRAINT chk_tenders_qualification_score
        CHECK (qualification_score IS NULL OR qualification_score BETWEEN 0 AND 100);
    `);
  }

  // JSON, not TEXT: stores the structured, named scoring factors (see
  // src/services/scoring/qualificationRules.js) so the UI can later render
  // "why this score" without re-deriving it — never free-text.
  if (!(await columnExists('tenders', 'qualification_reason'))) {
    console.log('[DB Migrate] Adding tenders.qualification_reason...');
    await exec(`ALTER TABLE tenders ADD COLUMN qualification_reason JSON NULL AFTER qualification_score;`);
  }

  if (!(await columnExists('tenders', 'qualification_completed_at'))) {
    console.log('[DB Migrate] Adding tenders.qualification_completed_at...');
    await exec(`ALTER TABLE tenders ADD COLUMN qualification_completed_at TIMESTAMP NULL DEFAULT NULL AFTER qualification_reason;`);
  }

  if (!(await columnExists('tenders', 'qualification_error'))) {
    console.log('[DB Migrate] Adding tenders.qualification_error...');
    await exec(`ALTER TABLE tenders ADD COLUMN qualification_error TEXT NULL AFTER qualification_completed_at;`);
  }
}

export async function ensureLeadQualificationSchema() {
  await addPipelineStatusColumn();
  await addLeadStatusColumn();
  await addQualificationResultColumns();
}