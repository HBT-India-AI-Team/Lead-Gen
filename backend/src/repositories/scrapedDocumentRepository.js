import { run, all, get } from '../config/database.js';

// Data-access layer for the document-processing pipeline's view of
// scraped_documents (processing_status / processed_at / processing_error).
// Unrelated to src/automation/database/tenderRepository.js, which is the
// scraper's own writer for this table and is not touched by this pipeline.

const defaultDb = { run, all, get };

// scraped_documents is shared across every scraper/ingest job (TenderBook,
// MCA, ...); only TenderBook rows carry the tenderId-based shape this
// pipeline normalizes, so pending documents are scoped to that source
// (matches the SOURCE_ID used by src/automation/scraper/category.js) —
// otherwise every MCA row would get marked Failed for lacking a tenderId.
const TENDERBOOK_SOURCE_ID = 13;

/** Rows the processor hasn't successfully normalized into `tenders` yet. */
export async function findUnprocessedDocuments(db = defaultDb) {
  return db.all(
    `SELECT sd.id, sd.metadata_json
     FROM scraped_documents sd
     JOIN scraping_jobs sj ON sj.id = sd.scraping_job_id
     JOIN source_urls su ON su.id = sj.source_url_id
     WHERE sd.processing_status = 'Pending' AND su.source_id = ?
     ORDER BY sd.id`,
    [TENDERBOOK_SOURCE_ID]
  );
}

export async function markProcessed(documentId, db = defaultDb) {
  await db.run(
    `UPDATE scraped_documents
     SET processing_status = 'Processed', processed_at = NOW(), processing_error = NULL
     WHERE id = ?`,
    [documentId]
  );
}

export async function markFailed(documentId, errorMessage, db = defaultDb) {
  await db.run(
    `UPDATE scraped_documents
     SET processing_status = 'Failed', processed_at = NOW(), processing_error = ?
     WHERE id = ?`,
    [errorMessage, documentId]
  );
}