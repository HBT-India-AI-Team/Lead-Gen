import { fitStandardizer, predictProbability, standardize, trainLogistic } from '../logisticRegression.js';
import { FEATURE_NAMES } from '../featureService.js';

// In-process logistic regression engine. The artifact is plain JSON
// (feature names, standardizer, weights, bias) stored inline on the
// ml_models row, so a model survives restarts and Cloud Run instances
// without any file storage. Every engine exposes this same shape — see
// engines/index.js — so moving training to Vertex AI is a second engine,
// not a change to the registry, retraining or scoring services.

export const jsLogisticEngine = {
  modelType: 'logistic_regression_js',

  /** Fits a model on raw (unstandardized) feature rows and 0/1 labels. */
  train({ rows, labels, hyperparams }) {
    const standardizer = fitStandardizer(rows);
    const X = rows.map((row) => standardize(row, standardizer));
    const fit = trainLogistic(X, labels, hyperparams);
    return {
      featureNames: FEATURE_NAMES,
      standardizer,
      weights: fit.weights,
      bias: fit.bias,
      training: { iterations: fit.iterations, converged: fit.converged, finalLoss: fit.finalLoss },
    };
  },

  /**
   * Scores one raw feature row. `contributions` is each feature's push on
   * the log-odds (weight × standardized value): positive pushes toward
   * "proceed", negative toward "reject".
   */
  predict(artifact, values) {
    const x = standardize(values, artifact.standardizer);
    return {
      probability: predictProbability(artifact, x),
      contributions: artifact.featureNames.map((feature, j) => ({ feature, value: values[j], contribution: artifact.weights[j] * x[j] })),
    };
  },

  /** Per-feature statistics of the training rows, used by the out-of-distribution guard. */
  trainingStats(artifact) {
    return artifact.standardizer;
  },

  /** Learned weight per feature on the standardized scale — directly comparable across features, so it doubles as feature importance. */
  featureWeights(artifact) {
    return artifact.featureNames.map((feature, j) => ({ feature, weight: artifact.weights[j] }));
  },
};
