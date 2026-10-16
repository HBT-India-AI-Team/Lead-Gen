import { exec } from '../../config/database.js';

// One AI brief per calendar day. Stored rather than cached in memory so
// every Cloud Run instance, and every restart, serves the same brief from
// a single Gemini call per day.

export async function ensureAiBriefSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ai_briefs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      brief_date DATE NOT NULL,
      headline TEXT NOT NULL,
      bullets JSON NOT NULL,
      facts JSON NULL,
      model VARCHAR(100) NULL,
      provider VARCHAR(30) NULL,
      token_usage JSON NULL,
      latency_ms INT NULL,
      generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ai_briefs_date (brief_date)
    );
  `);
}
