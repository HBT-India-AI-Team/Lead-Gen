import { exec } from '../../config/database.js';

// Idempotent schema migration for the AI Lead Qualification layer
// (src/jobs/leadQualification.js). Independent of the existing
// lead_intelligence layer (src/repositories/leadIntelligenceRepository.js) —
// same combined tenders/tender_extractions input, but a distinct output
// schema (qualification-oriented fields: products/services/certifications/
// competition/complexity/recommendation) and its own pending-work queue, so
// the two layers never block or duplicate each other's runs.
//
// One row per analyzed tender_extractions row (UNIQUE + FK, cascades on
// delete), with a nullable soft FK to the resolved tenders row when one
// exists — mirrors lead_intelligence's shape/rationale exactly (see
// src/db/migrations/addLeadIntelligenceTable.js).

export async function ensureLeadAnalysisSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS lead_analysis (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tender_extraction_id INT NOT NULL,
      tender_id INT NULL,
      industry VARCHAR(255),
      products JSON,
      services JSON,
      buyer_type VARCHAR(255),
      required_experience TEXT,
      required_certifications JSON,
      estimated_project_size VARCHAR(255),
      competition_level VARCHAR(20),
      business_opportunity VARCHAR(500),
      risk_level VARCHAR(20),
      complexity VARCHAR(20),
      confidence_score INT,
      ai_summary TEXT,
      recommendation VARCHAR(20),
      analysis_status VARCHAR(20) NOT NULL DEFAULT 'Completed',
      error_message TEXT,
      raw_llm_response JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_lead_analysis_extraction FOREIGN KEY (tender_extraction_id) REFERENCES tender_extractions(id) ON DELETE CASCADE,
      CONSTRAINT fk_lead_analysis_tender FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE SET NULL,
      CONSTRAINT uq_lead_analysis_extraction UNIQUE (tender_extraction_id),
      CONSTRAINT chk_lead_analysis_competition CHECK (competition_level IS NULL OR competition_level IN ('Low', 'Medium', 'High')),
      CONSTRAINT chk_lead_analysis_risk CHECK (risk_level IS NULL OR risk_level IN ('Low', 'Medium', 'High')),
      CONSTRAINT chk_lead_analysis_complexity CHECK (complexity IS NULL OR complexity IN ('Low', 'Medium', 'High')),
      CONSTRAINT chk_lead_analysis_confidence CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
      CONSTRAINT chk_lead_analysis_recommendation CHECK (recommendation IS NULL OR recommendation IN ('Bid', 'Review', 'Skip')),
      CONSTRAINT chk_lead_analysis_status CHECK (analysis_status IN ('Completed', 'Failed'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}