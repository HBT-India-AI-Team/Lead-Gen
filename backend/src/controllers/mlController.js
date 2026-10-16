import * as modelRegistryService from '../services/ml/modelRegistryService.js';
import * as retrainingService from '../services/ml/retrainingService.js';

// /api/ml — Model Maintenance Agent. No login (see routes/ml.js): every
// request acts as the fixed system account, whose name is recorded as the
// requester/approver of training runs and promotions.

function actorName(req) {
  const name = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ').trim();
  return name || req.user?.email || 'unknown';
}

function optionalNote(body) {
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  return note || null;
}

// GET /api/ml/overview — fallback chain, active models, pending candidates,
// labelled-outcome counts and the promotion gate settings.
export async function overview(req, res, next) {
  try {
    return res.status(200).json(await retrainingService.getOverview());
  } catch (error) {
    return next(error);
  }
}

// GET /api/ml/models?segmentKey=&status=
export async function listModels(req, res, next) {
  try {
    const models = await modelRegistryService.listModels({ segmentKey: req.query.segmentKey, status: req.query.status });
    return res.status(200).json({ models });
  } catch (error) {
    return next(error);
  }
}

// POST /api/ml/models/:id/promote — a reviewer approves a candidate. 409 unless
// its training run passed the promotion gate and is still current.
export async function promoteModel(req, res, next) {
  try {
    const result = await modelRegistryService.promoteModel(Number(req.params.id), actorName(req), optionalNote(req.body));
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// POST /api/ml/models/:id/retire — rejects a candidate, or takes the active
// model out of service (its segment falls back down the chain).
export async function retireModel(req, res, next) {
  try {
    const result = await modelRegistryService.retireModel(Number(req.params.id), actorName(req), optionalNote(req.body));
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/ml/training-runs?segmentKey=&status=&limit=
export async function listTrainingRuns(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const runs = await retrainingService.listTrainingRuns({ segmentKey: req.query.segmentKey, status: req.query.status, limit });
    return res.status(200).json({ runs });
  } catch (error) {
    return next(error);
  }
}

// GET /api/ml/training-runs/:id
export async function getTrainingRun(req, res, next) {
  try {
    return res.status(200).json(await retrainingService.getTrainingRun(Number(req.params.id)));
  } catch (error) {
    return next(error);
  }
}

// POST /api/ml/training-runs — manual retraining trigger. Always 201 with
// the finished run; a run that couldn't train (e.g. too few labels) comes
// back with status 'failed' and the reason in error_text.
export async function startTrainingRun(req, res, next) {
  try {
    const run = await retrainingService.startTrainingRun({
      segmentKey: req.body?.segmentKey || undefined,
      trigger: 'manual',
      requestedBy: actorName(req),
    });
    return res.status(201).json(run);
  } catch (error) {
    return next(error);
  }
}
