import { exec, get } from '../../config/database.js';

// Company-profile table for the "Health Check" workflow step and the Lead
// Qualification scorer's Probe42 factors. Originally seeded with 4
// fictitious placeholder rows (no real provider integration existed yet);
// as of the real-XLS import (scripts/importProbe42Xls.js), this table holds
// REAL data parsed from uploads/probe42/*.xls, keyed on the real company
// CIN — the fictitious seed rows and the seeding step itself have been
// removed (see importProbe42Xls.js's removeFictitiousDemoRows(), which
// deletes the 4 known-fake CINs on import so qualification never reads
// them again). Table/file names are unchanged from the original demo-era
// naming to avoid an unrelated rename across every file that imports
// ensureProbe42DemoSchema() — only its *contents* changed.
//
// Matching lives entirely behind src/repositories/probe42Repository.js's
// findByCompanyName(), so importing real data never required touching the
// service/controller/route/frontend layers above it.

async function createProbe42DemoTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS probe42_demo_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      cin VARCHAR(50) NULL,
      incorporation_date DATE NULL,
      annual_revenue DECIMAL(18,2) NULL,
      net_profit DECIMAL(18,2) NULL,
      credit_rating VARCHAR(20) NULL,
      compliance_status VARCHAR(50) NULL,
      director_count INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

/** UNIQUE on cin so the importer can upsert (ON DUPLICATE KEY UPDATE) instead of inserting duplicate rows on every re-run. */
async function addCinUniqueConstraint() {
  const existing = await get(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'probe42_demo_profiles' AND index_name = 'uq_probe42_demo_profiles_cin'`
  );
  if (!existing || existing.count === 0) {
    console.log('[DB Migrate] Adding UNIQUE constraint on probe42_demo_profiles.cin...');
    await exec('ALTER TABLE probe42_demo_profiles ADD CONSTRAINT uq_probe42_demo_profiles_cin UNIQUE (cin);');
  }
}

export async function ensureProbe42DemoSchema() {
  await createProbe42DemoTable();
  await addCinUniqueConstraint();
}
