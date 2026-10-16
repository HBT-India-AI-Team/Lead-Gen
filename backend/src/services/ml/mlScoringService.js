import * as mlPredictionRepository from '../../repositories/mlPredictionRepository.js';
import { resolveLeadStatusFromScore } from '../scoring/qualificationScoringService.js';
import { getEngine } from './engines/index.js';
import { FEATURES, extractFeatures, outOfDistributionReasons } from './featureService.js';
import { FEATURE_SCHEMA_VERSION, POOLED_SEGMENT } from './mlConfig.js';
import { resolveModelForLead } from './modelRegistryService.js';

// The qualification score for one lead: from the segment's active model
// when one resolves and the lead looks like that model's training data,
// otherwise from the deterministic rules engine — the designed floor.
// Whichever produced it, the score, the path taken and the exact feature
// vector are written to ml_predictions, so every score is attributable.
//
// Never throws: any failure on the model side falls back to the rules
// score (with the reason recorded), so qualification itself can't break
// because of the ML layer.

const TOP_CONTRIBUTIONS = 5;
const FEATURE_LABELS = Object.fromEntries(FEATURES.map((feature) => [feature.name, feature.label]));

function rulesScore(deterministicScore, fallbackReason, extra = {}) {
  return {
    source: 'rules',
    score: deterministicScore,
    probability: null,
    modelId: null,
    modelVersion: null,
    segmentKey: null,
    resolvedVia: 'deterministic',
    label: 'Rules engine',
    fallbackReason,
    ...extra,
  };
}

function topContributions(contributions) {
  return [...contributions]
    .filter(({ contribution }) => Math.abs(contribution) > 1e-6)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, TOP_CONTRIBUTIONS)
    .map(({ feature, value, contribution }) => ({
      feature,
      label: FEATURE_LABELS[feature] ?? feature,
      value: Math.round(value * 1000) / 1000,
      contribution: Math.round(contribution * 1000) / 1000,
    }));
}

async function recordPrediction(tenderId, features, result) {
  try {
    return await mlPredictionRepository.insertPrediction({
      tenderId,
      modelId: result.modelId,
      segmentKey: features?.segment.keys[0] ?? null,
      resolvedVia: result.resolvedVia,
      score: result.score,
      probability: result.probability,
      predictedClass: resolveLeadStatusFromScore(result.score),
      featureVector: features?.named ?? null,
      fallbackReason: result.fallbackReason ?? null,
    });
  } catch (error) {
    console.error(`[ML Scoring] Failed to record prediction for tender ${tenderId}:`, error.message);
    return null;
  }
}

/**
 * Scores one lead. `deterministicScore` is the rules engine's score for the
 * same lead (computeQualificationScore), used as-is on every fallback path.
 */
export async function scoreLead({ tender, probe42Profile, deterministicScore }) {
  let features = null;
  let result;

  try {
    features = extractFeatures(tender, probe42Profile);
    const { model, segmentKey, resolvedVia } = await resolveModelForLead(features.segment);

    if (!model) {
      result = rulesScore(deterministicScore, `No active model for ${features.segment.keys[0]} or its fallbacks.`);
    } else if (model.feature_schema?.version !== FEATURE_SCHEMA_VERSION) {
      result = rulesScore(deterministicScore, `Model v${model.version} (${segmentKey}) was trained on feature schema v${model.feature_schema?.version}; current is v${FEATURE_SCHEMA_VERSION}.`);
    } else {
      const engine = getEngine(model.model_type);
      const outOfDistribution = outOfDistributionReasons(features.values, engine.trainingStats(model.artifact));

      if (outOfDistribution.length > 0) {
        result = rulesScore(deterministicScore, `Lead is outside the training data of model v${model.version} (${segmentKey}).`, {
          attemptedModel: { modelId: model.id, modelVersion: model.version, segmentKey },
          outOfDistribution,
        });
      } else {
        const prediction = engine.predict(model.artifact, features.values);
        result = {
          source: 'model',
          score: Math.round(prediction.probability * 100),
          probability: Math.round(prediction.probability * 1e6) / 1e6,
          modelId: model.id,
          modelVersion: model.version,
          segmentKey,
          resolvedVia,
          label: `Model v${model.version} · ${segmentKey === POOLED_SEGMENT ? 'all segments' : segmentKey}`,
          fallbackReason: null,
          contributions: topContributions(prediction.contributions),
        };
      }
    }
  } catch (error) {
    console.error(`[ML Scoring] Model scoring failed for tender ${tender.tender_id}; using rules engine:`, error.message);
    result = rulesScore(deterministicScore, `Model scoring unavailable: ${error.message}`);
  }

  result.deterministicScore = deterministicScore;
  result.predictionId = await recordPrediction(tender.tender_id, features, result);
  return result;
}
