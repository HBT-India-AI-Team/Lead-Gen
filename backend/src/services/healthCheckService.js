import * as tenderService from './tenderService.js';
import * as probe42Repository from '../repositories/probe42Repository.js';
import { generateLeadAnalysis } from './leadAnalysisService.js';
import {
  computeFinancialHealthScore,
  computeBusinessVintageScore,
  computeCreditRatingScore,
  computeComplianceScore,
} from './scoring/companyProfileScoringService.js';

// "Health Check" repurposes the existing, already-working /api/lead-analysis
// pipeline (leadAnalysisService -> CompanyIntelligenceService ->
// LeadScoringService -> BankingRecommendationService) completely
// unmodified — none of those files change for this feature. This module is
// the ONLY integration point between the tender workflow and that scoring
// engine: if the engine is later swapped for a real financial-health model,
// only runHealthCheck() below needs to change, not the controller/route/
// frontend layers above it.
//
// companyProfile comes from the Probe42-demo dataset (see
// src/repositories/probe42Repository.js) — a stand-in for a real KYB/
// financial-data provider. Its fields are merged into the analysis input
// under a `probe42*` prefix so they never collide with the tender record's
// own field names; CompanyIntelligenceService has no rules for them today
// (it only reads fields it already knows about), so they pass through
// unused by the score itself but are still returned as-is in `companyProfile`
// for the UI to display alongside the score.

export async function runHealthCheck(tenderId) {
  const tender = await tenderService.getTenderById(tenderId);

  // company_name on `tenders` is the tender-ISSUING buyer (e.g. "Central
  // Railway" — see documentProcessorService.js's extractTenderFields, which
  // sets it from the card's title/buyer), not the winning bidder. The
  // company actually being health-checked is whoever won the tender, so
  // that name is what both the Probe42 lookup and the intelligence layer's
  // `company`/`company_name` fields must resolve to — otherwise this would
  // silently score the government buyer instead of the bidder.
  const companyChecked = tender.winning_company_name || tender.company_name;

  const companyProfile = await probe42Repository.findByCompanyName(companyChecked);

  const analysisInput = {
    ...tender,
    company: companyChecked,
    company_name: companyChecked,
    department: tender.buyer_department || tender.department,
    probe42CreditRating: companyProfile?.credit_rating ?? null,
    probe42ComplianceStatus: companyProfile?.compliance_status ?? null,
    probe42AnnualRevenue: companyProfile?.annual_revenue ?? null,
    probe42NetProfit: companyProfile?.net_profit ?? null,
  };

  const leadAnalysis = generateLeadAnalysis(analysisInput);

  // Deterministic company-level scores (see companyProfileScoringService.js)
  // — each null when companyProfile itself is null, or the specific source
  // field it needs (revenue/profit, incorporation_date, credit_rating,
  // compliance_status) is missing/unrecognized, since there's nothing to
  // compute from. Consumed by the Settings > Lead Management > Score
  // Thresholds panel's live company check (LeadCategorySettings.tsx),
  // reusing this endpoint rather than adding a second one.
  const financialHealthScore = computeFinancialHealthScore(companyProfile);
  const businessVintageScore = computeBusinessVintageScore(companyProfile);
  const creditRatingScore = computeCreditRatingScore(companyProfile);
  const complianceScore = computeComplianceScore(companyProfile);

  return {
    tenderId: tender.tender_id,
    companyProfile,
    leadAnalysis,
    financialHealthScore,
    businessVintageScore,
    creditRatingScore,
    complianceScore,
  };
}
