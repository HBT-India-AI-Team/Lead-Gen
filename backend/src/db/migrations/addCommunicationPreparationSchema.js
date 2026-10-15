import { exec, get } from '../../config/database.js';

// PHASE 4 schema addition: the smallest columns needed for Communication
// Preparation + the human Communication Review decision. Reuses the
// EXISTING `tender_proposals` table (per the PHASE 4 spec's "prefer
// extending tender_proposals... only create a new table if the
// architecture genuinely requires it" instruction) rather than a parallel
// communication table — and reuses `email_subject`/`email_draft` AS the
// communication draft itself (the already-approved proposal's email IS the
// customer-facing communication; PHASE 4 spec §5/§7 explicitly forbid a
// duplicate email field). Only `communication_status` and the review
// audit trail are genuinely new information. Same idempotent
// guarded-ALTER pattern as every other migration in this codebase.

async function columnExists(table, column) {
  const row = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return !!row && row.count > 0;
}

async function addCommunicationColumns() {
  // No CHECK constraint (same reasoning as PHASE 3's status reuse — no
  // existing constraint on this table's string-status columns to conflict
  // with; validity is enforced in leadController.js, the same
  // input-validation-lives-in-the-controller convention already used for
  // the proposal review decision).
  if (!(await columnExists('tender_proposals', 'communication_status'))) {
    console.log('[DB Migrate] Adding tender_proposals.communication_status...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN communication_status VARCHAR(30) NULL AFTER reviewed_at;`);
  }

  if (!(await columnExists('tender_proposals', 'communication_review_comment'))) {
    console.log('[DB Migrate] Adding tender_proposals.communication_review_comment...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN communication_review_comment TEXT NULL AFTER communication_status;`);
  }

  // Real authenticated reviewer identity (req.user) — never fabricated.
  // Named to match the PHASE 4 spec's exact field list even though it also
  // records an ON_HOLD/REJECT decision, not only an approval — it is "who
  // made the latest communication-stage decision".
  if (!(await columnExists('tender_proposals', 'communication_approved_by'))) {
    console.log('[DB Migrate] Adding tender_proposals.communication_approved_by...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN communication_approved_by VARCHAR(255) NULL AFTER communication_review_comment;`);
  }

  if (!(await columnExists('tender_proposals', 'communication_approved_at'))) {
    console.log('[DB Migrate] Adding tender_proposals.communication_approved_at...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN communication_approved_at TIMESTAMP NULL DEFAULT NULL AFTER communication_approved_by;`);
  }
}

export async function ensureCommunicationPreparationSchema() {
  await addCommunicationColumns();
}