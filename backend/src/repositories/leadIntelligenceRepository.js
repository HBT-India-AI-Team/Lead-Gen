import { run, all, get } from '../config/database.js';

// Data-access layer for the Lead Intelligence layer's lead_intelligence
// table.

const defaultDb = { run, all, get };

/**
 * Successfully-extracted tender_extractions rows (joined with their
 * resolved tenders row, when one exists) that don't have a
 * lead_intelligence row yet — this is both the idempotency check and the
 * combined input for the analysis prompt.
 *
 * tender_extractions and tenders share no direct key: tender_extractions
 * is keyed by scraped_document_id and tenders by tender_id, and
 * cleaned_text (tender_extractions' own input) never contains the
 * tenderId. The only way to resolve the matching tenders row is via the
 * shared scraped_documents ancestor's metadata_json.tenderId, so the join
 * below goes through scraped_documents rather than directly to tenders.
 */
export async function findPendingAnalysis(db = defaultDb) {
  return db.all(
    `SELECT
       te.id AS tender_extraction_id,
       te.company, te.buyer, te.department, te.tender_title, te.tender_description,
       te.estimated_amount, te.tender_category, te.location AS extraction_location,
       te.tender_date, te.closing_date, te.email, te.phone, te.website, te.gst, te.pan,
       t.id AS tender_id,
       t.title AS tenders_title, t.description AS tenders_description,
       t.category AS tenders_category, t.location AS tenders_location,
       t.amount AS tenders_amount, t.contract_date AS tenders_contract_date,
       t.url AS tenders_url
     FROM tender_extractions te
     JOIN scraped_documents sd ON sd.id = te.scraped_document_id
     LEFT JOIN tenders t ON t.tender_id = JSON_UNQUOTE(JSON_EXTRACT(sd.metadata_json, '$.tenderId'))
     LEFT JOIN lead_intelligence li ON li.tender_extraction_id = te.id
     WHERE te.extraction_status = 'Completed' AND li.id IS NULL
     ORDER BY te.id`
  );
}

/**
 * Records one analysis attempt. Always writes a row (success or failure)
 * so a permanently unanalyzable tender is never retried on every run —
 * findPendingAnalysis() excludes any tender_extraction_id that already has
 * a lead_intelligence row, regardless of status.
 */
export async function saveIntelligence(record, db = defaultDb) {
  const {
    tenderExtractionId,
    tenderId = null,
    companyType = null,
    buyerType = null,
    businessOpportunity = null,
    industry = null,
    opportunitySummary = null,
    suggestedSalesStrategy = null,
    decisionMakerType = null,
    estimatedProcurementSize = null,
    riskFactors = null,
    opportunityScore = null,
    leadPriority = null,
    aiReasoning = null,
    status = 'Completed',
    errorMessage = null,
    rawLlmResponse = null
  } = record;

  await db.run(
    `INSERT INTO lead_intelligence
     (
       tender_extraction_id, tender_id, company_type, buyer_type, business_opportunity,
       industry, opportunity_summary, suggested_sales_strategy, decision_maker_type,
       estimated_procurement_size, risk_factors, opportunity_score, lead_priority,
       ai_reasoning, analysis_status, error_message, raw_llm_response
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenderExtractionId, tenderId, companyType, buyerType, businessOpportunity,
      industry, opportunitySummary, suggestedSalesStrategy, decisionMakerType,
      estimatedProcurementSize, riskFactors ? JSON.stringify(riskFactors) : null,
      opportunityScore, leadPriority, aiReasoning, status, errorMessage,
      rawLlmResponse ? JSON.stringify(rawLlmResponse) : null
    ]
  );
}