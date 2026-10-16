import { run, get, all } from '../config/database.js';

// Data access for ai_briefs (one row per day) plus the read-only queries
// the brief is built from.

function parseJson(value) {
  if (value == null || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toBrief(row) {
  if (!row) return null;
  return { ...row, bullets: parseJson(row.bullets), facts: parseJson(row.facts), token_usage: parseJson(row.token_usage) };
}

export async function findByDate(briefDate) {
  return toBrief(await get('SELECT * FROM ai_briefs WHERE brief_date = ?', [briefDate]));
}

/** Inserts the day's brief; a concurrent insert for the same day loses quietly and the existing row wins. */
export async function insertBrief({ briefDate, headline, bullets, facts, model, provider, tokenUsage, latencyMs }) {
  await run(
    `INSERT IGNORE INTO ai_briefs (brief_date, headline, bullets, facts, model, provider, token_usage, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [briefDate, headline, JSON.stringify(bullets), JSON.stringify(facts), model, provider, JSON.stringify(tokenUsage), latencyMs]
  );
  return findByDate(briefDate);
}

/** Highest-scoring qualified leads — what to act on. */
export async function topQualifiedLeads(limit = 5) {
  return all(
    `SELECT tender_id, title, winning_company_name, winning_bid_amount, amount, tender_state,
            qualification_score, lead_status, pipeline_status
     FROM tenders
     WHERE qualification_score IS NOT NULL AND lead_status IN ('QUALIFIED_GOOD', 'QUALIFIED_HITL')
     ORDER BY qualification_score DESC, qualification_completed_at DESC
     LIMIT ?`,
    [limit]
  );
}

/** Decisions recorded in the last `hours`, counted by step and outcome — what changed. */
export async function recentDecisionCounts(hours = 24) {
  return all(
    `SELECT event_type, actor_type, decision, COUNT(*) AS count
     FROM lead_decision_events
     WHERE created_at >= NOW() - INTERVAL ? HOUR
     GROUP BY event_type, actor_type, decision
     ORDER BY count DESC`,
    [hours]
  );
}
