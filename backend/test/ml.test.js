// Pure ML modules: metrics, logistic regression, feature extraction, the
// out-of-distribution guard. No database or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as metrics from '../src/services/ml/metrics.js';
import * as lr from '../src/services/ml/logisticRegression.js';
import * as features from '../src/services/ml/featureService.js';
import { getEngine } from '../src/services/ml/engines/index.js';
import { DEFAULT_HYPERPARAMS, TRAINING_MINIMUMS } from '../src/services/ml/mlConfig.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const tender = {
  tender_id: 'T1',
  title: 'Construction of 2-lane road with paved shoulders, NH-544 Salem bypass',
  description: 'Works contract for road construction including culverts.',
  category: 'Works',
  amount_value: 486000000,
  tender_state: 'Tamil Nadu',
  contract_date: '2026-09-20',
  winning_company_name: 'Sri Murugan Infra Projects Private Limited',
  buyer_department: 'Public Works Department',
};
const profile = { annual_revenue: 1245000000, net_profit: 61000000, credit_rating: 'BBB+', compliance_status: 'Active Compliant' };

test('training needs 30 labels with at least 8 of each outcome', () => {
  assert.deepEqual(TRAINING_MINIMUMS, { rows: 30, rowsPerClass: 8 });
});

test('rocAuc matches the textbook example and handles ties and one class', () => {
  assert.ok(close(metrics.rocAuc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75));
  assert.ok(close(metrics.rocAuc([0.5, 0.5], [0, 1]), 0.5));
  assert.ok(close(metrics.rocAuc([0.9, 0.1, 0.5, 0.5], [1, 0, 1, 0]), 0.875));
  assert.equal(metrics.rocAuc([0.2, 0.3], [1, 1]), null);
});

test('confusionAt computes precision, recall and balanced accuracy', () => {
  const c = metrics.confusionAt([0.9, 0.85, 0.2, 0.81, 0.1], [1, 0, 1, 1, 0], 0.8);
  assert.deepEqual([c.tp, c.fp, c.tn, c.fn], [2, 1, 1, 1]);
  assert.ok(close(c.precision, 2 / 3) && close(c.recall, 2 / 3));
  assert.ok(close(c.balancedAccuracy, (2 / 3 + 1 / 2) / 2));
  assert.equal(metrics.confusionAt([0.1], [0], 0.8).precision, null);
});

test('brierScore', () => {
  assert.ok(close(metrics.brierScore([0.5, 0.5], [0, 1]), 0.25));
});

test('stratifiedSplit is reproducible and keeps both classes in the holdout', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: i, label: i < 10 ? 0 : 1 }));
  const a = metrics.stratifiedSplit(items, (x) => x.label, 0.3, 7);
  const b = metrics.stratifiedSplit(items, (x) => x.label, 0.3, 7);
  const c = metrics.stratifiedSplit(items, (x) => x.label, 0.3, 8);
  assert.deepEqual(a.holdout.map((x) => x.id), b.holdout.map((x) => x.id));
  assert.notDeepEqual(a.holdout.map((x) => x.id), c.holdout.map((x) => x.id));
  assert.equal(a.holdout.filter((x) => x.label === 0).length, 3);
  assert.equal(a.holdout.filter((x) => x.label === 1).length, 9);
  assert.equal(new Set([...a.train, ...a.holdout].map((x) => x.id)).size, 40);
});

test('logistic regression recovers the signal and ignores a constant column', () => {
  const random = metrics.seededRandom(42);
  const rows = [];
  const labels = [];
  for (let i = 0; i < 400; i++) {
    const x1 = random() * 4 - 2;
    const x2 = random() * 4 - 2;
    const p = 1 / (1 + Math.exp(-(2 * x1 - 1.5 * x2 + 0.3)));
    rows.push([x1, x2, 5]);
    labels.push(random() < p ? 1 : 0);
  }
  const s = lr.fitStandardizer(rows);
  const X = rows.map((r) => lr.standardize(r, s));
  const model = lr.trainLogistic(X, labels, DEFAULT_HYPERPARAMS);
  assert.ok(model.converged);
  assert.ok(model.weights[0] > 0.5 && model.weights[1] < -0.5, `signs wrong: ${model.weights}`);
  assert.equal(model.weights[2], 0, 'a constant column must keep weight exactly 0');
  assert.ok(metrics.rocAuc(X.map((x) => lr.predictProbability(model, x)), labels) > 0.85);
});

test('extractFeatures encodes a full lead and its segment', () => {
  const f = features.extractFeatures(tender, profile);
  assert.equal(f.values.length, features.FEATURES.length);
  assert.equal(f.named.probe42_found, 1);
  assert.ok(close(f.named.log_revenue, Math.log10(1245000000)));
  assert.ok(close(f.named.net_margin, 61000000 / 1245000000));
  assert.deepEqual(f.segment.keys, ['sector=construction|region=south', 'sector=construction', '__pooled__']);
});

test('missing Probe42 data is encoded as unknown, not bad', () => {
  const f = features.extractFeatures({ ...tender, tender_state: 'Atlantis', winning_company_name: null }, null);
  assert.equal(f.named.probe42_found, 0);
  assert.equal(f.named.revenue_disclosed, 0);
  assert.equal(f.named.log_revenue, 0);
  assert.equal(f.named.winning_company_known, 0);
  assert.equal(f.segment.region, 'unknown');
});

test('engine round trip, and leads unlike the training data are flagged', () => {
  const engine = getEngine('logistic_regression_js');
  const random = metrics.seededRandom(3);
  const rows = [];
  const labels = [];
  for (let i = 0; i < 60; i++) {
    const rev = 1e8 * (0.5 + random() * 20);
    const f = features.extractFeatures(tender, { ...profile, annual_revenue: rev, net_profit: rev * (random() * 0.1 - 0.02) });
    rows.push(f.values);
    labels.push(f.named.net_margin > 0.02 ? 1 : 0);
  }
  const artifact = engine.train({ rows, labels, hyperparams: DEFAULT_HYPERPARAMS });
  const stats = engine.trainingStats(artifact);

  const inDist = features.extractFeatures(tender, profile);
  const pred = engine.predict(artifact, inDist.values);
  assert.ok(pred.probability > 0 && pred.probability < 1);
  assert.equal(pred.contributions.length, features.FEATURES.length);
  assert.deepEqual(features.outOfDistributionReasons(inDist.values, stats), []);

  const reasons = features.outOfDistributionReasons(features.extractFeatures(tender, null).values, stats);
  assert.ok(reasons.some((r) => r.startsWith('Probe42 profile found')), JSON.stringify(reasons));

  const huge = features.extractFeatures(tender, { ...profile, annual_revenue: 1e16 });
  assert.ok(features.outOfDistributionReasons(huge.values, stats).some((r) => r.startsWith('Annual revenue')));
});
