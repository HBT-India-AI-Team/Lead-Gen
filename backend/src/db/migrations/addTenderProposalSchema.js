import { exec } from '../../config/database.js';

// `tender_proposals` is a fully separate flow from the pre-existing
// `proposals` table (src/db/schema.sql), which is keyed on
// legacy_companies.id and belongs to the older /api/v1/discovery workflow —
// that table and its routes are untouched. This one is keyed on
// tenders.tender_id (the natural key used everywhere else in the TenderBook
// pipeline) so a proposal is generated from the real tender workflow, not
// the legacy company one.

export async function ensureTenderProposalSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS tender_proposals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tender_id VARCHAR(100) NOT NULL,
      winning_company_name VARCHAR(255) NULL,
      proposal_summary TEXT NULL,
      email_draft LONGTEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Draft',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tender_proposals_tender_id (tender_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}
