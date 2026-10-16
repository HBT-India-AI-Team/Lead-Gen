// Pure-function logistic regression: standardization, L2-regularized batch
// gradient descent, prediction. No I/O, no randomness — identical inputs
// always produce identical weights, which is what lets a training run be
// audited and reproduced.

function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Per-column mean and population standard deviation of `rows` (array of equal-length number arrays). */
export function fitStandardizer(rows) {
  const columns = rows[0]?.length ?? 0;
  const means = new Array(columns).fill(0);
  const stds = new Array(columns).fill(0);

  for (const row of rows) row.forEach((value, j) => { means[j] += value; });
  for (let j = 0; j < columns; j++) means[j] /= rows.length;

  for (const row of rows) row.forEach((value, j) => { stds[j] += (value - means[j]) ** 2; });
  for (let j = 0; j < columns; j++) stds[j] = Math.sqrt(stds[j] / rows.length);

  return { means, stds };
}

/**
 * Centers and scales one row. A column with zero variance in training is
 * only centered: every training row is then 0 in that column, so its
 * gradient is always zero and its weight stays exactly 0 — it can't move a
 * prediction either way.
 */
export function standardize(row, { means, stds }) {
  return row.map((value, j) => (value - means[j]) / (stds[j] > 0 ? stds[j] : 1));
}

function logLoss(X, y, weights, bias, l2) {
  const n = X.length;
  let loss = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(dot(weights, X[i]) + bias)));
    loss -= y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p);
  }
  const penalty = (l2 / 2) * weights.reduce((sum, w) => sum + w * w, 0);
  return (loss + penalty) / n;
}

function dot(a, b) {
  let sum = 0;
  for (let j = 0; j < a.length; j++) sum += a[j] * b[j];
  return sum;
}

/**
 * Fits weights + bias on already-standardized rows `X` with 0/1 labels `y`.
 * Minimizes mean log-loss + (l2 / 2n)·|w|² (the bias is not penalized).
 * Stops when an iteration improves the loss by less than `tolerance`.
 */
export function trainLogistic(X, y, { l2, learningRate, maxIterations, tolerance }) {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const weights = new Array(d).fill(0);
  let bias = 0;
  let previousLoss = logLoss(X, y, weights, bias, l2);
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      const error = sigmoid(dot(weights, X[i]) + bias) - y[i];
      for (let j = 0; j < d; j++) gradW[j] += error * X[i][j];
      gradB += error;
    }

    for (let j = 0; j < d; j++) weights[j] -= learningRate * ((gradW[j] + l2 * weights[j]) / n);
    bias -= learningRate * (gradB / n);

    const loss = logLoss(X, y, weights, bias, l2);
    if (Math.abs(previousLoss - loss) < tolerance) {
      previousLoss = loss;
      converged = true;
      iterations++;
      break;
    }
    previousLoss = loss;
  }

  return { weights, bias, iterations, converged, finalLoss: previousLoss };
}

/** Probability of the positive class for one standardized row. */
export function predictProbability({ weights, bias }, xStandardized) {
  return sigmoid(dot(weights, xStandardized) + bias);
}
