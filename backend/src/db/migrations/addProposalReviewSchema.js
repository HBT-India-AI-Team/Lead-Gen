import { exec, get } from '../../config/database.js';

// PHASE 3 schema addition: the smallest columns needed for a human review
// decision on an already-generated proposal. Reuses the EXISTING
// `tender_proposals.status` column for the review decision itself
// (READY_FOR_REVIEW/NEEDS_HUMAN_REVIEW -> APPROVED/CHANGES_REQUESTED/
// REJECTED/ON_HOLD — no CHECK constraint exists on `status` to conflict
// with, and it already holds the PHASE 2 proposalStatus values) rather than
// adding a second, redundant status column. Only the reviewer's comment and
// real identity/timestamp are genuinely new information — added here, and
// only here. Same idempotent guarded-ALTER pattern as every other
// migration in this codebase.

async function columnExists(table, column) {
  const row = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return !!row && row.count > 0;
}

async function addProposalReviewColumns() {
  if (!(await columnExists('tender_proposals', 'review_comment'))) {
    console.log('[DB Migrate] Adding tender_proposals.review_comment...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN review_comment TEXT NULL AFTER status;`);
  }

  // The real authenticated reviewer's name/email (req.user, from the
  // existing JWT auth middleware) — never a fabricated reviewer identity.
  if (!(await columnExists('tender_proposals', 'reviewed_by'))) {
    console.log('[DB Migrate] Adding tender_proposals.reviewed_by...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN reviewed_by VARCHAR(255) NULL AFTER review_comment;`);
  }

  if (!(await columnExists('tender_proposals', 'reviewed_at'))) {
    console.log('[DB Migrate] Adding tender_proposals.reviewed_at...');
    await exec(`ALTER TABLE tender_proposals ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER reviewed_by;`);
  }
}

export async function ensureProposalReviewSchema() {
  await addProposalReviewColumns();
}