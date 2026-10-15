import { exec } from '../../config/database.js';

// Idempotent schema migration for the AI extraction layer
// (src/jobs/aiExtraction.js). tender_extractions is a separate table from
// `tenders` (the deterministic metadata_json -> tenders pipeline in
// src/jobs/documentProcessor.js) because this layer's only input is
// scraped_documents.cleaned_text and its natural join key is
// scraped_document_id, not tender_id — cleaned_text never contains the
// tenderId. Mirrors the lead_profiles table's shape/intent (one row per
// scraped_documents row, UNIQUE-constrained, status + error columns so a
// permanently bad record fails once instead of retrying forever).

export async function ensureTenderExtractionsSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS tender_extractions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scraped_document_id INT NOT NULL,
      company VARCHAR(255),
      buyer VARCHAR(255),
      department VARCHAR(255),
      tender_title VARCHAR(500),
      tender_description LONGTEXT,
      estimated_amount VARCHAR(100),
      tender_category VARCHAR(255),
      location VARCHAR(255),
      tender_date VARCHAR(50),
      closing_date VARCHAR(50),
      email VARCHAR(255),
      phone VARCHAR(100),
      website VARCHAR(500),
      gst VARCHAR(50),
      pan VARCHAR(50),
      extraction_status VARCHAR(20) NOT NULL DEFAULT 'Completed',
      error_message TEXT,
      raw_llm_response JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_tender_extractions_document FOREIGN KEY (scraped_document_id) REFERENCES scraped_documents(id) ON DELETE CASCADE,
      CONSTRAINT uq_tender_extractions_document UNIQUE (scraped_document_id),
      CONSTRAINT chk_tender_extractions_status CHECK (extraction_status IN ('Completed', 'Failed'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}