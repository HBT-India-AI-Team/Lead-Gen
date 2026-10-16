import { run, all, get } from '../config/database.js';
import { buildProposalSummary, generateProposalEmail, shouldRegenerateDraft } from './emailGenerator.js';
import { ApiError } from '../utils/ApiError.js';

// Recommendation-inference helpers used only by initiateResearch() below.
// Kept local (not in services/recommendations/) since that path now holds
// the unrelated BankingRecommendationService — these are legacy demo
// helpers for the /api/v1/discovery flow, not part of that rule engine.

/** Infers the primary banking product/service to pitch based on sector/tag keywords. */
function inferPrimaryService(sector = '', tags = '') {
  const text = `${sector} ${tags}`.toLowerCase();
  if (/(tender|procurement|government|contract)/.test(text)) return 'Bank Guarantee';
  if (/(export|import|cross-border|fintech)/.test(text)) return 'Trade Finance';
  if (/(equipment|fleet|warehouse|healthcare|logistics)/.test(text)) return 'Equipment Finance';
  if (/(expansion|project|capex)/.test(text)) return 'Term Loan';
  return 'Working Capital Loan';
}

/** Builds a human-readable growth-signal sentence used as the predictive need's trigger context. */
function buildTriggerSignal(companyName, sector, tags = '', sourceUrl = '') {
  const text = `${sector} ${tags} ${sourceUrl}`.toLowerCase();
  if (/(tender|procurement|government|gem|cppp)/.test(text)) {
    return `${companyName} shows a recent tender or procurement-linked growth signal`;
  }
  if (/(export|import|cross-border|global)/.test(text)) {
    return `${companyName} shows cross-border transaction and trade growth signals`;
  }
  if (/(equipment|fleet|warehouse|healthcare|logistics)/.test(text)) {
    return `${companyName} shows capacity expansion or asset investment signals`;
  }
  if (/(funding|investment|venture)/.test(text)) {
    return `${companyName} shows fresh funding and growth deployment signals`;
  }
  return `${companyName} shows business growth signals in ${sector || 'its sector'}`;
}

/**
 * Creates a legacy_companies placeholder row plus a default predictive
 * need and a first-draft proposal, for the legacy /api/v1/discovery demo
 * flow. Business logic extracted from the original inline route handler —
 * behavior unchanged.
 */
