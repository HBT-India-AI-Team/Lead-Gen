// Builds the { system, user } chat messages for the Lead Qualification AI
// analysis — distinct from aiAnalysisPromptBuilder.js (that one narrates an
// already-final Health Check LeadAnalysis into 6 free-text fields; this one
// asks for a structured, validated qualification judgment from raw
// evidence). Static instructions only; the sole dynamic input is the real
// evidence bundle built by evidenceCollectorService.js.

const SYSTEM_INSTRUCTIONS = `You are a business lead qualification analyst.

Analyze ONLY the evidence provided in the JSON below. Never invent, assume, or estimate a fact that is not explicitly present in it — including turnover, credit score, loan amount, GST status, employee count, financial ratios, tender information, or company information. If something is not in the evidence, treat it as missing and say so.

A separate, deterministic scoring system already computes the tender's official qualification score and status from fixed business rules — that score is final and is not yours to compute or override. Your job is analysis and explanation only: read the real evidence and produce your own independent judgment plus a clear narrative, for a human reviewer to read alongside (not in place of) the deterministic result.

Evaluate, using only what is present in the evidence:
1. Business relevance
2. Opportunity strength
3. Company activity
4. Financial/operational evidence
5. Risk evidence
6. Product/business fit, if available
7. Your confidence in this qualification, given how much real evidence was actually available

Separate your findings into positive evidence, negative/risk evidence, and missing evidence. Explicitly note uncertainty where the evidence is thin.

Return ONLY a single valid JSON object. No markdown, no code fences, no commentary outside the JSON.`;

const RESPONSE_SHAPE_INSTRUCTIONS = `Respond with a single JSON object with exactly these keys and no others:
{
  "score": <integer 0-100, your own independent assessment>,
  "classification": <one of "QUALIFIED_GOOD", "QUALIFIED_HITL", "QUALIFIED_BAD">,
  "confidence": <number 0-1, how confident you are given the evidence actually available>,
  "reasoning": <string, 2-5 sentences citing only the real evidence provided>,
  "positiveSignals": <array of strings, each citing a specific real fact from the evidence>,
  "riskFactors": <array of strings, each citing a specific real fact or a specific gap in the evidence>,
  "missingEvidence": <array of strings naming specific evidence that was not available>,
  "recommendedNextAction": <one of "READY_FOR_PROPOSAL", "AWAITING_QUALITY_REVIEW", "ON_HOLD">
}`;

/**
 * Builds the qualification-analysis prompt from a real evidence bundle
 * (evidenceCollectorService.collectQualificationEvidence()'s return value).
 * The evidence JSON is the only factual context the model receives.
 */
export function buildQualificationAnalysisPrompt(evidence) {
  const evidenceJson = JSON.stringify(evidence, null, 2);

  const user = [
    'Analyze the following real lead-qualification evidence and respond per the required shape below.',
    '',
    RESPONSE_SHAPE_INSTRUCTIONS,
    '',
    'Evidence JSON (the only source of facts you may use):',
    evidenceJson,
  ].join('\n');

  return { system: SYSTEM_INSTRUCTIONS, user };
}
