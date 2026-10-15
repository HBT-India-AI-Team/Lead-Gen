import path from 'path';
import { fileURLToPath } from 'url';
import { all, get } from '../config/database.js';
import { ensureDocumentProcessingSchema } from '../db/migrations/addDocumentProcessingSchema.js';
import { updateWinnerFields } from '../repositories/tenderRepository.js';
import { getBrowserPage } from '../automation/browser/browser.js';
import { scrapeTenderDetail } from '../automation/scraper/detail.js';
import { AGENT_CONFIG } from '../automation/agent/config.js';
import { logger } from '../automation/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);

const LOG_PREFIX = '[TenderBook Winner Enrichment]';

// Backfills winning_company_name / winning_bid_amount(_value) onto EXISTING
// `tenders` rows, reusing the same detail-page scraper the live TenderBook
// scrape already uses (src/automation/scraper/detail.js) and the same
// already-open, already-logged-in Chrome tab (src/automation/browser/
// browser.js, CDP). This job never visits a category/listing page, never
// paginates, and never inserts a tender — it only opens each tender's own
// detail URL and UPDATEs the three winner columns on the row already there
// (see updateWinnerFields() in src/repositories/tenderRepository.js, which
// has no INSERT path at all).

// Optional cap on how many candidates a single run processes, e.g. for a
// small validation pass before committing to a full backfill against every
// candidate. Unset (the default) processes all of them.
async function findCandidates(limit) {
  const boundedLimit = Number.isInteger(limit) && limit > 0 ? limit : null;

  return all(`
    SELECT id, tender_id, url
    FROM tenders
    WHERE url LIKE '%tenderbook.in%'
      AND (winning_company_name IS NULL OR winning_bid_amount IS NULL)
    ORDER BY id
    ${boundedLimit ? `LIMIT ${boundedLimit}` : ''}
  `);
}

async function countExistingTenderBookTenders() {
  const row = await get(`SELECT COUNT(*) AS count FROM tenders WHERE url LIKE '%tenderbook.in%'`);
  return row.count;
}

export async function runTenderBookWinnerEnrichment({ limit } = {}) {
  await ensureDocumentProcessingSchema();

  const totalExisting = await countExistingTenderBookTenders();
  const candidates = await findCandidates(limit);

  console.log(`${LOG_PREFIX} ${totalExisting} existing TenderBook tender(s); ${candidates.length} missing a winner field.`);

  if (candidates.length === 0) {
    console.log(`${LOG_PREFIX} Nothing to enrich.`);
    return { totalExisting, processed: 0, updated: 0, skipped: 0, failed: 0, samples: [] };
  }

  // Reuses the already-running, already-logged-in Chrome tab via CDP —
  // never launches a fresh browser, so any account entitlement to the
  // Bidders tab carries over exactly as the live scraper would see it.
  const page = await getBrowserPage();

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const samples = [];

  for (const candidate of candidates) {

    if (!candidate.url) {
      skipped++;
      logger.warn(`${LOG_PREFIX} Tender ${candidate.tender_id}: no detail URL, skipping.`);
      console.log(`${LOG_PREFIX} SKIPPED : ${candidate.tender_id} (no detail URL)`);
      continue;
    }

    processed++;

    try {

      const detail = await scrapeTenderDetail(page, {
        tenderId: candidate.tender_id,
        url: candidate.url
      });

      // scrapeTenderDetail() returns {} only from its own catch block (a
      // navigation/extraction error); on any successful page load it always
      // returns the full field object (many fields legitimately null) — so
      // an empty object is the one reliable signal a fetch actually failed,
      // distinct from "loaded fine, winner data is gated for this session".
      const reachedPage = Object.keys(detail).length > 0;

      if (!reachedPage) {
        failed++;
        console.log(`${LOG_PREFIX} FAILED  : ${candidate.tender_id} (detail page unreachable)`);
        continue;
      }

      const foundSomething = Boolean(detail.winningCompanyName || detail.winningBidAmount);

      if (!foundSomething) {
        skipped++;
        console.log(`${LOG_PREFIX} SKIPPED : ${candidate.tender_id} (no winner data visible to this session)`);
        continue;
      }

      await updateWinnerFields(candidate.tender_id, {
        winningCompanyName: detail.winningCompanyName,
        winningBidAmount: detail.winningBidAmount,
        winningBidAmountValue: detail.winningBidAmountValue
      });

      updated++;

      console.log(
        `${LOG_PREFIX} UPDATED : ${candidate.tender_id} -> ` +
        `${detail.winningCompanyName ?? '(name not found)'} / ${detail.winningBidAmount ?? '(amount not found)'}`
      );

      if (samples.length < 5) {
        samples.push({
          tenderId: candidate.tender_id,
          winningCompanyName: detail.winningCompanyName,
          winningBidAmount: detail.winningBidAmount,
          winningBidAmountValue: detail.winningBidAmountValue
        });
      }

    } catch (error) {
      failed++;
      logger.error(`${LOG_PREFIX} Tender ${candidate.tender_id}: ${error.message}`);
      console.log(`${LOG_PREFIX} FAILED  : ${candidate.tender_id} - ${error.message}`);
    }

    await page.waitForTimeout(AGENT_CONFIG.WAIT_BETWEEN_DETAIL_REQUESTS);

  }

  console.log('');
  console.log('==========================================');
  console.log(`${LOG_PREFIX} COMPLETE`);
  console.log('==========================================');
  console.log(`Total existing TenderBook tenders : ${totalExisting}`);
  console.log(`Total processed                   : ${processed}`);
  console.log(`Total updated                      : ${updated}`);
  console.log(`Total skipped                      : ${skipped}`);
  console.log(`Total failed                       : ${failed}`);
  console.log('==========================================');

  return { totalExisting, processed, updated, skipped, failed, samples };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  const limitArg = process.env.TENDERBOOK_ENRICH_LIMIT ? Number(process.env.TENDERBOOK_ENRICH_LIMIT) : undefined;
  runTenderBookWinnerEnrichment({ limit: limitArg })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`${LOG_PREFIX} Fatal error:`, error);
      process.exit(1);
    });
}
