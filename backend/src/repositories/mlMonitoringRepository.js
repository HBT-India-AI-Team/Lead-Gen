import { run, all } from '../config/database.js';

// Data access for ml_monitoring_metrics: one row per metric per window
// (drift, calibration, ...), with `breach` set when it crossed its limit.

export async function insertMetric({ modelId, metricName, metricValue, windowStart, windowEnd, breach = false }) {
  const result = await run(
    `INSERT INTO ml_monitoring_metrics (model_id, metric_name, metric_value, window_start, window_end, breach)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [modelId, metricName, metricValue ?? null, windowStart ?? null, windowEnd ?? null, breach ? 1 : 0]
  );
  return result.lastID;
}

export async function listMetricsForModel(modelId) {
  return all('SELECT * FROM ml_monitoring_metrics WHERE model_id = ? ORDER BY computed_at DESC, id DESC', [modelId]);
}
