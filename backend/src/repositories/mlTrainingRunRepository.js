import { run, all, get } from '../config/database.js';

// Data access for ml_training_runs. A run row is written when training
// starts and completed in place (status, comparison, candidate) when it
// finishes, so a crashed run is still visible as 'running'/'failed'.

const defaultDb = { run, all, get };

function parseJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toRun(row) {
  if (!row) return null;
  return { ...row, comparison: parseJson(row.comparison) };
}

export async function createRun({ segmentKey, triggerType, requestedBy }) {
  const result = await run(
    `INSERT INTO ml_training_runs (segment_key, trigger_type, status, requested_by) VALUES (?, ?, 'running', ?)`,
    [segmentKey, triggerType, requestedBy ?? null]
  );
  return result.lastID;
}

export async function completeRun(id, { status, rowCount, labelWindowStart, labelWindowEnd, candidateModelId, incumbentModelId, comparison }) {
  return run(
    `UPDATE ml_training_runs
     SET status = ?, finished_at = NOW(), row_count = ?, label_window_start = ?, label_window_end = ?,
         candidate_model_id = ?, incumbent_model_id = ?, comparison = ?
     WHERE id = ?`,
    [status, rowCount, labelWindowStart ?? null, labelWindowEnd ?? null, candidateModelId ?? null, incumbentModelId ?? null, JSON.stringify(comparison), id]
  );
}

export async function failRun(id, errorText, { rowCount = null, comparison = null } = {}) {
  return run(
    `UPDATE ml_training_runs SET status = 'failed', finished_at = NOW(), error_text = ?, row_count = ?, comparison = ? WHERE id = ?`,
    [errorText, rowCount, comparison ? JSON.stringify(comparison) : null, id]
  );
}

export async function getRunById(id) {
  return toRun(await get('SELECT * FROM ml_training_runs WHERE id = ?', [id]));
}

export async function findRunByCandidateModelId(modelId, db = defaultDb) {
  return toRun(await db.get('SELECT * FROM ml_training_runs WHERE candidate_model_id = ? ORDER BY id DESC LIMIT 1', [modelId]));
}

export async function listRuns({ segmentKey, status, limit = 50 } = {}) {
  let sql = 'SELECT * FROM ml_training_runs WHERE 1=1';
  const params = [];
  if (segmentKey) {
    sql += ' AND segment_key = ?';
    params.push(segmentKey);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(Number(limit));
  const rows = await all(sql, params);
  return rows.map(toRun);
}

export async function markApproved(id, approvedBy, note, db = defaultDb) {
  return db.run(
    `UPDATE ml_training_runs SET status = 'approved', approved_by = ?, approved_at = NOW(), review_note = ? WHERE id = ?`,
    [approvedBy, note ?? null, id]
  );
}

export async function markRejected(id, rejectedBy, note, db = defaultDb) {
  return db.run(
    `UPDATE ml_training_runs SET status = 'rejected', rejected_by = ?, rejected_at = NOW(), review_note = ? WHERE id = ?`,
    [rejectedBy, note ?? null, id]
  );
}
