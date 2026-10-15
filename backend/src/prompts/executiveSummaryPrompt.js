// Field-level instruction for the "executiveSummary" key in
// OllamaAnalysisService's response. Assembled into the full prompt by
// src/services/ollama/ollamaPromptBuilder.js — this file only holds
// static instruction text, no logic.
export const EXECUTIVE_SUMMARY_INSTRUCTIONS = `executiveSummary (string): A concise 2-4 sentence, executive-level overview of this lead for someone who has not seen the raw tender. State who the opportunity is with (company/buyer), what it is, and the overall lead priority (grade/score) from the supplied LeadAnalysis JSON. Do not restate the raw JSON verbatim — write it as prose a Relationship Manager's manager would read in ten seconds.`;