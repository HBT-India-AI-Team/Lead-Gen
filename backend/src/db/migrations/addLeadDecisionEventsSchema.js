import { exec, get } from '../../config/database.js';

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

// MODEL = the qualification ML model (Model Maintenance Agent), kept
// distinct from AI (the LLM advisory/proposal agents).
export const DECISION_ACTOR_TYPES = ['RULES', 'MODEL', 'AI', 'HUMAN', 'SYSTEM'];

const inList = (values) => values.map((value) => `'${value}'`).join(', ');

/**
 * CREATE TABLE IF NOT EXISTS never touches an existing table, so a value
 * added to one of the lists above would be rejected by the old CHECK
 * constraint on databases created earlier. Re-creates the constraint only
 * when it's missing one of the current values.
 */
async function syncCheckConstraint(name, column, values) {
  const row = await get(
    `SELECT CHECK_CLAUSE AS clause FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = ?`,
    [name]
  );
  // MySQL reports the clause with escaped quotes, e.g. _utf8mb4\'RULES\'.
  const clause = row ? String(row.clause).replace(/\\/g, '') : '';
  if (row && values.every((value) => clause.includes(`'${value}'`))) return;

  console.log(`[DB Migrate] Updating lead_decision_events constraint ${name}...`);
  if (row) await exec(`ALTER TABLE lead_decision_events DROP CHECK ${name};`);
  await exec(`ALTER TABLE lead_decision_events ADD CONSTRAINT ${name} CHECK (${column} IN (${inList(values)}));`);
}

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
      CONSTRAINT chk_lead_decision_events_type CHECK (event_type IN (${inList(DECISION_EVENT_TYPES)})),
      CONSTRAINT chk_lead_decision_events_actor CHECK (actor_type IN (${inList(DECISION_ACTOR_TYPES)}))
    );
  `);

  await syncCheckConstraint('chk_lead_decision_events_type', 'event_type', DECISION_EVENT_TYPES);
  await syncCheckConstraint('chk_lead_decision_events_actor', 'actor_type', DECISION_ACTOR_TYPES);
}
