import { withRetry } from '../../utils/retry.js';
import { TENDER_EXTRACTION_SYSTEM_PROMPT as SYSTEM_PROMPT } from '../../prompts/tenderExtractionPrompt.js';

// Structured-output schema for the tender field extraction call. Every
// field is nullable — GST/PAN/email/phone/website/buyer/department are
// frequently absent from a tender listing's free text, and the model must
// return null rather than invent a value (enforced by SYSTEM_PROMPT).
const TENDER_EXTRACTION_SCHEMA = {
  name: 'tender_extraction',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      company: { type: ['string', 'null'] },
      buyer: { type: ['string', 'null'] },
      department: { type: ['string', 'null'] },
      tenderTitle: { type: ['string', 'null'] },
      tenderDescription: { type: ['string', 'null'] },
      estimatedAmount: { type: ['string', 'null'] },
      tenderCategory: { type: ['string', 'null'] },
      location: { type: ['string', 'null'] },
      tenderDate: { type: ['string', 'null'] },
      closingDate: { type: ['string', 'null'] },
      email: { type: ['string', 'null'] },
      phone: { type: ['string', 'null'] },
      website: { type: ['string', 'null'] },
      gst: { type: ['string', 'null'] },
      pan: { type: ['string', 'null'] }
    },
    required: [
      'company', 'buyer', 'department', 'tenderTitle', 'tenderDescription',
      'estimatedAmount', 'tenderCategory', 'location', 'tenderDate', 'closingDate',
      'email', 'phone', 'website', 'gst', 'pan'
    ],
    additionalProperties: false
  }
};

function buildPrompt(cleanedText) {
  return `Extract the fields from the following tender record:\n\n${cleanedText}`;
}

async function callExtractionModel(cleanedText, { apiKey, model, baseUrl }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(cleanedText) }
      ],
      response_format: { type: 'json_schema', json_schema: TENDER_EXTRACTION_SCHEMA }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI extraction request failed with HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI extraction response missing message content.');
  }

  return { fields: JSON.parse(content), payload };
}

/** Extracts the normalized tender fields from one document's cleaned_text, retrying on transient failures. */
export async function extractTenderFields(cleanedText, { apiKey, model, baseUrl }) {
  return withRetry(
    () => callExtractionModel(cleanedText, { apiKey, model, baseUrl }),
    { retries: 3, delayMs: 1500, label: 'AI extraction call' }
  );
}
