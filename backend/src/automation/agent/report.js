import { logger } from "../utils/logger.js";

export function printRunSummary(summary) {
  const {
    startTime,
    endTime,
    totalCategories,
    successfulCategories,
    failedCategories,
    totalCardsScanned,
    totalInserted,
    totalDuplicates,
    totalFailed
  } = summary;

  const durationSec = Math.round((endTime - startTime) / 1000);

  logger.info("\n====================================================");
  logger.info("          TENDERBOOK SCRAPER RUN SUMMARY            ");
  logger.info("====================================================");
  logger.info(` Execution Time        : ${durationSec} seconds`);
  logger.info(` Total Categories      : ${totalCategories}`);
  logger.info(` Successful Categories : ${successfulCategories} ✔`);
  logger.info(` Failed Categories     : ${failedCategories} ✖`);
  logger.info("----------------------------------------------------");
  logger.info(` Total Cards Scanned   : ${totalCardsScanned}`);
  logger.info(` New Tenders Inserted  : ${totalInserted} ✔`);
  logger.info(` Duplicate Tenders     : ${totalDuplicates} ⏭`);
  logger.info(` Extraction Failures   : ${totalFailed} ✖`);
  logger.info("====================================================\n");
}