// Field-level instruction for the "riskAnalysis" key. IMPORTANT: this is
// an explanation of risk-relevant facts already present in the supplied
// LeadAnalysis JSON (e.g. sparse data, missing contact details, a passed
// closing date, low confidence) — it must never compute a new risk score
// or contradict score.breakdown/confidence, which are already final.
export const RISK_ANALYSIS_INSTRUCTIONS = `riskAnalysis (string): A 2-4 sentence plain-English explanation of the risk considerations for pursuing this lead, based only on signals already present in the supplied LeadAnalysis JSON (e.g. score.confidence, intelligence.signals such as "Sparse Record" or "No Contact Details", a closing date that has passed, missing amount/location/contact data). Do not invent a new risk score or rating — only narrate what the existing data already implies. If the data is too sparse to assess risk meaningfully, say so explicitly rather than guessing.`;