import path from 'path';
import { fileURLToPath } from 'url';
import { run, all } from '../config/database.js';
import { createLlmClient } from '../services/llm/llmClient.js';

const __filename = fileURLToPath(import.meta.url);

// Milestone 4: MCA record profiling. Turns raw scraped_documents rows (from
// the Milestone 3 ingest job, source id 10) into candidate lead_profiles via
// a structured-output LLM call (Gemini by default), sitting at review_status='Pending' for a
// future human-in-the-loop review screen to consume.

const SOURCE_ID = 10;

const LEAD_PROFILE_SCHEMA = {
  name: 'lead_profile',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      lead_score: { type: 'integer', minimum: 0, maximum: 100 },
      industry: { type: 'string' },
      estimated_size_stage: { type: 'string' },
      notable_signals: { type: 'array', items: { type: 'string' } },
      data_sparse: { type: 'boolean' },
      summary: { type: 'string' }
    },
    required: ['lead_score', 'industry', 'estimated_size_stage', 'notable_signals', 'data_sparse', 'summary'],
    additionalProperties: false
  }
};

// Rubric is enforced by the model, not computed in JS — keep it here so the
// scoring logic stays auditable/reviewable in one place instead of buried in
// prompt text elsewhere.
const SYSTEM_PROMPT = `You are a credit/lead analyst for a commercial bank, screening raw MCA (Ministry of Corporate Affairs) company registration records into candidate lead profiles for human review.

Score lead_score from 0-100 using this rubric:
- Company status (~40 pts): "Active" status earns most of this weight. "Strike Off", "Dissolved", "Amalgamated", "Under liquidation" or similar inactive statuses should score very low (0-10) regardless of other factors, since the company is likely not a viable banking prospect.
- Capital size (~25 pts): Weigh AuthorizedCapital/PaidupCapital relative to what's typical for the company's class/category (e.g. a Private Limited company or LLP with paid-up capital in the lakhs+ range signals more banking potential than one at the statutory minimum). Missing capital fields should lower confidence, not automatically lower the score.
- Industry relevance (~20 pts): Score higher for industries with typical commercial banking needs (manufacturing, trading, finance, services); neutral for unclear/blank classifications.
- Data completeness (~15 pts): More populated fields raise confidence in the score. Many LLP/small-company records are legitimately sparse — do not penalize a sparse record as if it were a bad lead, but do reflect the lower confidence in data_sparse and the summary.

Do not invent or hallucinate details not present in the record. If most fields are blank, set data_sparse=true and say so explicitly in the summary (e.g. "Data too sparse to profile meaningfully beyond basic registration details") rather than fabricating industry or size detail. Respond only with the requested JSON.`;

function field(value) {
  return value === undefined || value === null || value === '' ? '(blank)' : value;
}

// Deliberately reads from metadata_json rather than cleaned_text so the
// model sees each field's presence/absence explicitly (marked "(blank)"),
// which is what lets it flag sparse records instead of guessing.
function buildProfilePrompt(metadata) {
  return [
    `Company Name: ${field(metadata.CompanyName)}`,
    `CIN: ${field(metadata.CIN)}`,
    `Status: ${field(metadata.CompanyStatus)}`,
    `Class: ${field(metadata.CompanyClass)}`,
    `Category: ${field(metadata.CompanyCategory)} / ${field(metadata.CompanySubCategory)}`,
    `Registered: ${field(metadata.CompanyRegistrationdate_date)} | ROC: ${field(metadata.CompanyROCcode)} (${field(metadata.CompanyStateCode)})`,
    `Authorized Capital: ${field(metadata.AuthorizedCapital)} | Paid-up Capital: ${field(metadata.PaidupCapital)}`,
    `Indian/Foreign: ${field(metadata['CompanyIndian/Foreign Company'])} | Listing: ${field(metadata.Listingstatus)}`,
    `Industry: ${field(metadata.CompanyIndustrialClassification)} (NIC: ${field(metadata.nic_code)})`,
    `Address: ${field(metadata.Registered_Office_Address)}`
  ].join('\n');
}

async function profileRecord(metadata, llmClient) {
  const { data, payload, usage } = await llmClient.chatWithMeta({
    operation: 'mca_profile',
    system: SYSTEM_PROMPT,
    user: buildProfilePrompt(metadata),
    schema: LEAD_PROFILE_SCHEMA.schema,
    temperature: 0.2
  });

  return { parsed: data, payload, usage };
}

async function processDocument(doc, llmClient, usage) {
  try {
    const { parsed, payload, usage: callUsage } = await profileRecord(doc.metadata_json, llmClient);

    await run(
      `INSERT INTO lead_profiles (scraped_document_id, lead_score, summary, raw_llm_response, review_status) VALUES (?, ?, ?, ?, 'Pending')`,
      [doc.id, parsed.lead_score, parsed.summary, JSON.stringify(payload)]
    );

    usage.prompt += callUsage.prompt;
    usage.completion += callUsage.completion;
    usage.total += callUsage.total;

    console.log(`[MCA Profile] Document ${doc.id}: profiled, lead_score=${parsed.lead_score}${parsed.data_sparse ? ' (sparse data)' : ''}.`);
    return true;
  } catch (error) {
    if (error.code === 'LLM_QUOTA_EXHAUSTED') throw error; // stop the batch; see runMcaProfile
    console.error(`[MCA Profile] Document ${doc.id}: failed to profile —`, error.message);
    return false;
  }
}

/** Profiles every scraped_documents row for the MCA source (id 10) that has metadata_json but no lead_profiles row yet. */
export async function runMcaProfile() {
  const llmClient = createLlmClient();
  const { model } = llmClient;

  const pendingDocs = await all(
    `SELECT sd.id, sd.metadata_json
     FROM scraped_documents sd
     JOIN scraping_jobs sj ON sj.id = sd.scraping_job_id
     JOIN source_urls su ON su.id = sj.source_url_id
     LEFT JOIN lead_profiles lp ON lp.scraped_document_id = sd.id
     WHERE su.source_id = ? AND sd.metadata_json IS NOT NULL AND lp.id IS NULL`,
    [SOURCE_ID]
  );

  if (pendingDocs.length === 0) {
    console.log(`[MCA Profile] No unprofiled scraped_documents for source id ${SOURCE_ID}.`);
    return;
  }

  console.log(`[MCA Profile] Found ${pendingDocs.length} unprofiled document(s) for source id ${SOURCE_ID}. Using model "${model}".`);

  const usage = { prompt: 0, completion: 0, total: 0 };
  let profiled = 0;
  let failed = 0;

  let stoppedForQuota = false;
  for (const doc of pendingDocs) {
    try {
      const ok = await processDocument(doc, llmClient, usage);
      if (ok) profiled++;
      else failed++;
    } catch (error) {
      // Unprofiled documents are simply picked up again next run.
      stoppedForQuota = true;
      console.warn(`[MCA Profile] Model quota exhausted — stopping; remaining documents stay pending. ${error.message}`);
      break;
    }
  }

  console.log(`[MCA Profile] Batch ${stoppedForQuota ? 'stopped (quota)' : 'complete'}: ${profiled} profiled, ${failed} failed, out of ${pendingDocs.length} candidate(s).`);
  console.log(`[MCA Profile] Token usage — prompt: ${usage.prompt}, completion: ${usage.completion}, total: ${usage.total}.`);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runMcaProfile()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[MCA Profile] Fatal error:', error);
      process.exit(1);
    });
}
