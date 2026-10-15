import path from 'path';
import { fileURLToPath } from 'url';
import { withTransaction } from '../config/database.js';
import { ensureLeadAnalysisSchema } from '../db/migrations/addLeadAnalysisTable.js';
import { findPendingAnalysis, saveAnalysis } from '../repositories/leadAnalysisRepository.js';
import { qualifyTender } from '../services/leadQualificationService.js';
import { createLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const logger = createLogger('lead-qualification');

// AI Lead Qualification layer: analyzes the combined tenders/tender_extractions
// record for each tender and produces a structured bid/no-bid assessment in
// `lead_analysis`. Runs independently of the TenderBook scraper
// (src/automation/**), the document processor (src/jobs/documentProcessor.js),
// the AI extraction layer (src/jobs/aiExtraction.js), and the existing
// lead_intelligence layer — it only reads tenders/tender_extractions and
// never writes to any of those tables.
//
// Each qualification is saved inside its own transaction so a crash between
// the AI call and the DB write never leaves a half-written row; if the
// transaction throws, saveAnalysis() is retried once more as a standalone
// "Failed" write so the failure itself is recorded rather than silently
// dropped with the rollback (same pattern as src/jobs/aiExtraction.js).

export async function runLeadQualification() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing from .env');
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  await ensureLeadAnalysisSchema();

  const records = await findPendingAnalysis();

  if (records.length === 0) {
    logger.info('No tender_extractions pending qualification.');
    return { qualified: 0, failed: 0, total: 0 };
  }

  logger.info('Found tender_extractions pending qualification.', { pending: records.length, model });

  let qualified = 0;
  let failed = 0;
  const usage = { prompt: 0, completion: 0, total: 0 };

  for (const record of records) {
    try {
      const { fields, payload } = await qualifyTender(record, { apiKey, model, baseUrl });

      await withTransaction((tx) =>
        saveAnalysis(
          {
            tenderExtractionId: record.tender_extraction_id,
            tenderId: record.tender_id,
            ...fields,
            status: 'Completed',
            rawLlmResponse: payload
          },
          tx
        )
      );

      if (payload.usage) {
        usage.prompt += payload.usage.prompt_tokens || 0;
        usage.completion += payload.usage.completion_tokens || 0;
        usage.total += payload.usage.total_tokens || 0;
      }

      qualified++;
      logger.info('Tender qualified.', {
        tenderExtractionId: record.tender_extraction_id,
        tenderId: record.tender_id,
        recommendation: fields.recommendation,
        confidenceScore: fields.confidenceScore
      });

    } catch (error) {
      failed++;
      logger.error('Qualification failed.', {
        tenderExtractionId: record.tender_extraction_id,
        error: error.message
      });

      try {
        await withTransaction((tx) =>
          saveAnalysis(
            {
              tenderExtractionId: record.tender_extraction_id,
              tenderId: record.tender_id,
              status: 'Failed',
              errorMessage: error.message
            },
            tx
          )
        );
      } catch (saveError) {
        logger.error('Also failed to record the qualification failure.', {
          tenderExtractionId: record.tender_extraction_id,
          error: saveError.message
        });
      }
    }
  }

  logger.info('Batch complete.', { qualified, failed, total: records.length, tokenUsage: usage });

  return { qualified, failed, total: records.length };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runLeadQualification()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Fatal error.', { error: error.message, stack: error.stack });
      process.exit(1);
    });
}
