import { exec, get } from '../../config/database.js';

// Idempotent schema migration for the scraped_documents -> tenders
// normalization pipeline (src/jobs/documentProcessor.js). Each step is
// guarded by an information_schema check, matching the guarded-ALTER style
// already used in src/db/init.js, so this is safe to call on every job run
// instead of relying on a separate manual migration step.
//
// `tenders` already exists in the live database (created ad hoc for
// src/jobs/migrateTenderData.js) but was never added to schema.sql — the
// CREATE TABLE IF NOT EXISTS below documents its real shape and brings
// fresh installs in line with it.

async function columnExists(table, column) {
  const row = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return !!row && row.count > 0;
}

async function checkConstraintExists(name) {
  const row = await get(
    `SELECT COUNT(*) AS count FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = ?`,
    [name]
  );
  return !!row && row.count > 0;
}

async function createTendersTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS tenders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tender_id VARCHAR(100) UNIQUE,
      title VARCHAR(255),
      description LONGTEXT,
      category VARCHAR(255),
      location VARCHAR(255),
      amount VARCHAR(100),
      amount_value DECIMAL(18,2),
      contract_date VARCHAR(50),
      url TEXT,
      source VARCHAR(100) DEFAULT 'TenderBook',
      company_name VARCHAR(255),
      company_website VARCHAR(500),
      contact_person VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(100),
      gst VARCHAR(50),
      cin VARCHAR(50),
      state VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tender_type VARCHAR(255),
      closing_date VARCHAR(50),
      tender_city VARCHAR(150),
      tender_state VARCHAR(150),
      district VARCHAR(150),
      lead_category VARCHAR(100),
      emd_amount VARCHAR(100),
      tender_fee VARCHAR(100),
      buyer_department VARCHAR(255),
      publish_date VARCHAR(50),
      opening_date VARCHAR(50),
      pdf_url TEXT,
      buyer_contact_person VARCHAR(255),
      buyer_contact_phone VARCHAR(100),
      buyer_contact_email VARCHAR(255),
      buyer_address TEXT,
      winning_company_name VARCHAR(255),
      winning_bid_amount VARCHAR(100),
      winning_bid_amount_value DECIMAL(18,2)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

// TenderBook-enrichment columns added on top of the original tenders shape
// above. Named distinctly from the pre-existing state/contact_person/email/
// phone columns (which are documented MCA-ingest-pipeline territory — see
// src/repositories/tenderRepository.js) because they mean something
// different: tender_state/tender_city is where the CONTRACT is located,
// buyer_contact_* is the tender-issuing office's contact, not the bidding
// company's. Reusing the MCA columns would silently conflate the two.
const TENDERBOOK_ENRICHMENT_COLUMNS = [
  ["tender_type", "VARCHAR(255)"],
  ["closing_date", "VARCHAR(50)"],
  ["tender_city", "VARCHAR(150)"],
  ["tender_state", "VARCHAR(150)"],
  ["district", "VARCHAR(150)"],
  ["emd_amount", "VARCHAR(100)"],
  ["tender_fee", "VARCHAR(100)"],
  ["buyer_department", "VARCHAR(255)"],
  ["publish_date", "VARCHAR(50)"],
  ["opening_date", "VARCHAR(50)"],
  ["pdf_url", "TEXT"],
  ["buyer_contact_person", "VARCHAR(255)"],
  ["buyer_contact_phone", "VARCHAR(100)"],
  ["buyer_contact_email", "VARCHAR(255)"],
  ["buyer_address", "TEXT"],
];

/** Adds the enrichment columns above to an already-existing `tenders` table (CREATE TABLE IF NOT EXISTS alone won't touch it). */
async function addTenderBookEnrichmentColumns() {
  for (const [column, type] of TENDERBOOK_ENRICHMENT_COLUMNS) {
    if (!(await columnExists('tenders', column))) {
      console.log(`[DB Migrate] Adding tenders.${column}...`);
      await exec(`ALTER TABLE tenders ADD COLUMN ${column} ${type};`);
    }
  }
}

/** Adds winning_company_name / winning_bid_amount(_value) to `tenders` — populated from the Tender Detail page's Bidders info (see src/automation/scraper/detail.js). Most tenders won't have these populated unless the scraping account's session is entitled to see them; the columns stay nullable. */
async function addWinnerColumns() {
  if (!(await columnExists('tenders', 'winning_company_name'))) {
    console.log('[DB Migrate] Adding tenders.winning_company_name...');
    await exec(`ALTER TABLE tenders ADD COLUMN winning_company_name VARCHAR(255) NULL AFTER amount_value;`);
  }

  if (!(await columnExists('tenders', 'winning_bid_amount'))) {
    console.log('[DB Migrate] Adding tenders.winning_bid_amount...');
    await exec(`ALTER TABLE tenders ADD COLUMN winning_bid_amount VARCHAR(100) NULL AFTER winning_company_name;`);
  }

  if (!(await columnExists('tenders', 'winning_bid_amount_value'))) {
    console.log('[DB Migrate] Adding tenders.winning_bid_amount_value...');
    await exec(`ALTER TABLE tenders ADD COLUMN winning_bid_amount_value DECIMAL(18,2) NULL AFTER winning_bid_amount;`);
  }
}

