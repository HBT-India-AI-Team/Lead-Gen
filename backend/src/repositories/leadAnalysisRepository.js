import { run, all, get } from '../config/database.js';

// Data-access layer for the AI Lead Qualification layer's lead_analysis
// table.

const defaultDb = { run, all, get };

/**
 * Successfully-extracted tender_extractions rows (joined with their
 * resolved tenders row, when one exists) that don't have a lead_analysis
 * row yet — this is both the idempotency check and the combined
 * tenders/tender_extractions input the qualification prompt needs.
 *
 * tender_extractions and tenders share no direct key: tender_extractions is
 * keyed by scraped_document_id and tenders by tender_id, and cleaned_text
 * (tender_extractions' own input) never contains the tenderId. The only way
 * to resolve the matching tenders row is via the shared scraped_documents
 * ancestor's metadata_json.tenderId, so the join below goes through
 * scraped_documents rather than directly to tenders — same approach as
 * src/repositories/leadIntelligenceRepository.js.
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
     LEFT JOIN lead_analysis la ON la.tender_extraction_id = te.id
     WHERE te.extraction_status = 'Completed' AND la.id IS NULL
     ORDER BY te.id`
  );
}

/**
 * Records one qualification attempt. Always writes a row (success or
 * failure) so a permanently unanalyzable tender is never retried on every
 * run — findPendingAnalysis() excludes any tender_extraction_id that
 * already has a lead_analysis row, regardless of status.
 */
export async function saveAnalysis(record, db = defaultDb) {
  const {
    tenderExtractionId,
    tenderId = null,
    industry = null,
    products = null,
    services = null,
    buyerType = null,
    requiredExperience = null,
    requiredCertifications = null,
    estimatedProjectSize = null,
    competitionLevel = null,
    businessOpportunity = null,
    riskLevel = null,
    complexity = null,
    confidenceScore = null,
    aiSummary = null,
    recommendation = null,
    status = 'Completed',
    errorMessage = null,
    rawLlmResponse = null
  } = record;

  await db.run(
    `INSERT INTO lead_analysis
     (
       tender_extraction_id, tender_id, industry, products, services, buyer_type,
       required_experience, required_certifications, estimated_project_size,
       competition_level, business_opportunity, risk_level, complexity,
       confidence_score, ai_summary, recommendation,
       analysis_status, error_message, raw_llm_response
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenderExtractionId, tenderId, industry,
      products ? JSON.stringify(products) : null,
      services ? JSON.stringify(services) : null,
      buyerType, requiredExperience,
      requiredCertifications ? JSON.stringify(requiredCertifications) : null,
      estimatedProjectSize, competitionLevel, businessOpportunity, riskLevel, complexity,
      confidenceScore, aiSummary, recommendation,
      status, errorMessage,
      rawLlmResponse ? JSON.stringify(rawLlmResponse) : null
    ]
  );
}