import { run, all } from '../config/database.js';

// Data access for ml_predictions: one row per qualification score, model-
// made or deterministic, with the exact feature vector it was made from.
// What monitoring measures and what a correction points back to.

export async function insertPrediction({ tenderId, modelId, segmentKey, resolvedVia, score, probability, predictedClass, featureVector, fallbackReason }) {
  const result = await run(
    `INSERT INTO ml_predictions
       (tender_id, model_id, segment_key, resolved_via, score, probability, predicted_class, feature_vector, fallback_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenderId,
      modelId ?? null,
      segmentKey ?? null,
      resolvedVia,
      score,
      probability ?? null,
      predictedClass ?? null,
      featureVector ? JSON.stringify(featureVector) : null,
      fallbackReason ?? null,
    ]
  );
  return result.lastID;
}

export async function listByTenderId(tenderId) {
  const rows = await all('SELECT * FROM ml_predictions WHERE tender_id = ? ORDER BY id DESC', [tenderId]);
  return rows.map((row) => ({
    ...row,
    probability: row.probability == null ? null : Number(row.probability),
    feature_vector: typeof row.feature_vector === 'string' ? JSON.parse(row.feature_vector) : row.feature_vector,
  }));
}
