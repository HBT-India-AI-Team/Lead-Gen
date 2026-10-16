import { all } from '../../../config/database.js';

// Cold-start label source: the human verdict on each lead's AI-drafted
// proposal in Human Review. APPROVED -> 1 (worth pursuing), REJECTED -> 0.
// CHANGES_REQUESTED / ON_HOLD are not outcomes, so those leads stay
// unlabelled. Used until the CRM outcome feed (converted / rejected / went
// bad) is connected; swapping to it is a new label source registered in
// labels/index.js, nothing else changes.
//
// Known bias: proposals are only generated for QUALIFIED_GOOD leads, so
// every label here comes from a lead the rules engine already scored 80+.
// The out-of-distribution guard in featureService.js is what stops a model
// trained on these from confidently scoring leads unlike them.

const NAME = 'review_decisions';

export const reviewDecisionLabelSource = {
  name: NAME,
  description: 'Expert proposal decisions in Human Review (cold start; CRM outcome feed not connected)',

  /** Latest terminal decision per lead: [{ tenderId, label, labelledAt, source }]. */
  async loadLabels() {
    // Reviews recorded before lead_decision_events existed only survive as
    // the proposal's latest status; the audit trail wins wherever it has one.
    const fromProposals = await all(
      `SELECT tender_id, status AS decision, reviewed_at AS labelled_at
       FROM tender_proposals
       WHERE raw_ai_response IS NOT NULL AND status IN ('APPROVED', 'REJECTED') AND reviewed_at IS NOT NULL
       ORDER BY reviewed_at, id`
    );
    const fromEvents = await all(
      `SELECT tender_id, decision, created_at AS labelled_at
       FROM lead_decision_events
       WHERE event_type = 'PROPOSAL_REVIEWED' AND decision IN ('APPROVED', 'REJECTED')
       ORDER BY created_at, id`
    );

    const latestByTender = new Map();
    for (const row of [...fromProposals, ...fromEvents]) latestByTender.set(row.tender_id, row);

    return [...latestByTender.values()].map((row) => ({
      tenderId: row.tender_id,
      label: row.decision === 'APPROVED' ? 1 : 0,
      labelledAt: row.labelled_at,
      source: NAME,
    }));
  },
};
