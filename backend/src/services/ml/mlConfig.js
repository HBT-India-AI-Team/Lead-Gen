// Centralized, editable settings for the Model Maintenance Agent — same
// convention as scoring/qualificationRules.js: every threshold that decides
// whether a model can be trained, promoted or trusted lives here, not in
// the services that apply it.

// Reserved segment: one model trained across every sector/region. Last
// model in the fallback chain before the deterministic rules engine.
export const POOLED_SEGMENT = '__pooled__';

export const DEFAULT_MODEL_TYPE = 'logistic_regression_js';

// Bump whenever featureService.js changes which features exist or how
// they're encoded. A model is only ever fed vectors of its own version.
export const FEATURE_SCHEMA_VERSION = 1;

// Stored on each ml_models row (training_config) so data source and
// schedule are configured per segment, not in code. A new candidate
// inherits the incumbent's config, or these defaults for a new segment.
export const DEFAULT_TRAINING_CONFIG = {
  labelSource: 'review_decisions',
  schedule: null,
};

// A training run refuses to fit a model on less than this. Logistic
// regression on a few dozen rows is defensible; on a handful it isn't.
export const TRAINING_MINIMUMS = {
  rows: 30,
  rowsPerClass: 8,
};

// Share of labelled rows held out (stratified) to compare candidate vs
// incumbent. The artifact that gets approved is the one trained on the
// remaining rows — exactly what was measured, nothing refit afterwards.
export const HOLDOUT_FRACTION = 0.3;

// Plain batch gradient descent on standardized features, weights start at
// zero — fully deterministic, so a run can be reproduced from its rows.
// No class weighting: the score is used as a probability against the
// business thresholds (80 / 60), so it has to stay calibrated.
export const DEFAULT_HYPERPARAMS = {
  l2: 1.0,
  learningRate: 0.1,
  maxIterations: 5000,
  tolerance: 1e-9,
};

// Promotion gate, applied before a candidate is ever proposed to an admin.
// ROC AUC is the primary metric because it doesn't depend on a threshold
// or on class balance (accuracy would be meaningless on skewed labels).
export const PROMOTION_GATE = {
  primaryMetric: 'rocAuc',
  minImprovement: 0.02,
  // Per-sector floor: in any sector with enough holdout rows of both
  // outcomes, the candidate may not fall more than this below incumbent.
  maxSegmentDrop: 0.05,
  minSegmentRows: 6,
  minSegmentRowsPerClass: 2,
};

// Score threshold used for precision/recall: the QUALIFIED_GOOD band, i.e.
// "proceed to proposal". Mirrors qualificationRules.js QUALIFIED_GOOD_MIN.
export const PROCEED_THRESHOLD = 0.8;

// Out-of-distribution guard. The model only scores leads that look like
// its training data; anything else drops to the rules engine. A feature
// that never varied in training (e.g. every labelled lead had a Probe42
// profile) carries no learned signal, so a lead where it differs is
// outside what the model knows. Numeric features further than this many
// training standard deviations from the training mean are treated the same.
export const OUT_OF_DISTRIBUTION_MAX_Z = 4;