export async function initiateResearch(payload) {
  const { name, sector, data_source_url: dataSourceUrl, tags, opportunity_score: opportunityScore, risk_score: riskScore } = payload;

  if (!sector && !dataSourceUrl) {
    throw ApiError.badRequest('Either "sector" or "data_source_url" must be provided in the payload.');
  }

  const companyName = name || `Research Placeholder (${sector || dataSourceUrl})`;
  const companySector = sector || 'Unassigned';
  const sourceUrl = dataSourceUrl || '';
  const companyTags = tags || 'research,placeholder';
  const oppScore = opportunityScore !== undefined ? parseInt(opportunityScore) : 50;
  const rskScore = riskScore !== undefined ? parseInt(riskScore) : 30;
  const executionStatus = 'pending';

  const companyResult = await run(
    `INSERT INTO legacy_companies (name, sector, focus_area, data_source_url, tags, opportunity_score, risk_score, execution_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyName, companySector, 'Pending Analysis', sourceUrl, companyTags, oppScore, rskScore, executionStatus]
  );
  const newCompanyId = companyResult.lastID;

  // Seed a default predictive need + proposal draft so the placeholder is
  // immediately usable by the recommendations endpoint below.
  const defaultServiceName = inferPrimaryService(companySector, companyTags);
  const defaultTrigger = buildTriggerSignal(companyName, companySector, companyTags, sourceUrl);
  await run(
    `INSERT INTO predictive_needs (company_id, service_name, trigger_signal) VALUES (?, ?, ?)`,
    [newCompanyId, defaultServiceName, defaultTrigger]
  );

  const companyForDraft = {
    id: newCompanyId,
    name: companyName,
    sector: companySector,
    focus_area: 'Pending Analysis',
    data_source_url: sourceUrl,
    tags: companyTags,
    opportunity_score: oppScore,
    risk_score: rskScore,
    execution_status: executionStatus
  };
  const needForDraft = { service_name: defaultServiceName, trigger_signal: defaultTrigger };
  const defaultSummary = buildProposalSummary(companyForDraft, needForDraft);
  const defaultDraft = await generateProposalEmail(companyForDraft, needForDraft);
  await run(
    `INSERT INTO proposals (company_id, proposal_summary, email_draft, status) VALUES (?, ?, ?, ?)`,
    [newCompanyId, defaultSummary, defaultDraft, 'pending_approval']
  );

  const company = await get('SELECT * FROM legacy_companies WHERE id = ?', [newCompanyId]);
  const predictiveNeeds = await all('SELECT * FROM predictive_needs WHERE company_id = ?', [newCompanyId]);
  const proposals = await all('SELECT * FROM proposals WHERE company_id = ?', [newCompanyId]);

  return { ...company, predictive_needs: predictiveNeeds, proposals };
}

/**
 * Returns legacy_companies filtered by sector/opportunity score, joined
 * with sector risk data, predictive needs and proposals — regenerating
 * any stale generic-research email drafts along the way. Business logic
 * extracted from the original inline route handler — behavior unchanged.
 */
export async function getRecommendations({ sector, minOpportunityScore, opportunityScore } = {}) {
  let sql = `
    SELECT
      c.id, c.name, c.sector, c.focus_area, c.data_source_url, c.tags, c.opportunity_score, c.risk_score, c.execution_status,
      s.industry_growth AS sector_industry_growth, s.risk_level AS sector_risk_level, s.risk_reason AS sector_risk_reason
    FROM legacy_companies c
    LEFT JOIN sectors s ON c.sector = s.name
    WHERE 1=1
  `;
  const params = [];

  if (sector) {
    sql += ' AND LOWER(c.sector) = LOWER(?)';
    params.push(sector);
  }

  if (opportunityScore) {
    sql += ' AND c.opportunity_score = ?';
    params.push(parseInt(opportunityScore));
  } else if (minOpportunityScore) {
    sql += ' AND c.opportunity_score >= ?';
    params.push(parseInt(minOpportunityScore));
  }

  const companies = await all(sql, params);
  if (companies.length === 0) {
    return [];
  }

  const companyIds = companies.map((c) => c.id);
  const placeholders = companyIds.map(() => '?').join(',');

  const needs = await all(
    `SELECT id, company_id, service_name, trigger_signal FROM predictive_needs WHERE company_id IN (${placeholders})`,
    companyIds
  );
  const proposals = await all(
    `SELECT id, company_id, proposal_summary, email_draft, status FROM proposals WHERE company_id IN (${placeholders})`,
    companyIds
  );

  for (const proposal of proposals) {
    if (!shouldRegenerateDraft(proposal.email_draft)) continue;

    const company = companies.find((c) => c.id === proposal.company_id);
    const primaryNeed = needs.find((n) => n.company_id === proposal.company_id) || {};
    const refreshedDraft = await generateProposalEmail(company, primaryNeed);
    const refreshedSummary = buildProposalSummary(company, primaryNeed);

    proposal.email_draft = refreshedDraft;
    proposal.proposal_summary = refreshedSummary;

    await run(
      `UPDATE proposals SET proposal_summary = ?, email_draft = ? WHERE id = ?`,
      [refreshedSummary, refreshedDraft, proposal.id]
    );
  }

  return companies.map((company) => {
    const tagsList = company.tags ? company.tags.split(',').map((t) => t.trim()) : [];

    return {
      id: company.id,
      name: company.name,
      sector: company.sector,
      focus_area: company.focus_area,
      data_source_url: company.data_source_url,
      tags: tagsList,
      opportunity_score: company.opportunity_score,
      risk_score: company.risk_score,
      execution_status: company.execution_status,
      risk_state: {
        level: company.sector_risk_level || 'Low',
        reason: company.sector_risk_reason || 'No significant sector risks identified.',
        industry_growth: company.sector_industry_growth || 'Steady'
      },
      predictive_needs: needs.filter((n) => n.company_id === company.id).map((n) => ({
        id: n.id,
        service_name: n.service_name,
        trigger_signal: n.trigger_signal
      })),
      proposals: proposals.filter((p) => p.company_id === company.id).map((p) => ({
        id: p.id,
        proposal_summary: p.proposal_summary,
        email_draft: p.email_draft,
        status: p.status
      }))
    };
  });
}