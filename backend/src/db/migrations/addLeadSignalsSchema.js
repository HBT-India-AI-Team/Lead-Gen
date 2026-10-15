import { exec } from '../../config/database.js';

// Minimal persistent storage for generic lead signals — company-level
// events (a new tender, a fresh MCA registration, a GST registration, a
// government scheme approval, etc.) that aren't tied to one specific
// `tenders` row the way qualification is. Deliberately its own table, not
// folded into `tenders` (which stays TenderBook-shaped) and not a `leads`
// table (a "lead" in this app is already a `tenders` row — see
// src/db/migrations/addLeadQualificationSchema.js). No ingestion, API, or
// UI exists yet — this migration only establishes the schema so a future
// phase has somewhere real to write signals, without fabricating any rows
// now.

const SIGNAL_TYPES = [
  'TENDER',
  'NEW_COMPANY_REGISTRATION',
  'GST_REGISTRATION',
  'GOVERNMENT_TENDER_BID',
  'GOVERNMENT_TENDER_WIN',
  'COMPANY_EXPANSION',
  'GOVERNMENT_SCHEME_APPROVAL',
];

export async function ensureLeadSignalsSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS lead_signals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      company_cin VARCHAR(50) NULL,
      signal_type VARCHAR(50) NOT NULL,
      source VARCHAR(100) NULL,
      signal_date DATE NULL,
      title VARCHAR(500) NULL,
      description TEXT NULL,
      value DECIMAL(18,2) NULL,
      location VARCHAR(255) NULL,
      raw_data JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT chk_lead_signals_signal_type CHECK (signal_type IN (${SIGNAL_TYPES.map((t) => `'${t}'`).join(', ')})),
      INDEX idx_lead_signals_company_cin (company_cin),
      INDEX idx_lead_signals_signal_type (signal_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}