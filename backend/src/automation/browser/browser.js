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

    await checkRemoteDebuggingAvailable();

    try {

        const browser = await chromium.connectOverCDP(CDP_ENDPOINT);

        return browser;

    } catch (error) {

        throw new Error(
            `Could not connect to Chrome at ${CDP_ENDPOINT}. Make sure Chrome is running with --remote-debugging-port=9222. (${error.message})`
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

    const context = browser.contexts()[0];

    if (!context) {

        throw new Error(
            "No browser context found. Open at least one tab in Chrome before starting the automation."
        );

    }

    const page = context.pages()[0] || await context.newPage();

    return page;

}