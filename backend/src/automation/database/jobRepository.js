import { run } from "../../config/database.js";

/**
 * Marks any stale 'Running' jobs as Failed before starting a new run.
 */
export async function cleanupStuckJobs(sourceUrlId = null) {
  if (sourceUrlId) {
    await run(
      `UPDATE scraping_jobs
       SET status = 'Failed',
           completed_at = NOW(),
           error_message = 'Interrupted by new job run for this category'
       WHERE status = 'Running' AND source_url_id = ?`,
      [sourceUrlId]
    );
  } else {
    await run(
      `UPDATE scraping_jobs
       SET status = 'Failed',
           completed_at = NOW(),
           error_message = 'Interrupted by new scraping process'
       WHERE status = 'Running'`
    );
  }
}

/**
 * Creates a new job with status = 'Running'
 */
export async function startJob(sourceUrlId) {
  // First, clean up previous running job for this category if any exists
  await cleanupStuckJobs(sourceUrlId);

  const result = await run(
    `INSERT INTO scraping_jobs
     (source_url_id, status, started_at, cards_scanned, inserted_count, duplicate_count, failed_count, records_found)
     VALUES (?, 'Running', NOW(), 0, 0, 0, 0, 0)`,
    [sourceUrlId]
  );

  return result.lastID;
}

/**
 * Optional: Incremental update while scraping is in progress
 */
export async function updateJobProgress(jobId, stats = {}) {
  const {
    cardsScanned = 0,
    inserted = 0,
    duplicates = 0,
    failed = 0
  } = stats;

  await run(
    `UPDATE scraping_jobs
     SET cards_scanned = ?,
         inserted_count = ?,
         duplicate_count = ?,
         failed_count = ?,
         records_found = ?
     WHERE id = ?`,
    [cardsScanned, inserted, duplicates, failed, inserted, jobId]
  );
}

/**
 * Marks job as Completed and writes final numbers
 */
export async function completeJob(jobId, stats = {}) {
  const {
    cardsScanned = 0,
    inserted = 0,
    duplicates = 0,
    skipped = 0,
    failed = 0
  } = stats;

  await run(
    `UPDATE scraping_jobs
     SET status = 'Completed',
         completed_at = NOW(),
         records_found = ?,
         cards_scanned = ?,
         inserted_count = ?,
         duplicate_count = ?,
         skipped_count = ?,
         failed_count = ?
     WHERE id = ?`,
    [inserted, cardsScanned, inserted, duplicates, skipped, failed, jobId]
  );
}

/**
 * Marks job as Failed with error message
 */
export async function failJob(jobId, error) {
  const errorMessage = typeof error === 'object' ? error.message : String(error);

  await run(
    `UPDATE scraping_jobs
     SET status = 'Failed',
         completed_at = NOW(),
         error_message = ?
     WHERE id = ?`,
    [errorMessage, jobId]
  );
}