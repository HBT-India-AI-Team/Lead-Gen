// Pure evaluation metrics for binary outcome models. Every function returns
// null (never a misleading number) when the metric is undefined for the
// given rows, e.g. AUC with only one class present.

/**
 * ROC AUC via the rank-sum (Mann-Whitney U) formulation, with tied scores
 * given their average rank. Equals the probability that a randomly chosen
 * positive is scored above a randomly chosen negative.
 */
export function rocAuc(scores, labels) {
  const positives = labels.filter((label) => label === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const order = scores.map((score, i) => ({ score, label: labels[i] })).sort((a, b) => a.score - b.score);
  let rankSumPositives = 0;
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].score === order[i].score) j++;
    const averageRank = (i + j + 2) / 2; // ranks are 1-based
    for (let k = i; k <= j; k++) if (order[k].label === 1) rankSumPositives += averageRank;
    i = j + 1;
  }

  return (rankSumPositives - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** Confusion counts and the rates derived from them at a fixed threshold (score >= threshold → predicted positive). */
export function confusionAt(scores, labels, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  scores.forEach((score, i) => {
    const predicted = score >= threshold ? 1 : 0;
    if (predicted === 1 && labels[i] === 1) tp++;
    else if (predicted === 1) fp++;
    else if (labels[i] === 1) fn++;
    else tn++;
  });

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : null;
  const f1 = precision != null && recall != null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  const balancedAccuracy = recall != null && specificity != null ? (recall + specificity) / 2 : null;

  return { tp, fp, tn, fn, precision, recall, f1, balancedAccuracy };
}

/** Mean squared error of probabilities against 0/1 outcomes (lower is better; 0.25 = always guessing 0.5). */
export function brierScore(probabilities, labels) {
  if (labels.length === 0) return null;
  return probabilities.reduce((sum, p, i) => sum + (p - labels[i]) ** 2, 0) / labels.length;
}

/** All headline metrics for one scorer on one set of rows. */
export function summarize(probabilities, labels, threshold) {
  const positives = labels.filter((label) => label === 1).length;
  const confusion = confusionAt(probabilities, labels, threshold);
  return {
    n: labels.length,
    positives,
    negatives: labels.length - positives,
    rocAuc: rocAuc(probabilities, labels),
    precision: confusion.precision,
    recall: confusion.recall,
    f1: confusion.f1,
    balancedAccuracy: confusion.balancedAccuracy,
    brier: brierScore(probabilities, labels),
    confusion: { tp: confusion.tp, fp: confusion.fp, tn: confusion.tn, fn: confusion.fn },
  };
}

/** Small seeded PRNG (mulberry32) so a split is reproducible from its seed. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stratified train/holdout split: each class is shuffled with the seeded
 * PRNG and `fraction` of it (at least one row, if the class has two or
 * more) goes to holdout, so both outcomes are always represented there.
 */
export function stratifiedSplit(items, labelOf, fraction, seed) {
  const random = seededRandom(seed);
  const train = [];
  const holdout = [];

  for (const label of [0, 1]) {
    const group = items.filter((item) => labelOf(item) === label);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    const holdoutCount = group.length >= 2 ? Math.max(1, Math.round(group.length * fraction)) : 0;
    holdout.push(...group.slice(0, holdoutCount));
    train.push(...group.slice(holdoutCount));
  }

  return { train, holdout };
}
