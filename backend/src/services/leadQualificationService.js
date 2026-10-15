import { createLlmClient } from './llm/llmClient.js';

// Structured-output schema for the AI Lead Qualification call. Every field
// is a required, non-null judgment the model must always produce — even a
// sparse record gets a lower confidenceScore and a "Review" recommendation
// rather than a null field, matching the same rationale documented in
// src/services/leadIntelligenceService.js.
const LEAD_QUALIFICATION_SCHEMA = {
  name: 'lead_qualification',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      industry: { type: 'string' },
      products: { type: 'array', items: { type: 'string' } },
      services: { type: 'array', items: { type: 'string' } },
      buyerType: { type: 'string' },
      requiredExperience: { type: 'string' },
      requiredCertifications: { type: 'array', items: { type: 'string' } },
      estimatedProjectSize: { type: 'string' },
      competitionLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
      businessOpportunity: { type: 'string' },
      riskLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
      complexity: { type: 'string', enum: ['Low', 'Medium', 'High'] },
      confidenceScore: { type: 'integer', minimum: 0, maximum: 100 },
      aiSummary: { type: 'string' },
      recommendation: { type: 'string', enum: ['Bid', 'Review', 'Skip'] }
    },
    required: [
      'industry', 'products', 'services', 'buyerType', 'requiredExperience',
      'requiredCertifications', 'estimatedProjectSize', 'competitionLevel',
      'businessOpportunity', 'riskLevel', 'complexity', 'confidenceScore',
      'aiSummary', 'recommendation'
    ],
    additionalProperties: false
  }
};

// Rubric is enforced by the model, not computed in JS — keep it here so the
// scoring logic stays auditable/reviewable in one place, matching the same
// approach already used in src/services/leadIntelligenceService.js.
const SYSTEM_PROMPT = `You are an AI lead qualification analyst for a B2B tender lead-generation pipeline. You are given one normalized tender record (a public tender/auction listing plus any AI-extracted contact/entity details) and must produce a structured bid-qualification assessment as JSON.

Guidance for each field:
- industry: the industry sector this tender belongs to (e.g. "Construction", "Textiles", "IT Services"), inferred from category/title/description. Do not invent.
- products: concrete physical goods/materials the tender is asking to procure or supply, as a list (e.g. ["Steel pipes", "Cement"]). Return an empty array if the tender is purely for services or unclear.
- services: concrete services the tender is asking to procure or supply, as a list (e.g. ["Civil construction", "AMC maintenance"]). Return an empty array if the tender is purely for goods or unclear.
- buyerType: category of the purchasing/inviting entity, e.g. "Government", "PSU", "Railways", "Municipal Body", "Private Enterprise".
- requiredExperience: a short plain-English statement of the experience/track-record a bidder would need (e.g. "3+ years executing similar civil works contracts"); if the text gives no explicit eligibility detail, state "Not specified in listing" rather than inventing a requirement.
- requiredCertifications: a list of certifications/registrations/licenses a bidder would plausibly need (e.g. ["ISO 9001", "GST registration", "Class A contractor license"]). Return an empty array only if none are stated or plausibly implied by the category.
- estimatedProjectSize: a size bucket derived from the amount if available (e.g. "Small (< Rs.10 Lac)", "Medium (Rs.10 Lac - Rs.1 Cr)", "Large (> Rs.1 Cr)"); if no amount is available, say "Unknown - amount not disclosed".
- competitionLevel: expected bidder competition — "High" for common/commoditized categories with low barriers to entry, "Low" for specialized/niche/high-barrier categories, "Medium" otherwise.
- businessOpportunity: a short, one-sentence categorical description of the opportunity type (e.g. "Recurring industrial goods supply contract", "One-time civil works contract").
- riskLevel: overall pursuit risk — consider data sparseness, unclear scope, payment-delay-prone buyer types, and single-bid auction dynamics. "Low"/"Medium"/"High".
- complexity: execution complexity of the underlying work/scope — "Low" for simple, standard-scope procurement; "High" for multi-phase, technically demanding, or highly regulated scope.
- confidenceScore: integer 0-100 reflecting how confident this entire assessment is, using this rubric:
  - Data completeness (~40 pts): presence of buyer/company/amount/category/description raises this; missing detail lowers it.
  - Clarity of scope (~30 pts): a clearly stated scope of goods/services raises this; vague or contradictory text lowers it.
  - Source reliability signal (~30 pts): a resolved normalized tenders record (not just the raw extraction) raises this.
- aiSummary: 2-4 sentences summarizing the opportunity and the qualification rationale, written for a bid/no-bid reviewer who has not read the raw listing.
- recommendation: derive directly from the assessment above — "Bid" when confidenceScore is high (>=70), riskLevel is Low or Medium, and businessOpportunity is clearly worthwhile; "Skip" when confidenceScore is low (<40) or riskLevel is High with poor data; "Review" for everything in between. Never contradict confidenceScore/riskLevel with the recommendation.

Only use information present in the provided record. Do not invent company names, amounts, or contacts. Sparse records should get a lower confidenceScore and, ordinarily, a "Review" recommendation, with the sparseness called out explicitly in aiSummary rather than compensated for by inventing detail. Respond only with the requested JSON.`;

function field(value) {
  return value === undefined || value === null || value === '' ? '(not available)' : value;
}

// Prefers the deterministic `tenders` fields (t.*) over the AI-extracted
// `tender_extractions` ones for title/description/category/location/
// amount/date, since tenders is the transcription-verified normalized
// record; falls back to the extraction's own fields when no tenders row
// was resolved. Buyer/department/email/phone/website/gst/pan only exist on
// the extraction side, so those are always taken from there. Mirrors
// src/services/leadIntelligenceService.js's buildPrompt() exactly, since
// both consume the same joined shape from their respective repositories.
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

/**
 * Qualifies one combined tender_extractions/tenders record. Transient
 * failures are retried inside the LLM client.
 */
export async function qualifyTender(record, { llmClient = createLlmClient() } = {}) {
  const { data, payload, usage } = await llmClient.chatWithMeta({
    system: SYSTEM_PROMPT,
    user: buildPrompt(record),
    schema: LEAD_QUALIFICATION_SCHEMA.schema,
    temperature: 0.2
  });

  return { fields: data, payload, usage };
}
