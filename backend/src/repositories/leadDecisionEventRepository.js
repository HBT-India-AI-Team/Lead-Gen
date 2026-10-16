import { run, all } from '../config/database.js';

// Data access for lead_decision_events (see
// db/migrations/addLeadDecisionEventsSchema.js). Insert + read only — the
// trail is append-only by design.

export async function insertEvent({ tenderId, eventType, actorType, actor = null, decision = null, comment = null, details = null }) {
  return run(
    `INSERT INTO lead_decision_events (tender_id, event_type, actor_type, actor, decision, comment, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenderId, eventType, actorType, actor, decision, comment, details ? JSON.stringify(details) : null]
  );
}

export async function listByTenderId(tenderId) {
  const rows = await all(
    `SELECT id, tender_id, event_type, actor_type, actor, decision, comment, details, created_at
     FROM lead_decision_events
     WHERE tender_id = ?
     ORDER BY created_at ASC, id ASC`,
    [tenderId]
  );

  return rows.map((row) => ({
    ...row,
    details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
  }));
}
