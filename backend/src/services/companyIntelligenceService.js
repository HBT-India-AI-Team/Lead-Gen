// Rule-based Company Intelligence layer. Distinct from
// src/services/leadIntelligenceService.js and
// src/services/leadQualificationService.js (both LLM-backed): this service
// derives the same kind of structured read on a tender record using only
// deterministic keyword/threshold rules — no network call, no API key, so
// it works offline and its output never varies between runs on the same
// input.
//
// Accepts either record shape already in use elsewhere in this codebase:
//   - a raw `tenders` table row (title, description, category, location,
//     amount, amount_value, contract_date, company_name, email, phone, ...
//     — see src/db/migrations/addDocumentProcessingSchema.js)
//   - the joined tender_extractions/tenders record produced by
//     leadIntelligenceRepository.findPendingAnalysis() (tenders_title,
//     tender_title, company, buyer, department, estimated_amount, ...)

const INDUSTRY_KEYWORDS = {
  Textiles: ['textile', 'fabric', 'yarn', 'garment', 'cotton', 'apparel'],
  Construction: ['construction', 'civil work', 'building work', 'infrastructure', 'road work', 'bridge'],
  'IT & Software': ['software', 'it services', 'computer', 'network', 'server', 'website', 'application development'],
  Agriculture: ['agriculture', 'farm', 'seed', 'fertilizer', 'crop', 'irrigation'],
  Transportation: ['transport', 'vehicle', 'logistics', 'railway', 'freight', 'fleet'],
  Healthcare: ['hospital', 'medical', 'pharma', 'drug', 'health', 'ambulance'],
  Energy: ['power', 'electricity', 'solar', 'energy', 'fuel', 'transformer'],
  Manufacturing: ['machinery', 'equipment', 'manufacturing', 'industrial', 'plant'],
  'Food & Beverage': ['food', 'beverage', 'catering', 'ration', 'canteen'],
  Electronics: ['electronics', 'electrical', 'appliance', 'circuit'],
  Furniture: ['furniture', 'furnishing', 'woodwork'],
  Chemicals: ['chemical', 'paint', 'pesticide', 'fertiliser']
};

// Priority-ordered (first match wins), not vote-counted like industry —
// these phrases are meant to be mutually exclusive classifications of the
// same opportunity rather than overlapping topic signals.
const BUSINESS_CATEGORY_RULES = [
  { label: 'Auction / Disposal', pattern: /auction|disposal|scrap|junk/i },
  { label: 'Works Contract', pattern: /construction|civil work|repair|renovation|road work|building work|infrastructure/i },
  { label: 'Services / AMC', pattern: /\bamc\b|annual maintenance|maintenance contract|service contract|manpower|security service|housekeeping|consultancy|facility management/i },
  { label: 'Lease / Rental', pattern: /\blease\b|\brent(al)?\b|\bhire\b/i },
  { label: 'Goods Supply', pattern: /supply of|procurement of|purchase of|rate contract/i }
];

const GOVERNMENT_PATTERN = /government|\bgovt\b|municipal|corporation|panchayat|railway|ministry|public works|\bpsu\b|\bboard\b|authority|department|zilla parishad|cantonment/i;

// Mirrors the size buckets used by the LLM-backed rubrics in
// leadIntelligenceService.js / leadQualificationService.js, so all three
// layers report tender size on the same scale.
const HIGH_VALUE_THRESHOLD = 10000000; // Rs. 1 Cr
const LOW_VALUE_THRESHOLD = 1000000; // Rs. 10 Lac

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return typeof value === 'string' ? value.trim() : value;
    }
  }
  return null;
}

function parseIndianAmountString(input) {
  const cleaned = String(input).replace(/[₹,]/g, '');
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|thousand|k)?/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (Number.isNaN(value)) return null;

  const multipliers = { crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, thousand: 1e3, k: 1e3 };
  const unit = (match[2] || '').toLowerCase();
  return value * (multipliers[unit] || 1);
}

function resolveAmount(record) {
  if (record.amount_value !== undefined && record.amount_value !== null && record.amount_value !== '') {
    const numeric = Number(record.amount_value);
    if (!Number.isNaN(numeric)) return numeric;
  }

  const raw = firstNonEmpty(record.tenders_amount, record.estimated_amount, record.amount);
  return raw === null ? null : parseIndianAmountString(raw);
}

function formatInr(value) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `Rs. ${Math.round(value).toLocaleString('en-IN')}`;
  }
}

function bucketAmount(value) {
  if (value === null) return 'Unknown - amount not disclosed';
  if (value < LOW_VALUE_THRESHOLD) return 'Small (< Rs.10 Lac)';
  if (value <= HIGH_VALUE_THRESHOLD) return 'Medium (Rs.10 Lac - Rs.1 Cr)';
  return 'Large (> Rs.1 Cr)';
}

function classifyIndustry(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestHits = 0;

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    const hits = keywords.reduce((count, keyword) => (lower.includes(keyword) ? count + 1 : count), 0);
    if (hits > bestHits) {
      best = industry;
      bestHits = hits;
    }
  }

  return best ?? 'Unclassified';
}

