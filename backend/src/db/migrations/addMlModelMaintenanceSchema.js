import { exec } from '../../config/database.js';

// Model Maintenance Agent tables. Idempotent (CREATE TABLE IF NOT EXISTS),
// created in foreign-key order, run on every server boot like the other
// ensure*Schema() migrations.
//
//   ml_models             registry: one row per trained artifact
//   ml_training_runs      every retraining attempt, with the candidate-vs-
//                         incumbent comparison an admin approves against
//   ml_predictions        every qualification score and which path made it
//                         (model via exact/sector/pooled segment, or the
//                         deterministic rules engine)
//   ml_corrections        expert corrections, pending until a training run
//                         consumes them (correction loop)
//   ml_monitoring_metrics drift / calibration measurements over time

export const MODEL_STATUSES = ['candidate', 'active', 'retired'];
export const TRAINING_TRIGGERS = ['schedule', 'event', 'manual'];
export const TRAINING_RUN_STATUSES = ['running', 'failed', 'gate_failed', 'proposed', 'approved', 'rejected'];
export const RESOLVED_VIA = ['exact_segment', 'sector_segment', 'pooled', 'deterministic'];
export const CORRECTION_SOURCES = ['chat', 'review_ui'];

const inList = (values) => values.map((value) => `'${value}'`).join(', ');

export async function ensureMlModelMaintenanceSchema() {
  // artifact holds the trained model inline (JSON) for in-process engines;
  // artifact_uri points at it ("inline:ml_models/<id>") or, for a remote
  // engine such as Vertex AI, at the external artifact/endpoint.
  // active_segment_key is non-NULL only for the active row, so the unique
  // index guarantees at most one active model per segment at the DB level.
  await exec(`
    CREATE TABLE IF NOT EXISTS ml_models (
      id INT AUTO_INCREMENT PRIMARY KEY,
      segment_key VARCHAR(191) NOT NULL,
      model_type VARCHAR(50) NOT NULL,
      version INT NOT NULL,
      artifact_uri VARCHAR(500) NOT NULL,
      artifact JSON NULL,
      feature_schema JSON NOT NULL,
      hyperparams JSON NULL,
      metrics JSON NULL,
      training_config JSON NULL,
      trained_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      trained_by VARCHAR(255) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'candidate',
      promoted_at TIMESTAMP NULL DEFAULT NULL,
      retired_at TIMESTAMP NULL DEFAULT NULL,
      notes TEXT NULL,
      active_segment_key VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN segment_key ELSE NULL END) STORED,
      UNIQUE KEY uq_ml_models_segment_version (segment_key, version),
      UNIQUE KEY uq_ml_models_one_active_per_segment (active_segment_key),
      INDEX idx_ml_models_status (status),
      CONSTRAINT chk_ml_models_status CHECK (status IN (${inList(MODEL_STATUSES)}))
    );
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS ml_training_runs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      segment_key VARCHAR(191) NOT NULL,
      trigger_type VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      requested_by VARCHAR(255) NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP NULL DEFAULT NULL,
      row_count INT NULL,
      label_window_start TIMESTAMP NULL DEFAULT NULL,
      label_window_end TIMESTAMP NULL DEFAULT NULL,
      candidate_model_id INT NULL,
      incumbent_model_id INT NULL,
      comparison JSON NULL,
      approved_by VARCHAR(255) NULL,
      approved_at TIMESTAMP NULL DEFAULT NULL,
      rejected_by VARCHAR(255) NULL,
      rejected_at TIMESTAMP NULL DEFAULT NULL,
      review_note TEXT NULL,
      error_text TEXT NULL,
      INDEX idx_ml_training_runs_segment (segment_key, started_at),
      CONSTRAINT fk_ml_training_runs_candidate FOREIGN KEY (candidate_model_id) REFERENCES ml_models(id) ON DELETE SET NULL,
      CONSTRAINT fk_ml_training_runs_incumbent FOREIGN KEY (incumbent_model_id) REFERENCES ml_models(id) ON DELETE SET NULL,
      CONSTRAINT chk_ml_training_runs_trigger CHECK (trigger_type IN (${inList(TRAINING_TRIGGERS)})),
      CONSTRAINT chk_ml_training_runs_status CHECK (status IN (${inList(TRAINING_RUN_STATUSES)}))
    );
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS ml_predictions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tender_id VARCHAR(100) NOT NULL,
      model_id INT NULL,
      segment_key VARCHAR(191) NULL,
      resolved_via VARCHAR(30) NOT NULL,
      score INT NOT NULL,
      probability DECIMAL(7,6) NULL,
      predicted_class VARCHAR(30) NULL,
      feature_vector JSON NULL,
      fallback_reason TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ml_predictions_tender (tender_id, created_at),
      INDEX idx_ml_predictions_model (model_id, created_at),
      CONSTRAINT fk_ml_predictions_model FOREIGN KEY (model_id) REFERENCES ml_models(id) ON DELETE SET NULL,
      CONSTRAINT chk_ml_predictions_resolved_via CHECK (resolved_via IN (${inList(RESOLVED_VIA)}))
    );
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS ml_corrections (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tender_id VARCHAR(100) NOT NULL,
      prediction_id BIGINT NULL,
      corrected_by VARCHAR(255) NOT NULL,
      original_score INT NULL,
      corrected_label VARCHAR(30) NOT NULL,
      reason_text TEXT NULL,
      source VARCHAR(20) NOT NULL,
      weight DECIMAL(6,3) NOT NULL DEFAULT 1.000,
      consumed_by_run_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ml_corrections_tender (tender_id),
      INDEX idx_ml_corrections_pending (consumed_by_run_id),
      CONSTRAINT fk_ml_corrections_prediction FOREIGN KEY (prediction_id) REFERENCES ml_predictions(id) ON DELETE SET NULL,
      CONSTRAINT fk_ml_corrections_run FOREIGN KEY (consumed_by_run_id) REFERENCES ml_training_runs(id) ON DELETE SET NULL,
      CONSTRAINT chk_ml_corrections_source CHECK (source IN (${inList(CORRECTION_SOURCES)}))
    );
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS ml_monitoring_metrics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      model_id INT NOT NULL,
      metric_name VARCHAR(100) NOT NULL,
      metric_value DOUBLE NULL,
      window_start TIMESTAMP NULL DEFAULT NULL,
      window_end TIMESTAMP NULL DEFAULT NULL,
      computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      breach BOOLEAN NOT NULL DEFAULT FALSE,
      INDEX idx_ml_monitoring_model_metric (model_id, metric_name, computed_at),
      CONSTRAINT fk_ml_monitoring_model FOREIGN KEY (model_id) REFERENCES ml_models(id) ON DELETE CASCADE
    );
  `);
}
