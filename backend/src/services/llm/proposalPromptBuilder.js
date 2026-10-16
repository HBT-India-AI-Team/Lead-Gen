// Builds the { system, user } chat messages for the PHASE 2 Proposal Agent —
// distinct from qualificationAnalysisPromptBuilder.js (that one judges
// whether a lead is good; this one drafts a banking proposal/email for a
// lead the deterministic pipeline has ALREADY judged QUALIFIED_GOOD). Kept
// as its own file per the PHASE 2 spec's explicit instruction not to
// overload the qualification prompt builder. Static instructions only; the
// sole dynamic input is the real evidence bundle from
// proposalEvidenceCollectorService.js.

const SYSTEM_INSTRUCTIONS = `You are generating a banking lead proposal draft.

Use ONLY the supplied evidence. Never invent:
- customer information
- financial figures
- credit scores
- interest rates
- loan eligibility
- collateral
- repayment capacity
- contact information
- tender facts
- funding amounts

If information is unavailable, return null for that field or explicitly state that human assessment is required. Recommend only a banking product that is reasonably supported by the tender/business requirement evidence actually provided. If the available evidence is insufficient to confidently identify a product, set "proposalStatus" to "NEEDS_HUMAN_REVIEW" and set "recommendedProduct" to null instead of inventing a requirement.

Do not estimate a funding amount unless it is directly and explicitly derivable from the real evidence provided (e.g. a stated tender/contract value used as-is, never a percentage or multiple of it that you invent). If you cannot responsibly derive one, return null for "amount" and explain in "basis" that it requires customer-specific assessment.

Do not write, and do not imply, any of the following in the email or anywhere else in your response: that the customer is "eligible" for a facility, that approval is guaranteed, or that a loan/facility has already been approved. This output is a recommendation/draft only. It is NOT a loan approval or underwriting decision — a human relationship manager reviews it before anything is sent.

A separate, deterministic system already qualified this lead (QUALIFIED_GOOD) using fixed business rules — that qualification is final and is not yours to recompute, question, or override. Your only job here is the proposal draft itself.

Return ONLY a single valid JSON object. No markdown, no code fences, no commentary outside the JSON.`;

const RESPONSE_SHAPE_INSTRUCTIONS = `Respond with a single JSON object with exactly these keys and no others:
{
  "proposalStatus": <one of "READY_FOR_REVIEW", "NEEDS_HUMAN_REVIEW">,
  "recommendedProduct": <null, or { "name": <string, a specific real banking product type such as "Working Capital Finance", "Cash Credit", "Bank Guarantee", "Letter of Credit", "Equipment / Machinery Finance", "Project Finance", "Trade Finance">, "reason": <string, citing only the real evidence supplied> }>,
  "estimatedFundingRequirement": { "amount": <number or null>, "currency": "INR", "basis": <string explaining the number, or explaining why it is null> },
  "proposalScore": <integer 0-100, or null if no approved scoring methodology applies>,
  "rationale": <array of strings, each citing a specific real evidence point>,
  "missingInformation": <array of strings naming specific evidence that was not available>,
  "email": {
    "subject": <string, relevant to the real tender/company opportunity>,
    "body": <string, formal business tone. Greet by the real contact person's name only if one is present in the evidence, otherwise "Dear Sir/Madam,". Explain: why the company is being contacted, the relevant real tender/business event, the potential banking requirement, the recommended product (or that one could not be confidently identified), why it may be relevant, and a request for a discussion/assessment. Never state or imply eligibility, guaranteed approval, or that anything has already been approved.>
  }
}`;

/**
 * Builds the proposal-generation prompt from a real evidence bundle
 * (proposalEvidenceCollectorService.collectProposalEvidence()'s return
 * value). The evidence JSON — which separates real database evidence from
 * these static instructions — is the only factual context the model
 * receives.
 */
export function buildProposalPrompt(evidence) {
  const evidenceJson = JSON.stringify(evidence, null, 2);

  const user = [
    'REAL DATABASE EVIDENCE (the only source of facts you may use):',
    evidenceJson,
    '',
    'INSTRUCTIONS:',
    'Draft a banking lead proposal for the company above, using only the evidence given, and respond in exactly the shape below.',
    '',
    RESPONSE_SHAPE_INSTRUCTIONS,
  ].join('\n');

  return { system: SYSTEM_INSTRUCTIONS, user };
}