import { all, run } from "../../config/database.js";
import { getBrowserPage } from "../browser/browser.js";
import { scrapeCategory } from "./scraper.js";
import { startJob, completeJob, failJob } from "../database/jobRepository.js";
import { logger } from "../utils/logger.js";
import { printRunSummary } from "../agent/report.js";

const SOURCE_ID = 13;

export async function scrapeAllCategories() {

    console.log("");
    console.log("========================================");
    console.log("TenderBook Scraper Started");
    console.log("========================================");

    const categories = await all(
        `
        SELECT *
        FROM source_urls
        WHERE source_id = ?
        ORDER BY id
        `,
        [SOURCE_ID]
    );

    if (categories.length === 0) {

        console.log("No categories found.");

        return;

    }

    console.log(`${categories.length} Categories Found`);

    const page = await getBrowserPage();

    const runStart = Date.now();

    let successfulCategories = 0;
    let failedCategories = 0;
    let totalCardsScanned = 0;
    let totalInserted = 0;
    let totalDuplicates = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const category of categories) {

        console.log("");
        console.log("========================================");
        console.log("CATEGORY URL:", category.url);
        console.log("========================================");

        const jobId = await startJob(category.id);

        try {

            const result = await scrapeCategory(
                page,
                category.url,
                jobId
            );

            await completeJob(jobId, {
                cardsScanned: result.totalCards,
                inserted: result.inserted,
                duplicates: result.duplicates,
                skipped: result.skipped,
                failed: result.failed
            });

            await run(
                `
                UPDATE source_urls
                SET
                    last_scraped_at=NOW(),
                    verification_status='Verified'
                WHERE id=?
                `,
                [category.id]
            );

            successfulCategories++;
            totalCardsScanned += result.totalCards;
            totalInserted += result.inserted;
            totalDuplicates += result.duplicates;
            totalSkipped += result.skipped;
            totalFailed += result.failed;

            logger.info(
                `Category Completed: ${category.url} — pages ${result.pages}, cards ${result.totalCards}, inserted ${result.inserted}, duplicates ${result.duplicates}, skipped ${result.skipped}, errors ${result.failed}`
            );

            console.log("");

            console.log(
                `Category Completed (${result.inserted} new tenders)`
            );

        } catch (error) {

            failedCategories++;

            console.log(error);

            logger.error(`Category failed: ${category.url} - ${error.message}`);

            await failJob(jobId, error);

        }

    }

    console.log("");
    console.log("========================================");
    console.log("ALL CATEGORIES COMPLETED");
    console.log("========================================");

    printRunSummary({
        startTime: runStart,
        endTime: Date.now(),
        totalCategories: categories.length,
        successfulCategories,
        failedCategories,
        totalCardsScanned,
        totalInserted,
        totalDuplicates,
        totalFailed: totalFailed + totalSkipped
    });

}