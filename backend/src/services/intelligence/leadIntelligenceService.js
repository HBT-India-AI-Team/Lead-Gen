import { withRetry } from '../../utils/retry.js';
import { LEAD_INTELLIGENCE_SYSTEM_PROMPT as SYSTEM_PROMPT } from '../../prompts/leadIntelligencePrompt.js';

// Structured-output schema for the lead intelligence analysis call. Unlike
// the AI extraction layer's schema (where most fields are legitimately
// null when absent from source text), every field here is a required,
// non-null judgment the model must always produce — even a sparse record
// gets a lower-confidence assessment, called out explicitly in
// aiReasoning, rather than a null field.
const LEAD_INTELLIGENCE_SCHEMA = {
  name: 'lead_intelligence',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      companyType: { type: 'string' },
      buyerType: { type: 'string' },
      businessOpportunity: { type: 'string' },
      industry: { type: 'string' },
      opportunitySummary: { type: 'string' },
      suggestedSalesStrategy: { type: 'string' },
      decisionMakerType: { type: 'string' },
      estimatedProcurementSize: { type: 'string' },
      riskFactors: { type: 'array', items: { type: 'string' } },
      opportunityScore: { type: 'integer', minimum: 0, maximum: 100 },
      leadPriority: { type: 'string', enum: ['Hot', 'Warm', 'Cold'] },
      aiReasoning: { type: 'string' }
    },
    required: [
      'companyType', 'buyerType', 'businessOpportunity', 'industry', 'opportunitySummary',
      'suggestedSalesStrategy', 'decisionMakerType', 'estimatedProcurementSize',
      'riskFactors', 'opportunityScore', 'leadPriority', 'aiReasoning'
    ],
    additionalProperties: false
  }
};

function field(value) {
  return value === undefined || value === null || value === '' ? '(not available)' : value;
}

// Prefers the deterministic `tenders` fields (t.*) over the AI-extracted
// `tender_extractions` ones for title/description/category/location/
// amount/date, since tenders is the transcription-verified normalized
// record; falls back to the extraction's own fields when no tenders row
// was resolved. Buyer/department/email/phone/website/gst/pan only exist
// on the extraction side, so those are always taken from there.
function buildPrompt(record) {
  const title = record.tenders_title ?? record.tender_title;
  const description = record.tenders_description ?? record.tender_description;
  const category = record.tenders_category ?? record.tender_category;
  const location = record.tenders_location ?? record.extraction_location;
  const amount = record.tenders_amount ?? record.estimated_amount;
  const tenderDate = record.tenders_contract_date ?? record.tender_date;

  return [
    `Tender Title: ${field(title)}`,
    `Tender Description: ${field(description)}`,
    `Category: ${field(category)}`,
    `Location: ${field(location)}`,
    `Estimated Amount: ${field(amount)}`,
    `Tender Date: ${field(tenderDate)}`,
    `Closing Date: ${field(record.closing_date)}`,
    `Company: ${field(record.company)}`,
    `Buyer: ${field(record.buyer)}`,
    `Department: ${field(record.department)}`,
    `Email: ${field(record.email)}`,
    `Phone: ${field(record.phone)}`,
    `Website: ${field(record.website)}`,
    `GST: ${field(record.gst)}`,
    `PAN: ${field(record.pan)}`,
    `Source URL: ${field(record.tenders_url)}`
  ].join('\n');
}

async function callAnalysisModel(record, { apiKey, model, baseUrl }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(record) }
      ],
      response_format: { type: 'json_schema', json_schema: LEAD_INTELLIGENCE_SCHEMA }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Lead intelligence request failed with HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Lead intelligence response missing message content.');
  }

  return { fields: JSON.parse(content), payload };
}

/** Analyzes one combined tender_extractions/tenders record, retrying on transient failures. */
export async function analyzeTender(record, { apiKey, model, baseUrl }) {
  return withRetry(
    () => callAnalysisModel(record, { apiKey, model, baseUrl }),
    { retries: 3, delayMs: 1500, label: 'Lead intelligence analysis call' }
  );
}