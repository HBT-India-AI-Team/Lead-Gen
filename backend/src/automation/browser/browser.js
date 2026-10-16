import { chromium } from 'playwright';

const CDP_ENDPOINT = "http://localhost:9222";
const CDP_VERSION_URL = `${CDP_ENDPOINT}/json/version`;

/**
 * Confirms Chrome's remote debugging endpoint actually responds before
 * attempting a CDP connection, so a Chrome that was never started (or was
 * closed) fails with a clear message instead of Playwright's raw
 * connection error.
 */
async function checkRemoteDebuggingAvailable() {

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 3000);

    try {

        const response = await fetch(CDP_VERSION_URL, { signal: controller.signal });

        if (!response.ok) {

            throw new Error(`Unexpected response status ${response.status}`);

        }

    } catch (error) {

        throw new Error(
            "Chrome remote debugging is not running. Start Chrome with port 9222"
        );

    } finally {

        clearTimeout(timeout);

    }

}

/**
 * Connects to the already-running Chrome instance via CDP (Chrome must be
 * started with --remote-debugging-port=9222). Wraps the raw Playwright
 * error with a clearer message instead of letting it surface as-is.
 */
export async function connectBrowser() {

    // Two ways in. Locally a developer runs Chrome with remote debugging and
    // watches the scrape happen, which is why that path exists at all. In a
    // container there is no such Chrome and never will be, so the scraper
    // launches its own headless browser instead. CDP stays opt-in through
    // CDP_ENDPOINT so the local workflow is unchanged; everywhere else gets
    // the launch path without configuration.
    if (process.env.CDP_ENDPOINT || process.env.USE_CDP === 'true') {

        await checkRemoteDebuggingAvailable();

        try {

            return await chromium.connectOverCDP(process.env.CDP_ENDPOINT || CDP_ENDPOINT);

        } catch (error) {

            throw new Error(
                `Could not connect to Chrome at ${process.env.CDP_ENDPOINT || CDP_ENDPOINT}. Make sure Chrome is running with --remote-debugging-port=9222. (${error.message})`
            );

        }

    }

    try {

        // --no-sandbox is required under Cloud Run: the container has no user
        // namespaces for Chromium's sandbox to use, and it refuses to start
        // without it.
        return await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });

    } catch (error) {

        throw new Error(
            `Could not launch a headless browser. The image needs Chromium and its system libraries — the Playwright base image in backend/Dockerfile provides both. (${error.message})`
        );

    }

}

/**
 * Connects to Chrome, validates that an open context exists, and returns a
 * usable page — reusing the first open tab if one exists, otherwise
 * opening a new one. Centralizes browser setup so scraper files don't
 * need to touch Playwright connection details directly.
 */
export async function getBrowserPage() {

    const browser = await connectBrowser();

    // A CDP-attached Chrome already has a context; a freshly launched one has
    // none until asked, so create it rather than failing the way the
    // attach-only version had to.
    const context = browser.contexts()[0] || await browser.newContext();

    const page = context.pages()[0] || await context.newPage();

    return page;

}