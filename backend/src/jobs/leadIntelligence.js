import path from 'path';
import { fileURLToPath } from 'url';
import { createLlmClient } from '../services/llm/llmClient.js';
import { ensureLeadIntelligenceSchema } from '../db/migrations/addLeadIntelligenceTable.js';
import { findPendingAnalysis, saveIntelligence } from '../repositories/leadIntelligenceRepository.js';
import { analyzeTender } from '../services/intelligence/leadIntelligenceService.js';

const __filename = fileURLToPath(import.meta.url);
const LOG_PREFIX = '[Lead Intelligence]';

// Lead Intelligence layer: turns successfully-extracted tender_extractions
// rows (enriched with their resolved tenders row, when one exists) into
// scored lead_intelligence rows via an LLM call. Runs independently of the
// scraper, the document processor, and the AI extraction layer — it only
// reads tender_extractions/tenders/scraped_documents.

export async function runLeadIntelligence() {
  const llmClient = createLlmClient();
  const { model } = llmClient;

  await ensureLeadIntelligenceSchema();

  const records = await findPendingAnalysis();

  if (records.length === 0) {
    console.log(`${LOG_PREFIX} No tenders pending analysis.`);
    return { analyzed: 0, failed: 0, total: 0 };
  }

  console.log(`${LOG_PREFIX} Found ${records.length} tender(s) pending analysis. Using model "${model}".`);

  let analyzed = 0;
  let failed = 0;
  const usage = { prompt: 0, completion: 0, total: 0 };

  for (const record of records) {
    try {
      const title = record.tenders_title ?? record.tender_title;
      const description = record.tenders_description ?? record.tender_description;
      if (!title && !description) {
        throw new Error('No usable tender content available for analysis.');
      }

      const { fields, payload, usage: callUsage } = await analyzeTender(record, { llmClient });

      await saveIntelligence({
        tenderExtractionId: record.tender_extraction_id,
        tenderId: record.tender_id,
        ...fields,
        status: 'Completed',
        rawLlmResponse: payload
      });

      usage.prompt += callUsage.prompt;
      usage.completion += callUsage.completion;
      usage.total += callUsage.total;

      analyzed++;
      console.log(`${LOG_PREFIX} Tender extraction ${record.tender_extraction_id}: scored ${fields.opportunityScore} (${fields.leadPriority}).`);

    } catch (error) {
      failed++;
      console.error(`${LOG_PREFIX} Tender extraction ${record.tender_extraction_id}: analysis failed — ${error.message}`);

      try {
        await saveIntelligence({
          tenderExtractionId: record.tender_extraction_id,
          tenderId: record.tender_id,
          status: 'Failed',
          errorMessage: error.message
        });
      } catch (saveError) {
        console.error(`${LOG_PREFIX} Tender extraction ${record.tender_extraction_id}: also failed to record the failure — ${saveError.message}`);
      }
    }
  }

  console.log(`${LOG_PREFIX} Batch complete: ${analyzed} analyzed, ${failed} failed, out of ${records.length} total.`);
  console.log(`${LOG_PREFIX} Token usage — prompt: ${usage.prompt}, completion: ${usage.completion}, total: ${usage.total}.`);

  return { analyzed, failed, total: records.length };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runLeadIntelligence()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`${LOG_PREFIX} Fatal error:`, error);
      process.exit(1);
    });
}