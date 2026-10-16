import path from 'path';
import { fileURLToPath } from 'url';
import { createLlmClient } from '../services/llm/llmClient.js';
import { ensureTenderExtractionsSchema } from '../db/migrations/addTenderExtractionsTable.js';
import { findDocumentsPendingExtraction, saveExtraction } from '../repositories/tenderExtractionRepository.js';
import { extractTenderFields } from '../services/intelligence/aiExtractionService.js';

const __filename = fileURLToPath(import.meta.url);
const LOG_PREFIX = '[AI Extraction]';

// AI extraction layer: turns scraped_documents.cleaned_text into
// structured tender_extractions rows via an LLM call. Runs independently
// of the TenderBook scraper (src/automation/**) and of the deterministic
// documentProcessor.js pipeline — it only reads scraped_documents.

export async function runAiExtraction() {
  const llmClient = createLlmClient();
  const { model } = llmClient;

  await ensureTenderExtractionsSchema();

  const documents = await findDocumentsPendingExtraction();

  if (documents.length === 0) {
    console.log(`${LOG_PREFIX} No documents pending extraction.`);
    return { extracted: 0, failed: 0, total: 0 };
  }

  console.log(`${LOG_PREFIX} Found ${documents.length} document(s) pending extraction. Using model "${model}".`);

  let extracted = 0;
  let failed = 0;
  const usage = { prompt: 0, completion: 0, total: 0 };

  for (const document of documents) {
    try {
      if (!document.cleaned_text || !document.cleaned_text.trim()) {
        throw new Error('cleaned_text is empty.');
      }

      const { fields, payload, usage: callUsage } = await extractTenderFields(document.cleaned_text, { llmClient });

      await saveExtraction({
        scrapedDocumentId: document.id,
        ...fields,
        status: 'Completed',
        rawLlmResponse: payload
      });

      usage.prompt += callUsage.prompt;
      usage.completion += callUsage.completion;
      usage.total += callUsage.total;

      extracted++;
      console.log(`${LOG_PREFIX} Document ${document.id}: extracted "${fields.tenderTitle ?? 'untitled'}".`);

    } catch (error) {
      failed++;
      console.error(`${LOG_PREFIX} Document ${document.id}: extraction failed — ${error.message}`);

      try {
        await saveExtraction({
          scrapedDocumentId: document.id,
          status: 'Failed',
          errorMessage: error.message
        });
      } catch (saveError) {
        console.error(`${LOG_PREFIX} Document ${document.id}: also failed to record the failure — ${saveError.message}`);
      }
    }
  }

  console.log(`${LOG_PREFIX} Batch complete: ${extracted} extracted, ${failed} failed, out of ${documents.length} total.`);
  console.log(`${LOG_PREFIX} Token usage — prompt: ${usage.prompt}, completion: ${usage.completion}, total: ${usage.total}.`);

  return { extracted, failed, total: documents.length };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runAiExtraction()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`${LOG_PREFIX} Fatal error:`, error);
      process.exit(1);
    });
}