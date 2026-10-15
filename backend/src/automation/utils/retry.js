import { AGENT_CONFIG } from "../agent/config.js";
import { logger } from "./logger.js";

/**
 * Retries an async operation up to AGENT_CONFIG.MAX_RETRIES times, waiting
 * `delayMs` between attempts, and re-throws the last error once retries
 * are exhausted. Used to harden page navigation, popup close, and database
 * insert calls against transient failures without changing their logic.
 */
export async function withRetry(fn, options = {}) {

    const maxRetries = options.retries ?? AGENT_CONFIG.MAX_RETRIES;
    const delayMs = options.delayMs ?? 1000;
    const label = options.label ?? "operation";

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {

        try {

            return await fn();

        } catch (error) {

            lastError = error;

            logger.warn(
                `Retry ${attempt}/${maxRetries} failed for ${label}: ${error.message}`
            );

            if (attempt < maxRetries) {

                await new Promise(resolve => setTimeout(resolve, delayMs));

            }

        }

    }

    throw lastError;

}