function classifyBusinessCategory(text) {
  const rule = BUSINESS_CATEGORY_RULES.find(({ pattern }) => pattern.test(text));
  return rule ? rule.label : 'General Procurement';
}

function isGovernmentEntity(name) {
  return Boolean(name && GOVERNMENT_PATTERN.test(name));
}

function isPastDate(dateLike) {
  if (!dateLike) return false;
  const parsed = new Date(dateLike);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}

function computeConfidence({ companyName, amountValue, location, buyer, department, hasContactInfo, description, normalizedRecordResolved }) {
  let score = 0;
  if (companyName) score += 20;
  if (amountValue !== null) score += 15;
  if (location) score += 15;
  if (buyer || department) score += 15;
  if (hasContactInfo) score += 15;
  if (description) score += 10;
  if (normalizedRecordResolved) score += 10;

  const level = score >= 75 ? 'High' : score >= 40 ? 'Medium' : 'Low';
  return { score, level };
}

/**
 * Rule-based, deterministic alternative to the LLM-backed intelligence
 * layers — every output field is derived directly from the input record
 * via keyword/threshold rules, nothing is inferred beyond what's literally
 * present. Stateless, so a single instance can be reused across requests.
 */
export class CompanyIntelligenceService {
  generateIntelligence(tenderRecord = {}) {
    const title = firstNonEmpty(tenderRecord.tenders_title, tenderRecord.tender_title, tenderRecord.title);
    const description = firstNonEmpty(tenderRecord.tenders_description, tenderRecord.tender_description, tenderRecord.description);
    const category = firstNonEmpty(tenderRecord.tenders_category, tenderRecord.tender_category, tenderRecord.category);
    const location = firstNonEmpty(tenderRecord.tenders_location, tenderRecord.extraction_location, tenderRecord.location, tenderRecord.state);
    const companyName = firstNonEmpty(tenderRecord.company, tenderRecord.company_name);
    // PHASE 8B fix: on a raw `tenders` row (see this file's header — one of
    // the two shapes this method accepts) there is no `buyer` column at
    // all; the real tender-issuing buyer lives in `company_name` (e.g.
    // "South Central Railway" — see evidenceCollectorService.js's own
    // documentation of that same fact). Without this fallback,
    // isGovernmentEntity() below never saw the real buyer identity for any
    // of the 1,901 real tenders, so governmentRelevance always scored 0
    // even for obviously governmental buyers (confirmed: 1,670/1,901 real
    // `company_name` values match GOVERNMENT_PATTERN). `department` has no
    // equivalent raw fallback — `buyer_department` is genuinely empty on
    // every real row today, so there is nothing real to fall back to.
    const buyer = firstNonEmpty(tenderRecord.buyer, tenderRecord.company_name);
    const department = firstNonEmpty(tenderRecord.department);
    const closingDate = firstNonEmpty(tenderRecord.closing_date);
    const email = firstNonEmpty(tenderRecord.email);
    const phone = firstNonEmpty(tenderRecord.phone);
    const website = firstNonEmpty(tenderRecord.website, tenderRecord.company_website);
    const gst = firstNonEmpty(tenderRecord.gst);
    const normalizedRecordResolved = Boolean(firstNonEmpty(tenderRecord.tender_id, tenderRecord.tenders_title));

    const classificationText = [title, description, category].filter(Boolean).join(' ');
    const industry = classifyIndustry(classificationText);
    const businessCategory = classifyBusinessCategory(classificationText);

    const amountValue = resolveAmount(tenderRecord);
    const tenderValue = {
      amount: amountValue,
      formatted: amountValue === null ? null : formatInr(amountValue),
      sizeCategory: bucketAmount(amountValue)
    };

    const buyerIsGovernment = isGovernmentEntity(buyer);
    const isGovernmentBuyer = buyerIsGovernment || isGovernmentEntity(department);
    const governmentDepartment = firstNonEmpty(department, buyerIsGovernment ? buyer : null);
    const hasContactInfo = Boolean(email || phone || website);

    const signals = [];
    if (isGovernmentBuyer) signals.push('Government Buyer');
    if (amountValue !== null && amountValue >= HIGH_VALUE_THRESHOLD) signals.push('High-Value Tender');
    if (amountValue !== null && amountValue < LOW_VALUE_THRESHOLD) signals.push('Low-Value Tender');
    if (hasContactInfo) signals.push('Contact Details Available');
    else signals.push('No Contact Details');
    if (gst) signals.push('GST Registered');
    if (businessCategory === 'Auction / Disposal') signals.push('One-Time Auction/Disposal');
    if (businessCategory === 'Services / AMC') signals.push('Recurring Procurement Category');
    if (isPastDate(closingDate)) signals.push('Closing Date Passed');
    else if (closingDate) signals.push('Open Tender');
    if (normalizedRecordResolved) signals.push('Verified Normalized Record');
    if (!companyName && !title && amountValue === null && !location) signals.push('Sparse Record');

    const confidence = computeConfidence({
      companyName, amountValue, location, buyer, department, hasContactInfo, description, normalizedRecordResolved
    });

    return {
      companyName,
      industry,
      tenderValue,
      governmentDepartment,
      location,
      businessCategory,
      signals,
      confidence
    };
  }
}
