// Generic async retry helper for project-level (non-scraper) code — e.g.
// external API calls in src/services/**. Distinct from
// src/automation/utils/retry.js, which backs the scraper's own page/DOM
// operations and is not reused here to keep this layer independent of the
// scraper module.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `fn` up to `retries` times with exponential backoff, re-throwing
 * the last error once attempts are exhausted.
 */
export async function withRetry(fn, { retries = 3, delayMs = 1000, label = 'operation' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`[Retry] ${label} failed on attempt ${attempt}/${retries}: ${error.message}`);

      if (attempt < retries) {
        const backoff = delayMs * 2 ** (attempt - 1);
        await sleep(backoff);
      }
    }
  }

  throw lastError;
}