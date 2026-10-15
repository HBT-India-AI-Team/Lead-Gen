import { exec } from '../../config/database.js';

// Idempotent schema for per-category lead scoring/config settings, backing
// the Settings → Lead Management tabbed UI (frontend/src/components/settings/
// LeadCategorySettings.tsx).
//
// NOT YET WIRED: this migration is intentionally not imported/run from
// src/server.js yet, and the matching route (src/routes/settings.js) is not
// mounted. The frontend persists these settings to localStorage and says so
// honestly. Activating the backend is a deliberate two-line change (see the
// TODO block at the bottom of src/routes/settings.js) — until then nothing
// here touches MySQL, so no half-real "saved to DB" claim is made in the UI.
//
// One row per lead category. category_key stores the exact category string
// from the frontend's LEAD_CATEGORY_OPTIONS single source of truth (e.g.
// 'Tender', 'GST registration') rather than a numeric id, because categories
// are a frontend enum today with no categories table to FK against — using
// the stable string keeps this table in step with that list without inventing
// an id space. score_thresholds is JSON so new score types can be added
// without a schema change (they don't exist in the DB yet — see
// scoringRules.js; all four are admin cutoffs not wired to a live score).

export async function ensureLeadCategorySettingsSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS lead_category_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_key VARCHAR(100) NOT NULL,
      tender_value_min BIGINT NOT NULL DEFAULT 0,
      tender_value_max BIGINT NOT NULL DEFAULT 100000000,
      decision_window_days INT NOT NULL DEFAULT 30,
      score_thresholds JSON NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_lead_category_settings_key UNIQUE (category_key),
      CONSTRAINT chk_lcs_value_range CHECK (tender_value_max >= tender_value_min),
      CONSTRAINT chk_lcs_window CHECK (decision_window_days BETWEEN 1 AND 365)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}
