import { CompanyIntelligenceService } from '../companyIntelligenceService.js';
import * as probe42Repository from '../../repositories/probe42Repository.js';
import * as leadSignalRepository from '../../repositories/leadSignalRepository.js';

// Gathers the REAL evidence available for one tender into the structured
// object the Ollama qualification prompt is built from (PHASE 1 spec §5).
// Every field traces back to a real MySQL row; nothing here invents a
// value. Read-only — this module never writes to any table.

// Bureaus/registries this codebase has genuinely never integrated with —
// listed explicitly (not silently omitted) so the AI knows they were
// considered and are unavailable, rather than assuming they weren't
// checked. Kept separate from `financialEvidence` below: Probe42's own
// derived long-term credit rating (when available) is real evidence, but
// it isn't a live per-bureau feed from any of these specific sources.
const UNAVAILABLE_RISK_SOURCES = ['CIBIL', 'CRIF', 'ACCOUNT_AGGREGATOR', 'CRISIL', 'ICRA', 'CARE', 'NCLT'];

const companyIntelligenceService = new CompanyIntelligenceService();

function mapTenderSignal(row) {
  if (!row) return null;
  return {
    type: row.signal_type,
    title: row.title,
    description: row.description,
    signalDate: row.signal_date,
    value: row.value,
    source: row.source,
  };
}

function mapCinSignal(row) {
  const rawData = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data;
  return {
    type: row.signal_type,
    title: row.title,
    description: row.description,
    signalDate: row.signal_date,
    value: row.value,
    source: row.source,
    rawData,
  };
}

/**
 * Collects real evidence for one `tenders` row (already loaded by the
 * caller) into the shape the qualification AI prompt consumes. The
 * winning company's Probe42 CIN — when a real match exists (same
 * normalizeForMatch() lookup already used to pull financial/credit/
 * compliance data for the deterministic score) — is reused to also pull
 * GST/expansion/new-registration signals for that same real company,
 * since that CIN is exactly what the deterministic scorer already trusts
 * enough to price revenue/profit/rating/compliance from. No fuzzy
 * matching happens here beyond that one already-established lookup.
 */
export async function collectQualificationEvidence(tender) {
  const intelligence = companyIntelligenceService.generateIntelligence(tender);

  const probe42Profile = tender.winning_company_name
    ? await probe42Repository.findByCompanyName(tender.winning_company_name)
    : null;

  const [tenderSignalRow, winSignalRow] = await Promise.all([
    leadSignalRepository.findTenderSignal(tender.tender_id),
    leadSignalRepository.findGovernmentTenderWinSignal(tender.tender_id),
  ]);

  const signals = [mapTenderSignal(tenderSignalRow), mapTenderSignal(winSignalRow)].filter(Boolean);

  let gstEvidence = [];
  let expansionEvidence = [];
  const unavailableEvidence = [];

  if (probe42Profile?.cin) {
    const cinSignals = await leadSignalRepository.findSignalsByCin(probe42Profile.cin);
    gstEvidence = cinSignals.filter((row) => row.signal_type === 'GST_REGISTRATION').map(mapCinSignal);
    expansionEvidence = cinSignals.filter((row) => row.signal_type === 'COMPANY_EXPANSION').map(mapCinSignal);
    const registrationSignals = cinSignals.filter((row) => row.signal_type === 'NEW_COMPANY_REGISTRATION').map(mapCinSignal);
    signals.push(...registrationSignals);

    if (gstEvidence.length === 0) unavailableEvidence.push('GST registration evidence unavailable for this company.');
    if (expansionEvidence.length === 0) unavailableEvidence.push('Company expansion evidence unavailable for this company.');
  } else {
    unavailableEvidence.push('No Probe42 company profile matched for this tender\'s winning company — GST/expansion/registration evidence unavailable.');
  }

  if (!tender.winning_company_name) {
    unavailableEvidence.push('No winning company identified yet for this tender.');
  }

  const financialEvidence = probe42Profile
    ? {
        annualRevenue: probe42Profile.annual_revenue ?? null,
        netProfit: probe42Profile.net_profit ?? null,
        creditRating: probe42Profile.credit_rating ?? null,
        incorporationDate: probe42Profile.incorporation_date ?? null,
        directorCount: probe42Profile.director_count ?? null,
      }
    : null;

  if (!financialEvidence) {
    unavailableEvidence.push('Probe42 financial data unavailable for this company.');
  } else {
    if (financialEvidence.annualRevenue == null) unavailableEvidence.push('Annual revenue not disclosed.');
    if (financialEvidence.netProfit == null) unavailableEvidence.push('Net profit not disclosed.');
    if (financialEvidence.creditRating == null) unavailableEvidence.push('Credit rating unavailable.');
  }

  const riskEvidence = {
    complianceStatus: probe42Profile?.compliance_status ?? null,
    ...Object.fromEntries(UNAVAILABLE_RISK_SOURCES.map((source) => [source, 'NOT_AVAILABLE'])),
  };
  unavailableEvidence.push(...UNAVAILABLE_RISK_SOURCES.map((source) => `${source} data unavailable.`));

  return {
    company: {
      name: tender.winning_company_name ?? null,
      cin: probe42Profile?.cin ?? null,
      state: tender.tender_state ?? null,
      industry: intelligence.industry ?? null,
      businessCategory: intelligence.businessCategory ?? null,
    },
    tender: {
      tenderId: tender.tender_id,
      title: tender.title ?? null,
      description: tender.description ?? null,
      category: tender.category ?? null,
      buyerDepartment: tender.buyer_department ?? null,
      amount: tender.amount ?? null,
      amountValue: tender.amount_value ?? null,
      winningCompanyName: tender.winning_company_name ?? null,
      winningBidAmount: tender.winning_bid_amount ?? null,
      location: tender.location ?? null,
      contractDate: tender.contract_date ?? null,
      source: tender.source ?? null,
    },
    signals,
    gstEvidence,
    expansionEvidence,
    financialEvidence: financialEvidence ?? {},
    riskEvidence,
    unavailableEvidence,
  };
}
