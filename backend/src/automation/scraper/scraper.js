import { gotoPage } from "./pagination.js";
import { closePopup } from "./popup.js";
import { parseTenderCards } from "./parser.js";
import { scrapeTenderDetail } from "./detail.js";
import { saveTender, tenderExists } from "../database/tenderRepository.js";
import { AGENT_CONFIG } from "../agent/config.js";
import { logger } from "../utils/logger.js";
import { progress } from "../agent/progress.js";
import { withRetry } from "../utils/retry.js";

const LOOKBACK_DAYS = AGENT_CONFIG.LOOKBACK_DAYS;

const MAX_PAGES = 500;

// contractDate/closingDate arrive already normalized to ISO YYYY-MM-DD by
// parser.js (see normalize.js's normalizeDate) — parsed manually rather
// than via `new Date(isoString)` to avoid that call's UTC-vs-local
// timezone shift landing on the wrong calendar day for the lookback check.
function parseDate(isoDateString) {

    if (!isoDateString) return null;

    const [year, month, day] = isoDateString.split("-").map(Number);

    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);

}

export async function scrapeCategory(
    page,
    categoryUrl,
    jobId
) {

    const cutoffDate = new Date();

    cutoffDate.setDate(
        cutoffDate.getDate() - LOOKBACK_DAYS
    );

    let pageNumber = 0;

    let cardsProcessed = 0;

    let inserted = 0;

    let duplicates = 0;

    let skipped = 0;

    let failed = 0;

    const startTime = Date.now();

    while (true) {

        if (pageNumber >= MAX_PAGES) {

            console.log("");
            console.log("--------------------------------------");
            console.log(`Reached MAX_PAGES limit (${MAX_PAGES}).`);
            console.log("Stopping pagination.");
            console.log("--------------------------------------");

            logger.warn(
                `Max pages limit reached (${MAX_PAGES}) for ${categoryUrl}. Stopping pagination.`
            );

            // This page was never attempted, so keep the reported page
            // count accurate against the `pageNumber + 1` formula below.
            pageNumber--;

            break;

        }

        console.log("");
        console.log("==========================================");
        console.log(`Scraping Page ${pageNumber + 1}`);
        console.log("==========================================");

        logger.info(`Page start: page ${pageNumber + 1} (${categoryUrl})`);

        const hasNextPage = await withRetry(
            () => gotoPage(page, categoryUrl, pageNumber),
            { label: `page navigation (page ${pageNumber + 1})` }
        );

        if (!hasNextPage) {

            console.log("Next page does not exist.");

            logger.info(`Next page does not exist (page ${pageNumber + 1}). Stopping pagination.`);

            // This page never actually loaded, so keep the reported page
            // count accurate against the `pageNumber + 1` formula below.
            pageNumber--;

            break;

        }

        progress.setPage(pageNumber + 1);
        progress.incrementPage();

        if (AGENT_CONFIG.AUTO_CLOSE_POPUP) {

            await withRetry(
                () => closePopup(page),
                { label: "popup close" }
            );

        }

        const tenders = await parseTenderCards(page);

        if (tenders.length === 0) {

            console.log("No cards found.");

            break;

        }

        console.log(`${tenders.length} cards detected`);

        logger.info(`Cards found: ${tenders.length} (page ${pageNumber + 1})`);

        let allTendersOlderThanLookback = true;

        for (const tender of tenders) {

            try {

                cardsProcessed++;

                progress.setCard(cardsProcessed);
                progress.incrementCard();

                const contractDate = parseDate(
                    tender.contractDate
                );

                const isOlderThanLookback =
                    contractDate &&
                    contractDate < cutoffDate;

                if (!isOlderThanLookback) {

                    allTendersOlderThanLookback = false;

                }

                if (isOlderThanLookback) {

                    continue;

                }

                if (!tender.tenderId) {

                    skipped++;

                    progress.incrementFailed();

                    console.log(`Skipped (no stable tender ID) : ${tender.title}`);

                    logger.warn(`Skipped card with no parseable tender URL: ${tender.title}`);

                    continue;

                }

                const alreadyExists = await tenderExists(tender.tenderId);

                if (alreadyExists) {

                    duplicates++;

                    progress.incrementDuplicate();

                    console.log(`Duplicate : ${tender.title}`);

                    logger.info(`Duplicate detected: ${tender.title}`);

                    continue;

                }

                if (AGENT_CONFIG.SCRAPE_TENDER_DETAILS) {

                    const detailFields = await withRetry(
                        () => scrapeTenderDetail(page, tender),
                        { label: `detail page (${tender.tenderId})`, retries: 2 }
                    );

                    Object.assign(tender, detailFields);

                    // Detail scraping navigated `page` away from the listing —
                    // parseTenderCards() already ran for this listing page, so
                    // the next loop iteration's gotoPage() re-navigating for
                    // page N+1 is the only navigation still needed.
                    await page.waitForTimeout(AGENT_CONFIG.WAIT_BETWEEN_DETAIL_REQUESTS);

                }

                const result =
                    await withRetry(
                        () => saveTender(jobId, tender),
                        { label: `database insert (${tender.title})` }
                    );

                if (result.inserted) {

                    inserted++;

                    progress.incrementInserted();

                    console.log(
                        `✔ Saved : ${tender.title}`
                    );

                    logger.info(`Insert success: ${tender.title}`);

                } else if (result.skipped) {

                    skipped++;

                    console.log(`Skipped : ${tender.title}`);

                    logger.warn(`Skipped at save (no stable tender ID): ${tender.title}`);

                } else {

                    duplicates++;

                    progress.incrementDuplicate();

                    console.log(
                        `Duplicate : ${tender.title}`
                    );

                    logger.info(`Duplicate detected: ${tender.title}`);

                }

            } catch (error) {

                failed++;

                progress.incrementFailed();

                console.log(
                    `Failed : ${tender.title}`
                );

                console.log(error.message);

                logger.error(`Insert failed: ${tender.title} - ${error.message}`);

            }

        }

        if (allTendersOlderThanLookback) {

            console.log("");
            console.log("--------------------------------------");
            console.log("Stopping because tenders are older than lookback period");
            console.log("--------------------------------------");

            logger.info("Stopping because tenders are older than lookback period");

            break;

        }

        pageNumber++;

        await page.waitForTimeout(AGENT_CONFIG.WAIT_BETWEEN_PAGES);

    }

    const processingTimeSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("");
    console.log("==========================================");
    console.log("SCRAPING COMPLETED");
    console.log("==========================================");

    console.log(`Category         : ${categoryUrl}`);
    console.log(`Pages            : ${pageNumber + 1}`);
    console.log(`Tender Count     : ${cardsProcessed}`);
    console.log(`Inserted         : ${inserted}`);
    console.log(`Duplicates       : ${duplicates}`);
    console.log(`Skipped          : ${skipped}`);
    console.log(`Errors           : ${failed}`);
    console.log(`Processing Time  : ${processingTimeSec}s`);

    console.log("==========================================");

    logger.info(
        `Category summary: ${categoryUrl} — pages ${pageNumber + 1}, tenders ${cardsProcessed}, ` +
        `inserted ${inserted}, duplicates ${duplicates}, skipped ${skipped}, errors ${failed}, ` +
        `time ${processingTimeSec}s`
    );

    return {

        pages: pageNumber + 1,

        totalCards: cardsProcessed,

        inserted,

        duplicates,

        skipped,

        failed,

        processingTimeSec: Number(processingTimeSec)

    };

}