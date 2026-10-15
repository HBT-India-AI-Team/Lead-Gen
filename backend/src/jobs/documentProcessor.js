import path from 'path';
import { fileURLToPath } from 'url';
import { withTransaction } from '../config/database.js';
import { ensureDocumentProcessingSchema } from '../db/migrations/addDocumentProcessingSchema.js';
import { findUnprocessedDocuments, markProcessed, markFailed } from '../repositories/scrapedDocumentRepository.js';
import { processScrapedDocument } from '../services/intelligence/documentProcessorService.js';

const __filename = fileURLToPath(import.meta.url);

const LOG_PREFIX = '[Document Processor]';

// Normalizes scraped_documents rows into the `tenders` table. Runs
// independently of the TenderBook scraper (src/automation/**) — it only
// reads scraped_documents and never touches the scraping/browser pipeline,
// so it can run on its own schedule regardless of when/whether a scrape
// job is active.
//
// Each document is normalized and marked Processed inside one transaction,
// so a crash between the two never leaves a tender saved but the source
// document still marked Pending (which would reprocess and re-upsert it
// forever) or vice versa. If the transaction throws, it rolls back on its
// own; markFailed() below then runs as a separate, non-transactional write
// so the failure itself is recorded rather than lost with the rollback.

export async function runDocumentProcessor() {
  await ensureDocumentProcessingSchema();

  const documents = await findUnprocessedDocuments();

  if (documents.length === 0) {
    console.log(`${LOG_PREFIX} No unprocessed scraped_documents found.`);
    return { processed: 0, failed: 0, total: 0 };
  }

  console.log(`${LOG_PREFIX} Found ${documents.length} unprocessed document(s).`);

  let processed = 0;
  let failed = 0;

  for (const document of documents) {
    try {
      const tender = await withTransaction(async (tx) => {
        const result = await processScrapedDocument(document, tx);
        await markProcessed(document.id, tx);
        return result;
      });

      processed++;
      console.log(`${LOG_PREFIX} Document ${document.id}: normalized tender "${tender.tenderId}".`);

    } catch (error) {
      failed++;
      console.error(`${LOG_PREFIX} Document ${document.id}: failed — ${error.message}`);

      try {
        await markFailed(document.id, error.message);
      } catch (markError) {
        console.error(`${LOG_PREFIX} Document ${document.id}: also failed to record the failure — ${markError.message}`);
      }
    }
  }

  console.log(`${LOG_PREFIX} Batch complete: ${processed} processed, ${failed} failed, out of ${documents.length} total.`);

  return { processed, failed, total: documents.length };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runDocumentProcessor()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`${LOG_PREFIX} Fatal error:`, error);
      process.exit(1);
    });
}