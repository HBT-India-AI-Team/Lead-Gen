// Field-level instruction for the "businessOpportunity" key. NOTE: this
// file was not in the originally requested src/prompts file list (only
// executiveSummary/riskAnalysis/talkingPoints/engagementStrategy/
// nextBestAction were named), but "Business Opportunity Summary" is
// listed as one of the six things Ollama must generate and
// `businessOpportunity` is a required key in the documented Expected
// Output — this file closes that gap using the same one-file-per-field
// pattern as the other five.
export const BUSINESS_OPPORTUNITY_INSTRUCTIONS = `businessOpportunity (string): A 2-3 sentence description of the specific business opportunity itself — the nature of the tender/contract (industry, business category, tender value bucket), and why it is or isn't commercially attractive, based only on the intelligence and score fields supplied. This is distinct from executiveSummary: focus on the opportunity's substance, not the lead as a whole.`;