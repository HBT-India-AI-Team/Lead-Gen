import { EXECUTIVE_SUMMARY_INSTRUCTIONS } from '../../prompts/executiveSummaryPrompt.js';
import { BUSINESS_OPPORTUNITY_INSTRUCTIONS } from '../../prompts/businessOpportunityPrompt.js';
import { RISK_ANALYSIS_INSTRUCTIONS } from '../../prompts/riskAnalysisPrompt.js';
import { TALKING_POINTS_INSTRUCTIONS } from '../../prompts/talkingPointsPrompt.js';
import { ENGAGEMENT_STRATEGY_INSTRUCTIONS } from '../../prompts/engagementStrategyPrompt.js';
import { NEXT_BEST_ACTION_INSTRUCTIONS } from '../../prompts/nextBestActionPrompt.js';

// Assembles the full Ollama prompt from static instruction text only —
// no business logic, no scoring/recommendation computation. The only
// dynamic input is the LeadAnalysis JSON itself, embedded verbatim as the
// single source of facts the model is allowed to use.

const SYSTEM_INSTRUCTIONS = `You are an AI Banking Relationship Manager Assistant.

Only use the supplied LeadAnalysis JSON. Never invent facts that are not present in it.
Never calculate, restate a different value for, or otherwise change the lead score — it is already final.
Never change, add to, or invent banking product recommendations — the recommended products are already final.
Never perform lead scoring, product recommendation, or any other business-rule calculation yourself; that has already been done deterministically upstream. Your only job is to explain and narrate those results in plain English for a Relationship Manager.
If information needed for a field is missing from the LeadAnalysis JSON, clearly state that it is missing rather than inventing or guessing a value.
Return ONLY valid JSON. No markdown, no code fences, no commentary outside the JSON object.`;

const RESPONSE_SHAPE_INSTRUCTIONS = `Respond with a single JSON object with exactly these six keys and no others:
{
  "executiveSummary": string,
  "businessOpportunity": string,
  "riskAnalysis": string,
  "talkingPoints": string[],
  "engagementStrategy": string,
  "nextBestAction": string
}`;

const FIELD_INSTRUCTIONS = [
  EXECUTIVE_SUMMARY_INSTRUCTIONS,
  BUSINESS_OPPORTUNITY_INSTRUCTIONS,
  RISK_ANALYSIS_INSTRUCTIONS,
  TALKING_POINTS_INSTRUCTIONS,
  ENGAGEMENT_STRATEGY_INSTRUCTIONS,
  NEXT_BEST_ACTION_INSTRUCTIONS
].join('\n\n');

/**
 * Builds the { system, user } chat messages sent to Ollama for one
 * LeadAnalysis object. `system` carries the assistant's role and hard
 * rules (never touch the score/recommendations, never invent facts,
 * JSON-only output); `user` carries the per-field guidance plus the
 * LeadAnalysis JSON itself, the only factual context the model receives.
 */
export function buildOllamaPrompt(leadAnalysis) {
  const leadAnalysisJson = JSON.stringify(leadAnalysis, null, 2);

  const user = [
    'Generate the six fields below for the following LeadAnalysis. Follow each field\'s guidance exactly:',
    '',
    FIELD_INSTRUCTIONS,
    '',
    RESPONSE_SHAPE_INSTRUCTIONS,
    '',
    'LeadAnalysis JSON (the only source of facts you may use):',
    leadAnalysisJson
  ].join('\n');

  return { system: SYSTEM_INSTRUCTIONS, user };
}