/**
 * Adds `lead_category` to `tenders` — a manual/future classification field,
 * distinct from the scraped `category` (tender subject) column, which stays
 * untouched. No source ingests a real value for this yet, so it's added
 * nullable and left NULL on every existing row rather than backfilled with
 * a derived or fabricated guess; the Lead Category filter is expected to
 * return zero rows until a real classification pipeline populates it.
 */
async function addLeadCategoryColumn() {
  if (!(await columnExists('tenders', 'lead_category'))) {
    console.log('[DB Migrate] Adding tenders.lead_category...');
    await exec(`ALTER TABLE tenders ADD COLUMN lead_category VARCHAR(100) NULL;`);
  }
}

/**
 * Adds `tender_district` to `tenders` — real District support alongside the
 * existing tender_state/tender_city columns. Distinct from the pre-existing
 * `district` column (which no source has ever populated — see
 * src/services/intelligence/documentProcessorService.js), so adding this
 * doesn't touch that column or any code path that reads it. Nullable and
 * left NULL on every existing row: no source currently supplies a district
 * value, so nothing is backfilled or guessed.
 */
async function addTenderDistrictColumn() {
  if (!(await columnExists('tenders', 'tender_district'))) {
    console.log('[DB Migrate] Adding tenders.tender_district...');
    await exec(`ALTER TABLE tenders ADD COLUMN tender_district VARCHAR(255) NULL AFTER tender_state;`);
  }
}

/** Adds processing_status / processed_at / processing_error to scraped_documents so the processor can tell which rows it has already normalized. */
async function addProcessingColumns() {
  if (!(await columnExists('scraped_documents', 'processing_status'))) {
    console.log('[DB Migrate] Adding scraped_documents.processing_status...');
    await exec(`ALTER TABLE scraped_documents ADD COLUMN processing_status VARCHAR(20) NOT NULL DEFAULT 'Pending' AFTER metadata_json;`);
  }

  if (!(await columnExists('scraped_documents', 'processed_at'))) {
    console.log('[DB Migrate] Adding scraped_documents.processed_at...');
    await exec(`ALTER TABLE scraped_documents ADD COLUMN processed_at TIMESTAMP NULL DEFAULT NULL AFTER processing_status;`);
  }

  if (!(await columnExists('scraped_documents', 'processing_error'))) {
    console.log('[DB Migrate] Adding scraped_documents.processing_error...');
    await exec(`ALTER TABLE scraped_documents ADD COLUMN processing_error TEXT NULL AFTER processed_at;`);
  }

  if (!(await checkConstraintExists('chk_scraped_documents_processing_status'))) {
    console.log('[DB Migrate] Constraining scraped_documents.processing_status...');
    await exec(`
      UPDATE scraped_documents SET processing_status = 'Pending'
        WHERE processing_status IS NULL OR processing_status NOT IN ('Pending', 'Processed', 'Failed');
      ALTER TABLE scraped_documents ADD CONSTRAINT chk_scraped_documents_processing_status
        CHECK (processing_status IN ('Pending', 'Processed', 'Failed'));
    `);
  }
}

/**
 * Adds a generated (virtual) column that lifts metadata_json->>'$.tenderId'
 * into a real, indexable column, plus a non-unique index on it. Every
 * dedup check (tenderExists()) was doing a full-table JSON_EXTRACT scan
 * before this; at 2,400+ rows and growing that's already a real cost.
 *
 * Deliberately NOT a UNIQUE index: this audit found 21 pre-existing
 * tenderId pairs already in the live table (two concurrent scraping_jobs
 * both passed the pre-insert SELECT check before either committed — see
 * scripts/findDuplicateTenders.js). A UNIQUE index would refuse to apply
 * until those rows are deduped, and this migration must stay non-destructive
 * on every boot. Run scripts/findDuplicateTenders.js to review the 21
 * groups and scripts/dedupeTenders.js to clean them up when ready, then
 * this index can be upgraded to UNIQUE.
 */
async function addScrapedDocumentsTenderIdIndex() {
  if (!(await columnExists('scraped_documents', 'tender_id_gen'))) {
    console.log('[DB Migrate] Adding scraped_documents.tender_id_gen (generated column)...');
    await exec(`
      ALTER TABLE scraped_documents
      ADD COLUMN tender_id_gen VARCHAR(100)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.tenderId'))) VIRTUAL;
    `);
  }

  const indexExists = await get(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'scraped_documents' AND index_name = 'idx_scraped_documents_tender_id_gen'`
  );
  if (!indexExists || indexExists.count === 0) {
    console.log('[DB Migrate] Indexing scraped_documents.tender_id_gen...');
    await exec('CREATE INDEX idx_scraped_documents_tender_id_gen ON scraped_documents (tender_id_gen);');
  }
}

/** Adds skipped_count to scraping_jobs, tracking cards with no parseable stable tender ID (see src/automation/scraper/scraper.js). */
async function addScrapingJobsSkippedCount() {
  if (!(await columnExists('scraping_jobs', 'skipped_count'))) {
    console.log('[DB Migrate] Adding scraping_jobs.skipped_count...');
    await exec("ALTER TABLE scraping_jobs ADD COLUMN skipped_count INT DEFAULT 0 AFTER duplicate_count;");
  }
}

export async function ensureDocumentProcessingSchema() {
  await createTendersTable();
  await addProcessingColumns();
  await addTenderBookEnrichmentColumns();
  await addWinnerColumns();
  await addLeadCategoryColumn();
  await addTenderDistrictColumn();
  await addScrapedDocumentsTenderIdIndex();
  await addScrapingJobsSkippedCount();
}
