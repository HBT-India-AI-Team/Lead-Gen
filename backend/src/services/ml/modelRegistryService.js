import { withTransaction } from '../../config/database.js';
import * as mlModelRepository from '../../repositories/mlModelRepository.js';
import * as mlTrainingRunRepository from '../../repositories/mlTrainingRunRepository.js';
import { ApiError } from '../../utils/ApiError.js';
import { isValidId } from '../../utils/validators.js';

// Pillar 01 — Model Registry. Owns which model is live for each segment
// and the fallback chain the scoring path walks:
//
//   exact segment (sector + region) -> sector only -> __pooled__ -> rules engine
//
// The rules engine at the end is the designed floor, not an error case.
// Promotion is the only way a model goes live, and only for a candidate
// whose training run passed the promotion gate — never automatically.

const RESOLVED_VIA_BY_POSITION = ['exact_segment', 'sector_segment', 'pooled'];

export const FALLBACK_CHAIN = [
  { resolvedVia: 'exact_segment', label: 'Sector + region model' },
  { resolvedVia: 'sector_segment', label: 'Sector model' },
  { resolvedVia: 'pooled', label: 'Pooled model (all segments)' },
  { resolvedVia: 'deterministic', label: 'Rules engine (floor)' },
];

/**
 * Walks `segment.keys` (most specific first, see featureService.segmentOf)
 * and returns the first active model, or `model: null` with
 * resolvedVia 'deterministic' when none of them has one.
 */
export async function resolveModelForLead(segment) {
  const active = await mlModelRepository.getActiveModelsForSegments(segment.keys);
  for (let i = 0; i < segment.keys.length; i++) {
    const model = active.find((candidate) => candidate.segment_key === segment.keys[i]);
    if (model) return { model, segmentKey: segment.keys[i], resolvedVia: RESOLVED_VIA_BY_POSITION[i] };
  }
  return { model: null, segmentKey: null, resolvedVia: 'deterministic' };
}

// API shape of a model: the training-row id list kept on metrics (used by
// retraining to spot incumbent/holdout overlap) is summarized, not shipped.
function toPublicModel(model) {
  const training = model.metrics?.training;
  if (!training?.tenderIds) return model;
  const { tenderIds, ...rest } = training;
  return { ...model, metrics: { ...model.metrics, training: { ...rest, rows: rest.rows ?? tenderIds.length } } };
}

export async function listModels(filters) {
  return (await mlModelRepository.listModels(filters)).map(toPublicModel);
}

export async function getModel(id) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid model ID. Must be a positive integer.');
  const model = await mlModelRepository.getModelById(id);
  if (!model) throw ApiError.notFound(`Model ${id} not found.`);
  return toPublicModel(model);
}

/**
 * Admin approval: makes a candidate the active model for its segment and
 * retires the previous one, atomically. Refused unless the candidate's
 * training run passed the gate ('proposed'), and unless the segment's
 * active model is still the incumbent it was compared against — otherwise
 * the comparison the admin approved would no longer be true.
 */
export async function promoteModel(id, approvedBy, note) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid model ID. Must be a positive integer.');

  return withTransaction(async (tx) => {
    const candidate = await mlModelRepository.getModelById(id, { forUpdate: true }, tx);
    if (!candidate) throw ApiError.notFound(`Model ${id} not found.`);
    if (candidate.status !== 'candidate') {
      throw ApiError.conflict(`Model ${id} is ${candidate.status}; only a candidate can be promoted.`);
    }

    const run = await mlTrainingRunRepository.findRunByCandidateModelId(id, tx);
    if (!run || run.status !== 'proposed') {
      throw ApiError.conflict(
        `Model ${id} cannot be promoted: its training run ${run ? `is "${run.status}"` : 'is missing'}, and only candidates that passed the promotion gate can go live.`
      );
    }

    const currentActive = await mlModelRepository.getActiveModel(candidate.segment_key, tx);
    if ((currentActive?.id ?? null) !== (run.incumbent_model_id ?? null)) {
      throw ApiError.conflict(
        `The active model for ${candidate.segment_key} changed after this candidate was evaluated. Run retraining again to compare against the current model.`
      );
    }

    if (currentActive) {
      await mlModelRepository.retireActiveModel(candidate.segment_key, `Replaced by v${candidate.version} (approved by ${approvedBy}).`, tx);
    }
    await mlModelRepository.activateModel(id, tx);
    await mlTrainingRunRepository.markApproved(run.id, approvedBy, note, tx);

    return { promotedModelId: id, retiredModelId: currentActive?.id ?? null, trainingRunId: run.id };
  });
}

/**
 * Takes a model out of service. Retiring the active model drops its
 * segment to the next link of the fallback chain; retiring a candidate is
 * how an admin rejects it, which closes its training run as 'rejected'.
 */
export async function retireModel(id, retiredBy, note) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid model ID. Must be a positive integer.');

  return withTransaction(async (tx) => {
    const model = await mlModelRepository.getModelById(id, { forUpdate: true }, tx);
    if (!model) throw ApiError.notFound(`Model ${id} not found.`);
    if (model.status === 'retired') throw ApiError.conflict(`Model ${id} is already retired.`);

    await mlModelRepository.retireModel(id, `Retired by ${retiredBy}${note ? `: ${note}` : '.'}`, tx);

    let rejectedRunId = null;
    if (model.status === 'candidate') {
      const run = await mlTrainingRunRepository.findRunByCandidateModelId(id, tx);
      if (run && ['proposed', 'gate_failed'].includes(run.status)) {
        await mlTrainingRunRepository.markRejected(run.id, retiredBy, note, tx);
        rejectedRunId = run.id;
      }
    }

    return { retiredModelId: id, previousStatus: model.status, rejectedTrainingRunId: rejectedRunId };
  });
}
