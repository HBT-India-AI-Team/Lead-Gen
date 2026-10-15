import { exec } from '../../config/database.js';

// Append-only audit trail of every decision taken on a lead, by the rules
// engine, the AI, or a human reviewer. tenders/tender_proposals only keep
// the LATEST state (a second review overwrites review_comment/reviewed_by),
// so this table is what lets the UI show the full decision history.
// Rows are only ever inserted, never updated or deleted.

export const DECISION_EVENT_TYPES = [
  'QUALIFIED',
  'QUALIFICATION_FAILED',
  'AI_ADVISORY',
  'PROPOSAL_GENERATED',
  'PROPOSAL_REVIEWED',
  'COMMUNICATION_PREPARED',
  'COMMUNICATION_REVIEWED',
];

export const DECISION_ACTOR_TYPES = ['RULES', 'AI', 'HUMAN', 'SYSTEM'];

export async function ensureLeadDecisionEventsSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS lead_decision_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tender_id VARCHAR(100) NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      actor_type VARCHAR(20) NOT NULL,
      actor VARCHAR(255) NULL,
      decision VARCHAR(50) NULL,
      comment TEXT NULL,
      details JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lead_decision_events_tender (tender_id, created_at),
      CONSTRAINT chk_lead_decision_events_type CHECK (event_type IN (${DECISION_EVENT_TYPES.map((t) => `'${t}'`).join(', ')})),
      CONSTRAINT chk_lead_decision_events_actor CHECK (actor_type IN (${DECISION_ACTOR_TYPES.map((t) => `'${t}'`).join(', ')}))
    );
  `);
}
