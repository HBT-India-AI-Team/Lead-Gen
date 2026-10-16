import { run, all } from '../config/database.js';

// Data access for ml_corrections (correction loop). A correction is
// pending while consumed_by_run_id is NULL; a training run claims the
// pending ones it trains on, which is what makes corrections take effect
// at the next approved retrain rather than instantly.

export async function insertCorrection({ tenderId, predictionId, correctedBy, originalScore, correctedLabel, reasonText, source, weight = 1 }) {
  const result = await run(
    `INSERT INTO ml_corrections
       (tender_id, prediction_id, corrected_by, original_score, corrected_label, reason_text, source, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenderId, predictionId ?? null, correctedBy, originalScore ?? null, correctedLabel, reasonText ?? null, source, weight]
  );
  return result.lastID;
}

export async function listPendingCorrections() {
  return all('SELECT * FROM ml_corrections WHERE consumed_by_run_id IS NULL ORDER BY id');
}

export async function markCorrectionsConsumed(ids, runId) {
  if (ids.length === 0) return { changes: 0 };
  return run('UPDATE ml_corrections SET consumed_by_run_id = ? WHERE id IN (?) AND consumed_by_run_id IS NULL', [runId, ids]);
}
