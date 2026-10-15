-- Adds granular scraping_jobs tracking columns (cards scanned, inserted,
-- duplicate, failed) used by src/automation/database/jobRepository.js.
--
-- records_found is untouched by this migration and keeps storing the
-- inserted count for backward compatibility with src/jobs/cpppScrape.js
-- and src/jobs/mcaIngest.js, which still read/write only that column.
--
-- Run once against an existing database:
--   mysql -u <user> -p sbi_leadgen < migrations/add_scraping_job_stats.sql

ALTER TABLE scraping_jobs ADD COLUMN cards_scanned INT DEFAULT 0 AFTER records_found;
ALTER TABLE scraping_jobs ADD COLUMN inserted_count INT DEFAULT 0 AFTER cards_scanned;
ALTER TABLE scraping_jobs ADD COLUMN duplicate_count INT DEFAULT 0 AFTER inserted_count;
ALTER TABLE scraping_jobs ADD COLUMN failed_count INT DEFAULT 0 AFTER duplicate_count;