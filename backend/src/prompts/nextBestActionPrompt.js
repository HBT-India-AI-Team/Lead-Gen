// Field-level instruction for the "nextBestAction" key. IMPORTANT: this
// is a single concrete next STEP (e.g. "Call within 2 business days"),
// never a banking product name — product selection is already finalized
// in recommendations.recommendedProducts and must not be recalculated or
// restated as if it were a new decision here.
export const NEXT_BEST_ACTION_INSTRUCTIONS = `nextBestAction (string): One single, concrete, actionable next step for the Relationship Manager to take right now (e.g. "Call the buyer's listed contact within 2 business days before the tender closes" or "Request missing contact details before attempting outreach"). This must be an action/step, not a banking product name — do not select or restate a product here, that decision already exists in recommendations.recommendedProducts.`;