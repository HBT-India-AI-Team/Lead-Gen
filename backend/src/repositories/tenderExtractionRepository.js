import { run, all, get } from '../config/database.js';

// Data-access layer for the AI extraction layer's tender_extractions table.

const defaultDb = { run, all, get };

// scraped_documents is shared across every scraper/ingest job; only
// TenderBook rows have the free-text shape this extraction is written
// for (matches the SOURCE_ID used by src/automation/scraper/category.js
// and src/repositories/scrapedDocumentRepository.js).
const TENDERBOOK_SOURCE_ID = 13;

/** TenderBook scraped_documents rows that don't have a tender_extractions row yet. */
export async function findDocumentsPendingExtraction(db = defaultDb) {
  return db.all(
    `SELECT sd.id, sd.cleaned_text
     FROM scraped_documents sd
     JOIN scraping_jobs sj ON sj.id = sd.scraping_job_id
     JOIN source_urls su ON su.id = sj.source_url_id
     LEFT JOIN tender_extractions te ON te.scraped_document_id = sd.id
     WHERE su.source_id = ?
       AND sd.cleaned_text IS NOT NULL
       AND te.id IS NULL
     ORDER BY sd.id`,
    [TENDERBOOK_SOURCE_ID]
  );
}

/**
 * Records one extraction attempt. Always writes a row (success or
 * failure) so a permanently bad document is never retried on every run —
 * findDocumentsPendingExtraction() excludes any scraped_document_id that
 * already has a tender_extractions row, regardless of status.
 */
export async function saveExtraction(record, db = defaultDb) {
  const {
    scrapedDocumentId,
    company = null,
    buyer = null,
    department = null,
    tenderTitle = null,
    tenderDescription = null,
    estimatedAmount = null,
    tenderCategory = null,
    location = null,
    tenderDate = null,
    closingDate = null,
    email = null,
    phone = null,
    website = null,
    gst = null,
    pan = null,
    status = 'Completed',
    errorMessage = null,
    rawLlmResponse = null
  } = record;

  await db.run(
    `INSERT INTO tender_extractions
     (
       scraped_document_id, company, buyer, department, tender_title, tender_description,
       estimated_amount, tender_category, location, tender_date, closing_date,
       email, phone, website, gst, pan,
       extraction_status, error_message, raw_llm_response
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scrapedDocumentId, company, buyer, department, tenderTitle, tenderDescription,
      estimatedAmount, tenderCategory, location, tenderDate, closingDate,
      email, phone, website, gst, pan,
      status, errorMessage, rawLlmResponse ? JSON.stringify(rawLlmResponse) : null
    ]
  );
}