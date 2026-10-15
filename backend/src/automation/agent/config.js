export const AGENT_CONFIG = {

    LOOKBACK_DAYS: Number(process.env.TENDER_LOOKBACK_DAYS || 30),

    WAIT_BETWEEN_PAGES: 1500,

    WAIT_BETWEEN_CATEGORIES: 2000,

    MAX_RETRIES: 3,

    AUTO_CLOSE_POPUP: true,

    // Visits each new tender's own detail page to pick up fields the listing
    // card doesn't show (EMD, tender fee, contact info, PDF links, exact
    // publish/opening dates). Most of that page is paywalled/login-gated, so
    // this only ever captures what the connected Chrome session can actually
    // see (see src/automation/scraper/detail.js) — never placeholder text.
    // Only runs for tenders not already in the database, since re-visiting
    // known duplicates would multiply request volume for no new data.
    SCRAPE_TENDER_DETAILS: process.env.TENDER_SCRAPE_DETAILS !== "false",

    WAIT_BETWEEN_DETAIL_REQUESTS: 1200,

    LOG_PROGRESS: true,

    SAVE_REPORT: true

};