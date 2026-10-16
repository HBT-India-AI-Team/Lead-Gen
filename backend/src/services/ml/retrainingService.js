import * as mlModelRepository from '../../repositories/mlModelRepository.js';
import * as mlTrainingRunRepository from '../../repositories/mlTrainingRunRepository.js';
import { ApiError } from '../../utils/ApiError.js';
import { isValidId } from '../../utils/validators.js';
import { buildExamples, loadLabelledLeads, summarizeLabels } from './datasetService.js';
import { getEngine } from './engines/index.js';
import { FEATURES, currentFeatureSchema, segmentOf } from './featureService.js';
import { rocAuc, stratifiedSplit, summarize } from './metrics.js';
import {
  DEFAULT_HYPERPARAMS,
  DEFAULT_MODEL_TYPE,
  DEFAULT_TRAINING_CONFIG,
  FEATURE_SCHEMA_VERSION,
  HOLDOUT_FRACTION,
  POOLED_SEGMENT,
  PROCEED_THRESHOLD,
  PROMOTION_GATE,
  TRAINING_MINIMUMS,
} from './mlConfig.js';
import { FALLBACK_CHAIN, listModels, retireModel } from './modelRegistryService.js';

// Pillar 02 — Retraining Pipeline:
//   pull labels -> build features -> train candidate -> evaluate it against
//   the incumbent on a held-out set -> apply the promotion gate -> propose.
//
// It never promotes. A run that passes the gate ends as 'proposed' with
// its candidate waiting for an admin (modelRegistryService.promoteModel);
// one that doesn't ends as 'gate_failed' and its candidate is retired.
// The incumbent is the segment's active model, or — when no model is live
// yet — the deterministic rules engine, scored on the very same rows.

const SEGMENT_KEY_PATTERN = /^(__pooled__|sector=[a-z0-9-]+(\|region=[a-z]+)?)$/;
const TRIGGERS = ['schedule', 'event', 'manual'];
const AGENT_NAME = 'Model Maintenance Agent';
const FEATURE_LABELS = Object.fromEntries(FEATURES.map((feature) => [feature.name, feature.label]));

class TrainingDataError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

/**
 * Split seed derived from the labelled data itself (FNV-1a over the sorted
 * lead ids and their labels). Re-running on unchanged data reproduces the
 * exact same train/holdout split, so a candidate's gate verdict can't be
 * changed by simply retrying until a lucky split comes up; it only changes
 * when the labelled data does.
 */
