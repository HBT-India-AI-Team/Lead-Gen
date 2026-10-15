import path from 'path';
import { fileURLToPath } from 'url';
import { run, all, get } from '../config/database.js';
import { SOURCE_ID, processSourceUrl } from './mcaIngest.js';

const __filename = fileURLToPath(import.meta.url);

// Milestone 3b: expands MCA coverage beyond the single unfiltered pull in
// mcaIngest.js by pulling one batch per state via data.gov.in's
// `filters[CompanyStateCode]` param. Reuses processSourceUrl from
// mcaIngest.js unchanged — same fetch/parse/insert logic, per-record
// try/catch, and scraping_jobs/source_urls bookkeeping.
//
// "Already pulled" tracking mirrors the base job's last_scraped_at gating,
// just keyed to state instead of the whole source: each state gets its own
// source_urls row (the filtered URL *is* the state key), so a row with
// last_scraped_at IS NULL means that state hasn't been pulled yet.

const LOG_PREFIX = '[MCA Expand]';
const RESOURCE_BASE_URL = 'https://api.data.gov.in/resource/4dbe5667-7b6b-41d7-82af-211562424d9a';

const STATES = ['Tamil Nadu', 'Maharashtra', 'Delhi', 'Karnataka', 'Gujarat'];

// Confirmed live against the API: CompanyStateCode values are lowercase,
// space-separated ("tamil nadu"), not "Tamil Nadu" or "tamilnadu" — both
// of the latter return zero records.
function stateFilterValue(stateName) {
  return stateName.toLowerCase();
}

function stateSourceUrl(stateName) {
  return `${RESOURCE_BASE_URL}?filters[CompanyStateCode]=${stateFilterValue(stateName)}`;
}

/** Registers a source_urls row per target state if one doesn't already exist yet (idempotent — safe to call every run). */
async function ensureStateSourceUrls() {
  for (const state of STATES) {
    const url = stateSourceUrl(state);
    const existing = await get('SELECT id FROM source_urls WHERE url = ?', [url]);
    if (!existing) {
      await run(
        `INSERT INTO source_urls (source_id, company_id, url, url_type, verification_status)
         VALUES (?, NULL, ?, 'API (State Filter)', 'Verified')`,
        [SOURCE_ID, url]
      );
      console.log(`${LOG_PREFIX} Registered source_url for state "${state}".`);
    }
  }
}

/** Pulls one batch per state that hasn't been scraped yet (mirrors mcaIngest.js's last_scraped_at gating, keyed per-state via the filtered URL). */
export async function runMcaExpand() {
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey) {
    throw new Error('DATA_GOV_IN_API_KEY missing from .env');
  }

  await ensureStateSourceUrls();

  const urlToState = new Map(STATES.map((state) => [stateSourceUrl(state), state]));
  const stateUrls = [...urlToState.keys()];

  const pendingUrls = await all(
    `SELECT * FROM source_urls WHERE source_id = ? AND url IN (?) AND last_scraped_at IS NULL ORDER BY id`,
    [SOURCE_ID, stateUrls]
  );

  if (pendingUrls.length === 0) {
    console.log(`${LOG_PREFIX} No pending states — all target states already pulled.`);
    return;
  }

  console.log(`${LOG_PREFIX} Found ${pendingUrls.length} pending state(s): ${pendingUrls.map((u) => urlToState.get(u.url)).join(', ')}.`);

  for (const sourceUrl of pendingUrls) {
    const state = urlToState.get(sourceUrl.url);
    await processSourceUrl(sourceUrl, apiKey, {
      stateFilterValue: stateFilterValue(state),
      logPrefix: LOG_PREFIX,
      dedupeOnCin: true,
    });
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runMcaExpand()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`${LOG_PREFIX} Fatal error:`, error);
      process.exit(1);
    });
}
