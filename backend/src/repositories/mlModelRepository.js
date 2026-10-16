import { run, all, get } from '../config/database.js';

// Data access for ml_models (the model registry). `db` defaults to the
// pool; pass a withTransaction() handle to run inside a transaction.

const defaultDb = { run, all, get };

// Listing columns — everything except the artifact blob, which only the
// scoring path needs.
const SUMMARY_COLUMNS = `id, segment_key, model_type, version, artifact_uri, feature_schema, hyperparams,
  metrics, training_config, trained_at, trained_by, status, promoted_at, retired_at, notes`;

function parseJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toModel(row) {
  if (!row) return null;
  return {
    ...row,
    artifact: parseJson(row.artifact),
    feature_schema: parseJson(row.feature_schema),
    hyperparams: parseJson(row.hyperparams),
    metrics: parseJson(row.metrics),
    training_config: parseJson(row.training_config),
  };
}

export async function nextVersion(segmentKey, db = defaultDb) {
  const row = await db.get('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM ml_models WHERE segment_key = ?', [segmentKey]);
  return Number(row.next);
}

/** Registers a new candidate. In-process artifacts are stored inline and addressed as inline:ml_models/<id>. */
export async function insertCandidate(
  { segmentKey, modelType, version, artifact, featureSchema, hyperparams, metrics, trainingConfig, trainedBy, notes },
  db = defaultDb
) {
  const result = await db.run(
    `INSERT INTO ml_models
       (segment_key, model_type, version, artifact_uri, artifact, feature_schema, hyperparams, metrics, training_config, trained_by, status, notes)
     VALUES (?, ?, ?, 'inline:pending', ?, ?, ?, ?, ?, ?, 'candidate', ?)`,
    [
      segmentKey,
      modelType,
      version,
      JSON.stringify(artifact),
      JSON.stringify(featureSchema),
      JSON.stringify(hyperparams),
      JSON.stringify(metrics),
      JSON.stringify(trainingConfig),
      trainedBy ?? null,
      notes ?? null,
    ]
  );
  await db.run('UPDATE ml_models SET artifact_uri = ? WHERE id = ?', [`inline:ml_models/${result.lastID}`, result.lastID]);
  return result.lastID;
}

export async function getModelById(id, { withArtifact = false, forUpdate = false } = {}, db = defaultDb) {
  const columns = withArtifact ? '*' : SUMMARY_COLUMNS;
  const row = await db.get(`SELECT ${columns} FROM ml_models WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return toModel(row);
}

/** The active model for one segment (with artifact), or null. */
export async function getActiveModel(segmentKey, db = defaultDb) {
  const row = await db.get(`SELECT * FROM ml_models WHERE segment_key = ? AND status = 'active'`, [segmentKey]);
  return toModel(row);
}

/** Active models (with artifacts) for any of `segmentKeys`, in one query — the scoring path's fallback-chain lookup. */
export async function getActiveModelsForSegments(segmentKeys) {
  if (segmentKeys.length === 0) return [];
  const rows = await all(`SELECT * FROM ml_models WHERE status = 'active' AND segment_key IN (?)`, [segmentKeys]);
  return rows.map(toModel);
}

export async function listModels({ segmentKey, status } = {}) {
  let sql = `SELECT ${SUMMARY_COLUMNS} FROM ml_models WHERE 1=1`;
  const params = [];
  if (segmentKey) {
    sql += ' AND segment_key = ?';
    params.push(segmentKey);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY segment_key, version DESC';
  const rows = await all(sql, params);
  return rows.map(toModel);
}

export async function retireActiveModel(segmentKey, note, db = defaultDb) {
  return db.run(
    `UPDATE ml_models SET status = 'retired', retired_at = NOW(), notes = CONCAT_WS('\n', notes, ?)
     WHERE segment_key = ? AND status = 'active'`,
    [note, segmentKey]
  );
}

export async function activateModel(id, db = defaultDb) {
  return db.run(`UPDATE ml_models SET status = 'active', promoted_at = NOW() WHERE id = ? AND status = 'candidate'`, [id]);
}

export async function retireModel(id, note, db = defaultDb) {
  return db.run(
    `UPDATE ml_models SET status = 'retired', retired_at = NOW(), notes = CONCAT_WS('\n', notes, ?)
     WHERE id = ? AND status <> 'retired'`,
    [note, id]
  );
}
