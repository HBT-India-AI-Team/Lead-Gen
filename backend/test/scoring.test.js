// The deterministic 100-point qualification score. No database or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQualificationScore, resolveLeadStatusFromScore } from '../src/services/scoring/qualificationScoringService.js';
import * as rules from '../src/services/scoring/qualificationRules.js';

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
const profile = { annual_revenue: 1245000000, net_profit: 61000000, credit_rating: 'AA', compliance_status: 'Active Compliant' };

const PROBE42_FACTORS = ['probe42Availability', 'revenueStrength', 'netProfitStrength', 'creditRating', 'complianceStatus'];

test('the ten factor maximums add up to exactly 100', () => {
  const max = (points) => Math.max(...Object.values(points));
  const total =
    max(rules.TENDER_VALUE_POINTS) +
    rules.GOVERNMENT_RELEVANCE_POINTS +
    max(rules.BUSINESS_FIT_POINTS) +
    rules.DATA_COMPLETENESS_MAX_POINTS +
    rules.WINNING_COMPANY_AVAILABLE_POINTS +
    rules.PROBE42_PROFILE_AVAILABLE_POINTS +
    rules.REVENUE_STRENGTH_MAX_POINTS +
    rules.NET_PROFIT_STRENGTH_MAX_POINTS +
    Math.max(...rules.CREDIT_RATING_RULES.map((r) => r.points)) +
    max({ compliant: rules.COMPLIANCE_STATUS_POINTS.compliant });
  assert.equal(total, 100);
});

test('a lead scores ten named factors and stays within 0-100', () => {
  const { score, factors } = computeQualificationScore(tender, profile);
  assert.equal(Object.keys(factors).length, 10);
  assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `score ${score}`);
  assert.equal(score, Object.values(factors).reduce((sum, f) => sum + f.points, 0));
});

test('missing financial data scores 0 and is never guessed', () => {
  const { factors } = computeQualificationScore(tender, null);
  for (const key of PROBE42_FACTORS) assert.equal(factors[key].points, 0, key);
});

test('a loss-making company scores 0 on net profit', () => {
  const { factors } = computeQualificationScore(tender, { ...profile, net_profit: -2500000 });
  assert.equal(factors.netProfitStrength.points, 0);
  assert.equal(computeQualificationScore(tender, profile).factors.netProfitStrength.points, 12);
});

test('score bands: under 60 rejected, 60-79 expert review, 80+ good', () => {
  assert.equal(resolveLeadStatusFromScore(0), 'QUALIFIED_BAD');
  assert.equal(resolveLeadStatusFromScore(59), 'QUALIFIED_BAD');
  assert.equal(resolveLeadStatusFromScore(60), 'QUALIFIED_HITL');
  assert.equal(resolveLeadStatusFromScore(79), 'QUALIFIED_HITL');
  assert.equal(resolveLeadStatusFromScore(80), 'QUALIFIED_GOOD');
  assert.equal(resolveLeadStatusFromScore(100), 'QUALIFIED_GOOD');
});
