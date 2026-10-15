import { exec } from '../../config/database.js';

// Idempotent schema migration for the Lead Intelligence layer
// (src/jobs/leadIntelligence.js). One row per analyzed tender_extractions
// row (UNIQUE + FK, cascades on delete), with a nullable soft FK to the
// resolved tenders row when one exists — the join between the two isn't
// direct (see src/repositories/leadIntelligenceRepository.js), so not
// every tender_extractions row is guaranteed to resolve one.

export async function ensureLeadIntelligenceSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS lead_intelligence (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tender_extraction_id INT NOT NULL,
      tender_id INT NULL,
      company_type VARCHAR(255),
      buyer_type VARCHAR(255),
      business_opportunity VARCHAR(500),
      industry VARCHAR(255),
      opportunity_summary TEXT,
      suggested_sales_strategy TEXT,
      decision_maker_type VARCHAR(255),
      estimated_procurement_size VARCHAR(255),
      risk_factors JSON,
      opportunity_score INT,
      lead_priority VARCHAR(20),
      ai_reasoning TEXT,
      analysis_status VARCHAR(20) NOT NULL DEFAULT 'Completed',
      error_message TEXT,
      raw_llm_response JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_lead_intelligence_extraction FOREIGN KEY (tender_extraction_id) REFERENCES tender_extractions(id) ON DELETE CASCADE,
      CONSTRAINT fk_lead_intelligence_tender FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE SET NULL,
      CONSTRAINT uq_lead_intelligence_extraction UNIQUE (tender_extraction_id),
      CONSTRAINT chk_lead_intelligence_score CHECK (opportunity_score BETWEEN 0 AND 100),
      CONSTRAINT chk_lead_intelligence_priority CHECK (lead_priority IN ('Hot', 'Warm', 'Cold')),
      CONSTRAINT chk_lead_intelligence_status CHECK (analysis_status IN ('Completed', 'Failed'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}