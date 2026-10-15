import { upsertTender } from '../../repositories/tenderRepository.js';

const SOURCE_NAME = 'TenderBook';

/**
 * Parses a scraped_documents.metadata_json value into the flat tender shape
 * the `tenders` table expects. mysql2 already returns JSON columns as JS
 * objects, but a raw string is handled too (e.g. if this is ever called
 * against a value read some other way). Throws if tenderId is missing,
 * since that's the natural key upsertTender() relies on to avoid duplicate
 * rows — a document that can't be normalized should fail loudly, not
 * silently save a tender no one can dedupe against later.
 */
export function extractTenderFields(metadataJson) {
  const data = typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;

  if (!data || typeof data !== 'object') {
    throw new Error('metadata_json is empty or not a valid object.');
  }

  if (!data.tenderId) {
    throw new Error('metadata_json is missing "tenderId" — cannot normalize without a natural key.');
  }

  return {
    tenderId: data.tenderId,
    title: data.title ?? null,
    description: data.description ?? null,
    location: data.location ?? null,
    category: data.category ?? null,
    amount: data.amount ?? null,
    amountValue: data.amountValue ?? null,
    contractDate: data.contractDate ?? null,
    url: data.url ?? null,
    source: SOURCE_NAME,
    // title IS the buyer/organization name on TenderBook's card (see
    // src/automation/scraper/parser.js) — surfaced into company_name too so
    // it's queryable under its own name, not just "title".
    companyName: data.title ?? null,
    tenderType: data.tenderType ?? null,
    closingDate: data.closingDate ?? null,
    tenderCity: data.city ?? null,
    tenderState: data.state ?? null,
    tenderDistrict: data.district ?? null,
    emdAmount: data.emdAmount ?? null,
    tenderFee: data.tenderFee ?? null,
    buyerDepartment: data.buyerDepartment ?? null,
    publishDate: data.publishDate ?? null,
    openingDate: data.openingDate ?? null,
    pdfUrl: data.pdfUrl ?? null,
    buyerContactPerson: data.contactPerson ?? null,
    buyerContactPhone: data.contactPhone ?? null,
    buyerContactEmail: data.contactEmail ?? null,
    buyerAddress: data.address ?? null,
    winningCompanyName: data.winningCompanyName ?? null,
    winningBidAmount: data.winningBidAmount ?? null,
    winningBidAmountValue: data.winningBidAmountValue ?? null,
  };
}

/**
 * Normalizes one scraped_documents row and saves it into `tenders`.
 * `db` is an optional transaction-scoped executor ({ run }) so the caller
 * can run this and the processing_status update atomically.
 */
export async function processScrapedDocument(document, db) {
  const tender = extractTenderFields(document.metadata_json);
  await upsertTender(tender, db);
  return tender;
}