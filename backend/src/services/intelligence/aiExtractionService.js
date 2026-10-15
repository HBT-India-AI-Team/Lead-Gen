import { createLlmClient } from '../llm/llmClient.js';
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

/**
 * Extracts the normalized tender fields from one document's cleaned_text.
 * Transient failures are retried inside the LLM client.
 */
export async function extractTenderFields(cleanedText, { llmClient = createLlmClient() } = {}) {
  const { data, payload, usage } = await llmClient.chatWithMeta({
    system: SYSTEM_PROMPT,
    user: buildPrompt(cleanedText),
    schema: TENDER_EXTRACTION_SCHEMA.schema,
    temperature: 0
  });

  return { fields: data, payload, usage };
}