function splitSeed(examples) {
  const key = examples.map((example) => `${example.tenderId}:${example.label}`).sort().join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function classCounts(examples) {
  const positives = examples.filter((example) => example.label === 1).length;
  return { n: examples.length, positives, negatives: examples.length - positives };
}

// The sub-segments the per-segment floor is checked over, one level below
// the run's own segment: sectors for a pooled run, regions for a sector run.
function subSegmentKey(example, segmentKey) {
  if (segmentKey === POOLED_SEGMENT) return example.features.segment.keys[1];
  if (!segmentKey.includes('|')) return example.features.segment.keys[0];
  return null;
}

function compareSegments(holdout, segmentKey, candidateScore, incumbentScore) {
  const groups = new Map();
  for (const example of holdout) {
    const key = subSegmentKey(example, segmentKey);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(example);
  }

  return [...groups.entries()].map(([key, examples]) => {
    const counts = classCounts(examples);
    const evaluable =
      counts.n >= PROMOTION_GATE.minSegmentRows &&
      counts.positives >= PROMOTION_GATE.minSegmentRowsPerClass &&
      counts.negatives >= PROMOTION_GATE.minSegmentRowsPerClass;
    const labels = examples.map((example) => example.label);
    const candidate = evaluable ? rocAuc(examples.map(candidateScore), labels) : null;
    const incumbent = evaluable ? rocAuc(examples.map(incumbentScore), labels) : null;
    const delta = candidate != null && incumbent != null ? candidate - incumbent : null;
    return {
      segmentKey: key,
      ...counts,
      evaluable,
      candidate,
      incumbent,
      delta,
      passed: !evaluable || delta >= -PROMOTION_GATE.maxSegmentDrop - 1e-12,
    };
  });
}

function applyPromotionGate(candidateMetrics, incumbentMetrics, segments) {
  const metric = PROMOTION_GATE.primaryMetric;
  const candidate = candidateMetrics[metric];
  const incumbent = incumbentMetrics[metric];
  const improvement = candidate != null && incumbent != null ? candidate - incumbent : null;

  const evaluable = segments.filter((segment) => segment.evaluable);
  const regressions = evaluable.filter((segment) => !segment.passed);

  const checks = [
    {
      name: 'primary_metric',
      label: `ROC AUC beats the incumbent by at least ${PROMOTION_GATE.minImprovement}`,
      passed: improvement != null && improvement >= PROMOTION_GATE.minImprovement - 1e-12,
      detail:
        improvement == null
          ? 'ROC AUC could not be computed on the holdout.'
          : `${candidate.toFixed(3)} vs ${incumbent.toFixed(3)} (${improvement >= 0 ? '+' : ''}${improvement.toFixed(3)})`,
    },
    {
      name: 'segment_floor',
      label: `No segment falls more than ${PROMOTION_GATE.maxSegmentDrop} ROC AUC below the incumbent`,
      passed: regressions.length === 0,
      detail:
        evaluable.length === 0
          ? 'No segment had enough holdout rows of both outcomes to compare, so none could regress.'
          : regressions.length > 0
            ? `Regressed: ${regressions.map((segment) => `${segment.segmentKey} (${segment.delta.toFixed(3)})`).join(', ')}`
            : `${evaluable.length} segment(s) checked, none regressed.`,
    },
  ];

  return { passed: checks.every((check) => check.passed), improvement, checks };
}

function compareWeights(engine, artifact, incumbentModel) {
  const incumbentWeights = incumbentModel
    ? Object.fromEntries(getEngine(incumbentModel.model_type).featureWeights(incumbentModel.artifact).map(({ feature, weight }) => [feature, weight]))
    : null;

  return engine
    .featureWeights(artifact)
    .map(({ feature, weight }) => ({
      feature,
      label: FEATURE_LABELS[feature] ?? feature,
      candidate: weight,
      incumbent: incumbentWeights ? incumbentWeights[feature] ?? 0 : null,
      change: incumbentWeights ? weight - (incumbentWeights[feature] ?? 0) : null,
    }))
    .sort((a, b) => Math.abs(b.candidate) - Math.abs(a.candidate));
}

function caveats(holdout, incumbentInfo) {
  const notes = [
    'Labels are expert proposal decisions, and proposals only exist for leads the rules engine scored 80+, so the model learns to rank within that group. Leads unlike its training data fall back to the rules engine at scoring time.',
  ];
  if (holdout.length < 30) {
    notes.push(`The holdout has only ${holdout.length} rows, so differences of a few AUC points are within noise.`);
  }
  if (incumbentInfo.holdoutRowsSeenInTraining > 0) {
    notes.push(`${incumbentInfo.holdoutRowsSeenInTraining} holdout row(s) were in the incumbent's own training data, which flatters the incumbent; the comparison is conservative.`);
  }
  return notes;
}

async function executeRun(runId, segmentKey, requestedBy) {
  const incumbent = await mlModelRepository.getActiveModel(segmentKey);
  const trainingConfig = incumbent?.training_config ?? DEFAULT_TRAINING_CONFIG;

  const leads = (await loadLabelledLeads(trainingConfig.labelSource)).filter(
    (lead) => segmentKey === POOLED_SEGMENT || segmentOf(lead.tender).keys.includes(segmentKey)
  );
  const counts = classCounts(leads);
  if (
    counts.n < TRAINING_MINIMUMS.rows ||
    counts.positives < TRAINING_MINIMUMS.rowsPerClass ||
    counts.negatives < TRAINING_MINIMUMS.rowsPerClass
  ) {
    throw new TrainingDataError(
      `Not enough labelled outcomes for ${segmentKey}: ${counts.n} (${counts.positives} approved, ${counts.negatives} rejected). ` +
        `Training needs at least ${TRAINING_MINIMUMS.rows}, with ${TRAINING_MINIMUMS.rowsPerClass} of each outcome.`,
      { rowCount: counts.n, comparison: { segmentKey, labelSource: trainingConfig.labelSource, data: counts, minimums: TRAINING_MINIMUMS } }
    );
  }

  const examples = await buildExamples(leads);
  const { train, holdout } = stratifiedSplit(examples, (example) => example.label, HOLDOUT_FRACTION, splitSeed(examples));

  const engine = getEngine(DEFAULT_MODEL_TYPE);
  const hyperparams = { ...DEFAULT_HYPERPARAMS };
  const artifact = engine.train({ rows: train.map((e) => e.features.values), labels: train.map((e) => e.label), hyperparams });
  const candidateScore = (example) => engine.predict(artifact, example.features.values).probability;

  // Incumbent: the active model if it speaks the current feature schema,
  // otherwise the rules engine's own score for the same lead.
  const comparableIncumbent = incumbent && incumbent.feature_schema?.version === FEATURE_SCHEMA_VERSION ? incumbent : null;
  let incumbentScore;
  let incumbentInfo;
  if (comparableIncumbent) {
    const incumbentEngine = getEngine(comparableIncumbent.model_type);
    const seen = new Set(comparableIncumbent.metrics?.training?.tenderIds ?? []);
    incumbentScore = (example) => incumbentEngine.predict(comparableIncumbent.artifact, example.features.values).probability;
    incumbentInfo = {
      kind: 'model',
      modelId: comparableIncumbent.id,
      version: comparableIncumbent.version,
      label: `Model v${comparableIncumbent.version} (active)`,
      holdoutRowsSeenInTraining: holdout.filter((example) => seen.has(example.tenderId)).length,
    };
  } else {
    incumbentScore = (example) => example.deterministicScore / 100;
    incumbentInfo = {
      kind: 'rules',
      modelId: null,
      label: 'Rules engine',
      holdoutRowsSeenInTraining: 0,
      note: incumbent
        ? `Active model v${incumbent.version} uses feature schema v${incumbent.feature_schema?.version}, so the candidate is compared against the rules engine instead.`
        : 'No model is active for this segment yet, so the candidate is compared against the rules engine.',
    };
  }

  const holdoutLabels = holdout.map((example) => example.label);
  const candidateMetrics = summarize(holdout.map(candidateScore), holdoutLabels, PROCEED_THRESHOLD);
  const incumbentMetrics = summarize(holdout.map(incumbentScore), holdoutLabels, PROCEED_THRESHOLD);
  const trainMetrics = summarize(train.map(candidateScore), train.map((e) => e.label), PROCEED_THRESHOLD);
  const segments = compareSegments(holdout, segmentKey, candidateScore, incumbentScore);
  const gate = applyPromotionGate(candidateMetrics, incumbentMetrics, segments);

  const version = await mlModelRepository.nextVersion(segmentKey);
  const candidateModelId = await mlModelRepository.insertCandidate({
    segmentKey,
    modelType: engine.modelType,
    version,
    artifact,
    featureSchema: currentFeatureSchema(),
    hyperparams,
    metrics: {
      holdout: candidateMetrics,
      train: trainMetrics,
      training: { ...artifact.training, rows: train.length, tenderIds: train.map((e) => e.tenderId) },
      trainingRunId: runId,
    },
    trainingConfig,
    trainedBy: requestedBy ?? AGENT_NAME,
    notes: gate.passed ? `Proposed by training run #${runId}; awaiting admin approval.` : null,
  });

  const labelledAt = examples.map((e) => new Date(e.labelledAt)).filter((date) => !Number.isNaN(date.getTime()));
  const comparison = {
    segmentKey,
    primaryMetric: PROMOTION_GATE.primaryMetric,
    proceedThreshold: PROCEED_THRESHOLD,
    labelSource: trainingConfig.labelSource,
    data: { ...classCounts(examples), train: classCounts(train), holdout: classCounts(holdout) },
    candidate: { modelId: candidateModelId, version, label: `Candidate v${version}`, metrics: candidateMetrics, trainMetrics, training: artifact.training },
    incumbent: { ...incumbentInfo, metrics: incumbentMetrics },
    segments,
    gate,
    featureWeights: compareWeights(engine, artifact, comparableIncumbent),
    caveats: caveats(holdout, incumbentInfo),
  };

  await mlTrainingRunRepository.completeRun(runId, {
    status: gate.passed ? 'proposed' : 'gate_failed',
    rowCount: examples.length,
    labelWindowStart: labelledAt.length ? new Date(Math.min(...labelledAt)) : null,
    labelWindowEnd: labelledAt.length ? new Date(Math.max(...labelledAt)) : null,
    candidateModelId,
    incumbentModelId: incumbent?.id ?? null,
    comparison,
  });

  if (!gate.passed) {
    await mlModelRepository.retireModel(candidateModelId, `Did not pass the promotion gate (training run #${runId}).`);
    return;
  }

  // A newer proposal supersedes any older one still waiting for this segment.
  const waiting = await mlModelRepository.listModels({ segmentKey, status: 'candidate' });
  for (const stale of waiting.filter((model) => model.id !== candidateModelId)) {
    await retireModel(stale.id, AGENT_NAME, `Superseded by training run #${runId}.`);
  }
}

/**
 * Runs one retraining attempt end to end and returns the finished run.
 * Training data problems and unexpected errors both end the run as
 * 'failed' with the reason in error_text — they never throw to the caller.
 */
export async function startTrainingRun({ segmentKey = POOLED_SEGMENT, trigger = 'manual', requestedBy = null } = {}) {
  if (!SEGMENT_KEY_PATTERN.test(segmentKey)) {
    throw ApiError.badRequest(`"segmentKey" must be "${POOLED_SEGMENT}", "sector=<sector>" or "sector=<sector>|region=<region>".`);
  }
  if (!TRIGGERS.includes(trigger)) {
    throw ApiError.badRequest(`"trigger" must be one of: ${TRIGGERS.join(', ')}.`);
  }

  const runId = await mlTrainingRunRepository.createRun({ segmentKey, triggerType: trigger, requestedBy });
  try {
    await executeRun(runId, segmentKey, requestedBy);
  } catch (error) {
    if (!(error instanceof TrainingDataError)) console.error(`[Retraining] Run #${runId} failed:`, error);
    await mlTrainingRunRepository.failRun(runId, error.message, error.details ?? {});
  }
  return getTrainingRun(runId);
}

export async function getTrainingRun(id) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid training run ID. Must be a positive integer.');
  const run = await mlTrainingRunRepository.getRunById(id);
  if (!run) throw ApiError.notFound(`Training run ${id} not found.`);
  return run;
}

export async function listTrainingRuns(filters) {
  return mlTrainingRunRepository.listRuns(filters);
}

/** Everything the Model Maintenance screen needs up front. */
export async function getOverview() {
  const [labels, models] = await Promise.all([summarizeLabels(DEFAULT_TRAINING_CONFIG.labelSource), listModels({})]);
  return {
    fallbackChain: FALLBACK_CHAIN,
    activeModels: models.filter((model) => model.status === 'active'),
    pendingCandidates: models.filter((model) => model.status === 'candidate'),
    labels,
    promotionGate: PROMOTION_GATE,
    holdoutFraction: HOLDOUT_FRACTION,
    crmFeed: {
      connected: false,
      note: 'Business NXT CRM outcome feed is not connected yet; models train on expert proposal decisions (cold start).',
    },
  };
}
