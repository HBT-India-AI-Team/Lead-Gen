import path from 'path';
import { fileURLToPath } from 'url';
import { run, all, get } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);

// Milestone 3: MCA bulk-data downloader/parser. Pulls a batch of company
// records from the data.gov.in resource registered as source id 10, writes
// one scraping_jobs row per source_url processed, and stores each company
// record individually in scraped_documents. PULL_LIMIT caps each run to a
// manageable sample instead of pulling all ~3.67M rows — full incremental
// offset tracking is a later milestone.
//
// processSourceUrl/fetchMcaRecords/buildCleanedText are exported so
// mcaExpand.js (M3b: per-state filtered pulls) reuses the exact same
// fetch/parse/insert logic instead of duplicating it, just supplying a
// `filters[CompanyStateCode]` value, a distinct log prefix, and CIN dedup.

export const SOURCE_ID = 10;
export const RESOURCE_ID = '4dbe5667-7b6b-41d7-82af-211562424d9a';
export const PULL_LIMIT = 50;

// data.gov.in's filter syntax is `filters[FieldName]=value` — confirmed
// live that MySQL LIKE-unsafe brackets are NOT special to fetch(), but
// URLSearchParams would percent-encode the brackets into %5B/%5D, which
// diverges from the human-readable form used elsewhere in the registry.
// Built manually here to match the exact string already verified working.
export function buildApiUrl(apiKey, limit, stateFilterValue = null) {
  const params = new URLSearchParams({ 'api-key': apiKey, format: 'json', limit: String(limit), offset: '0' });
  let url = `https://api.data.gov.in/resource/${RESOURCE_ID}?${params.toString()}`;
  if (stateFilterValue) {
    url += `&filters%5BCompanyStateCode%5D=${encodeURIComponent(stateFilterValue)}`;
  }
  return url;
}

export async function fetchMcaRecords(apiKey, limit, stateFilterValue = null) {
  const res = await fetch(buildApiUrl(apiKey, limit, stateFilterValue));
  if (!res.ok) {
    throw new Error(`MCA API request failed with HTTP ${res.status}`);
  }
  const body = await res.json();
  if (body.status !== 'ok') {
    throw new Error(`MCA API returned an error payload: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.records || [];
}

// Field names are verbatim from the live API (confirmed against source id
// 10's registered details), not the resource page's display labels —
// e.g. "CompanyIndian/Foreign Company" needs bracket access, not dot access.
export function buildCleanedText(record) {
  return [
    `${record.CompanyName} (${record.CIN})`,
    `Status: ${record.CompanyStatus || 'Unknown'}`,
    `Class: ${record.CompanyClass || 'N/A'} | Category: ${record.CompanyCategory || 'N/A'} / ${record.CompanySubCategory || 'N/A'}`,
    `Registered: ${record.CompanyRegistrationdate_date || 'N/A'} | ROC: ${record.CompanyROCcode || 'N/A'} (${record.CompanyStateCode || 'N/A'})`,
    `Authorized Capital: ${record.AuthorizedCapital || 'N/A'} | Paid-up Capital: ${record.PaidupCapital || 'N/A'}`,
    `Indian/Foreign: ${record['CompanyIndian/Foreign Company'] || 'N/A'} | Listing: ${record.Listingstatus || 'N/A'}`,
    `Industry: ${record.CompanyIndustrialClassification || 'N/A'} (NIC: ${record.nic_code || 'N/A'})`,
    `Address: ${record.Registered_Office_Address || 'N/A'}`,
  ].join('\n');
}

/**
 * Runs one scraping_jobs cycle for a single source_urls row: fetch, parse,
 * insert per record (bad rows logged and skipped, not fatal), then mark
 * the job and the source_url done. `stateFilterValue`/`logPrefix`/
 * `dedupeOnCin` let mcaExpand.js (M3b) reuse this unchanged for per-state
 * filtered pulls instead of reimplementing it.
 */
export async function processSourceUrl(sourceUrl, apiKey, { stateFilterValue = null, logPrefix = '[MCA Ingest]', dedupeOnCin = false } = {}) {
  const jobResult = await run(
    `INSERT INTO scraping_jobs (source_url_id, status, started_at) VALUES (?, 'Running', CURRENT_TIMESTAMP)`,
    [sourceUrl.id]
  );
  const jobId = jobResult.lastID;
  console.log(`${logPrefix} Job ${jobId} started for source_url ${sourceUrl.id} (${sourceUrl.url})`);

  try {
    const records = await fetchMcaRecords(apiKey, PULL_LIMIT, stateFilterValue);
    console.log(`${logPrefix} Job ${jobId}: pulled ${records.length} records.`);

    let stored = 0;
    let skipped = 0;
    let failed = 0;

    for (const [index, record] of records.entries()) {
      try {
        if (dedupeOnCin && record?.CIN) {
          const existing = await get(
            `SELECT id FROM scraped_documents WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.CIN')) = ? LIMIT 1`,
            [record.CIN]
          );
          if (existing) {
            skipped++;
            console.log(`${logPrefix} Job ${jobId}: skipping duplicate CIN ${record.CIN} (already stored as scraped_documents id ${existing.id}).`);
            continue;
          }
        }

        await run(
          `INSERT INTO scraped_documents (scraping_job_id, raw_html, cleaned_text, metadata_json) VALUES (?, ?, ?, ?)`,
          [jobId, JSON.stringify(record), buildCleanedText(record), JSON.stringify(record)]
        );
        stored++;
      } catch (recordError) {
        failed++;
        console.error(`${logPrefix} Job ${jobId}: failed to store record #${index} (CIN=${record?.CIN ?? 'unknown'}):`, recordError.message);
      }
    }

    await run(
      `UPDATE scraping_jobs SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, records_found = ? WHERE id = ?`,
      [records.length, jobId]
    );
    await run(
      `UPDATE source_urls SET last_scraped_at = CURRENT_TIMESTAMP, verification_status = 'Verified' WHERE id = ?`,
      [sourceUrl.id]
    );

    console.log(`${logPrefix} Job ${jobId} completed: ${stored} stored, ${skipped} skipped (duplicate CIN), ${failed} failed, out of ${records.length} pulled.`);
  } catch (error) {
    await run(
      `UPDATE scraping_jobs SET status = 'Failed', completed_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?`,
      [error.message, jobId]
    );
    console.error(`${logPrefix} Job ${jobId} failed:`, error.message);
  }
}

/** Processes every source_urls row for the MCA source (id 10) that hasn't been scraped yet (last_scraped_at IS NULL). */
export async function runMcaIngest() {
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey) {
    throw new Error('DATA_GOV_IN_API_KEY missing from .env');
  }

  const pendingUrls = await all(
    `SELECT * FROM source_urls WHERE source_id = ? AND last_scraped_at IS NULL`,
    [SOURCE_ID]
  );

  if (pendingUrls.length === 0) {
    console.log(`[MCA Ingest] No pending source_urls for source id ${SOURCE_ID}.`);
    return;
  }

  console.log(`[MCA Ingest] Found ${pendingUrls.length} pending source_url(s) for source id ${SOURCE_ID}.`);

  for (const sourceUrl of pendingUrls) {
    await processSourceUrl(sourceUrl, apiKey);
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runMcaIngest()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[MCA Ingest] Fatal error:', error);
      process.exit(1);
    });
}
