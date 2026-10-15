import { run, get, all } from '../config/database.js';

// Data-access layer for the `lead_signals` table (see
// src/db/migrations/addLeadSignalsSchema.js). Only the TENDER signal type
// is implemented here — the other six signal types listed in that
// migration have no writer yet.
//
// Idempotency: `lead_signals` has no dedicated tender-identifier column
// (only company_name/company_cin/signal_type/source/signal_date/title/
// description/value/location/raw_data), so "the same tender" is identified
// the same way the rest of this codebase already does elsewhere — by
// tenders.tender_id — stored inside raw_data.tenderId and looked up via
// JSON_EXTRACT before every write. This needed no schema change. A
// dedicated, indexed tender-id column with a UNIQUE constraint would be a
// safer/faster uniqueness mechanism at real scale, but wasn't added since
// it wasn't asked for and isn't needed yet at this table's current size —
// flagged here rather than guessed at.
//
// Uses the plain (non-transactional) run/get from config/database.js,
// deliberately NOT whatever `db` executor a caller like
// tenderRepository.upsertTender() might be running inside a transaction
// with — so a signal-write failure can never roll back a real tender
// write. The call site in upsertTender() wraps this in try/catch for the
// same reason: this is a best-effort side write, never allowed to break
// tender ingestion.

function toDateOrNull(value) {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * Reads the persisted TENDER lead_signals row for one tender_id — same
 * JSON-based lookup upsertTenderSignal() uses internally to find its own
 * existing row (raw_data.tenderId, not a dedicated column; see the file
 * header comment for why). Returns the full row, or null if no TENDER
 * signal has been recorded for this tender yet. Callers (e.g. the
 * qualification pipeline) must treat null as "unavailable" — never invent
 * one.
 */
export async function findTenderSignal(tenderId) {
  if (!tenderId) return null;
  const row = await get(
    `SELECT * FROM lead_signals
     WHERE signal_type = 'TENDER'
       AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.tenderId')) = ?
     LIMIT 1`,
    [tenderId]
  );
  return row ?? null;
}

/**
 * Reads every lead_signals row for one real company CIN, across all signal
 * types (company_cin is a real, indexed column — unlike the tenderId/GSTIN/
 * establishmentId keys above, which live inside raw_data). Used by the
 * qualification evidence collector to gather NEW_COMPANY_REGISTRATION/
 * GST_REGISTRATION/COMPANY_EXPANSION evidence for one already-identified
 * company (the CIN comes from a Probe42 match on the tender's winning
 * company — see qualification/evidenceCollectorService.js), never from
 * fuzzy-matching lead_signals itself. Returns [] if the CIN is missing or
 * has no signals — never guessed.
 */
export async function findSignalsByCin(cin) {
  if (!cin) return [];
  return all('SELECT * FROM lead_signals WHERE company_cin = ? ORDER BY signal_date DESC', [cin]);
}

async function findExistingTenderSignalId(tenderId) {
  const existing = await findTenderSignal(tenderId);
  return existing?.id ?? null;
}

/**
 * Creates or updates the TENDER lead_signals row for one normalized
 * `tenders` record — accepts the same camelCase shape
 * tenderRepository.upsertTender() does (tenderId, title, description,
 * category, location, amount, amountValue, contractDate, url, source,
 * winningCompanyName, winningBidAmount). Returns the signal's `id`, or
 * null if `tender.tenderId` is missing (nothing safe to dedupe against).
 *
 * company_name is left NULL when winningCompanyName is empty — never
 * invented. company_cin is always NULL: no real CIN for the winning
 * company exists anywhere on `tenders` yet.
 */
export async function upsertTenderSignal(tender) {
  if (!tender?.tenderId) return null;

  const fields = {
    companyName: tender.winningCompanyName || null,
    companyCin: null,
    source: 'TenderBook',
    signalDate: toDateOrNull(tender.contractDate),
    title: tender.title || null,
    description: tender.description || null,
    value: tender.amountValue ?? null,
    location: tender.location || null,
    rawData: JSON.stringify({
      tenderId: tender.tenderId,
      category: tender.category ?? null,
      amount: tender.amount ?? null,
      url: tender.url ?? null,
      source: tender.source ?? null,
      winningBidAmount: tender.winningBidAmount ?? null,
    }),
  };

  const existingId = await findExistingTenderSignalId(tender.tenderId);

  if (existingId) {
    await run(
      `UPDATE lead_signals
       SET company_name = ?, company_cin = ?, source = ?, signal_date = ?, title = ?, description = ?, value = ?, location = ?, raw_data = ?
       WHERE id = ?`,
      [
        fields.companyName,
        fields.companyCin,
        fields.source,
        fields.signalDate,
        fields.title,
        fields.description,
        fields.value,
        fields.location,
        fields.rawData,
        existingId,
      ]
    );
    return existingId;
  }

  const result = await run(
    `INSERT INTO lead_signals
       (company_name, company_cin, signal_type, source, signal_date, title, description, value, location, raw_data)
     VALUES (?, ?, 'TENDER', ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.companyName,
      fields.companyCin,
      fields.source,
      fields.signalDate,
      fields.title,
      fields.description,
      fields.value,
      fields.location,
      fields.rawData,
    ]
  );
  return result.lastID;
}

/**
 * Reads the persisted NEW_COMPANY_REGISTRATION lead_signals row for one
 * CIN/LLPIN — same JSON-based lookup pattern as findTenderSignal() above
 * (raw_data.CIN, not a dedicated column). Returns the full row, or null if
 * none exists yet.
 */
export async function findNewCompanyRegistrationSignal(cin) {
  if (!cin) return null;
  const row = await get(
    `SELECT * FROM lead_signals
     WHERE signal_type = 'NEW_COMPANY_REGISTRATION'
       AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.CIN')) = ?
     LIMIT 1`,
    [cin]
  );
  return row ?? null;
}

async function findExistingNewCompanyRegistrationSignalId(cin) {
  const existing = await findNewCompanyRegistrationSignal(cin);
  return existing?.id ?? null;
}

/**
 * Builds a concise, human-readable description strictly from fields
 * actually present on `company` — never invents a fact the record doesn't
 * state. `company` is the RAW MCA API record (verbatim field names:
 * CompanyName, CIN, CompanyStatus, CompanyClass,
 * CompanyIndustrialClassification, ...), same shape mcaIngest.js already
 * stores in scraped_documents.metadata_json.
 */
function buildNewCompanyRegistrationDescription(company) {
  const parts = [`${company.CompanyName} was registered on ${company.CompanyRegistrationdate_date} (CIN: ${company.CIN}).`];

  const statusBits = [
    company.CompanyStatus ? `Status: ${company.CompanyStatus}` : null,
    company.CompanyClass ? `Class: ${company.CompanyClass}` : null,
    company.CompanyCategory ? `Category: ${company.CompanyCategory}` : null,
  ].filter(Boolean);
  if (statusBits.length) parts.push(statusBits.join(', ') + '.');

  if (company.CompanyIndustrialClassification) {
    parts.push(`Industry: ${company.CompanyIndustrialClassification}.`);
  }

  return parts.join(' ');
}

/**
 * Creates or updates the NEW_COMPANY_REGISTRATION lead_signals row for one
 * RAW MCA company record (the exact object shape mcaIngest.js/mcaExpand.js
 * already store in scraped_documents.metadata_json — CompanyName, CIN,
 * CompanyStatus, CompanyRegistrationdate_date, CompanyStateCode,
 * Registered_Office_Address, ...). The caller (the importer script) is
 * responsible for deciding WHICH records qualify (valid date, within the
 * lookback window, Active status) — this function only refuses to write a
 * signal with no CIN, no company name, or no parseable registration date,
 * as a defensive floor, never a business-rule gate of its own.
 *
 * `raw_data` stores the complete original MCA record verbatim (not a
 * curated subset) so nothing about the source record is lost.
 *
 * Handles both standard 21-char CINs and LLPIN-style identifiers (e.g.
 * "ABD-0345") identically — the CIN is only ever used as an opaque dedup
 * key here, never validated against a fixed format/length.
 */
export async function upsertNewCompanyRegistrationSignal(company) {
  const cin = company?.CIN;
  const companyName = company?.CompanyName;
  const signalDate = toDateOrNull(company?.CompanyRegistrationdate_date);

  if (!cin || !companyName || !signalDate) return null;

  const fields = {
    companyName,
    companyCin: cin,
    source: 'data.gov.in (MCA)',
    signalDate,
    title: 'New company registration',
    description: buildNewCompanyRegistrationDescription(company),
    value: null,
    location: company.CompanyStateCode || company.Registered_Office_Address || null,
    rawData: JSON.stringify(company),
  };

  const existingId = await findExistingNewCompanyRegistrationSignalId(cin);

  if (existingId) {
    await run(
      `UPDATE lead_signals
       SET company_name = ?, company_cin = ?, source = ?, signal_date = ?, title = ?, description = ?, value = ?, location = ?, raw_data = ?
       WHERE id = ?`,
      [
        fields.companyName,
        fields.companyCin,
        fields.source,
        fields.signalDate,
        fields.title,
        fields.description,
        fields.value,
        fields.location,
        fields.rawData,
        existingId,
      ]
    );
    return { id: existingId, created: false };
  }

  const result = await run(
    `INSERT INTO lead_signals
       (company_name, company_cin, signal_type, source, signal_date, title, description, value, location, raw_data)
     VALUES (?, ?, 'NEW_COMPANY_REGISTRATION', ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.companyName,
      fields.companyCin,
      fields.source,
      fields.signalDate,
      fields.title,
      fields.description,
      fields.value,
      fields.location,
      fields.rawData,
    ]
  );
  return { id: result.lastID, created: true };
}

/**
 * Reads the persisted GST_REGISTRATION lead_signals row for one GSTIN —
 * same JSON-based lookup pattern as findTenderSignal()/
 * findNewCompanyRegistrationSignal() above (raw_data.GSTIN, not a
 * dedicated column). A company can hold several GSTINs (one per state it's
 * registered in), so GSTIN — not CIN — is the natural per-signal identity
 * here. Returns the full row, or null if none exists yet.
 */
export async function findGstRegistrationSignal(gstin) {
  if (!gstin) return null;
  const row = await get(
    `SELECT * FROM lead_signals
     WHERE signal_type = 'GST_REGISTRATION'
       AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.GSTIN')) = ?
     LIMIT 1`,
    [gstin]
  );
  return row ?? null;
}

async function findExistingGstRegistrationSignalId(gstin) {
  const existing = await findGstRegistrationSignal(gstin);
  return existing?.id ?? null;
}

/**
 * Builds a concise description strictly from fields actually present on
 * `gstRow` — never invents a fact the row doesn't state.
 */
function buildGstRegistrationDescription(gstRow, companyName) {
  const registeredOn = gstRow['DATE OF REGISTRATION'] ? ` on ${gstRow['DATE OF REGISTRATION']}` : '';
  const parts = [`${companyName} registered for GST (GSTIN: ${gstRow.GSTIN})${registeredOn}.`];

  const bits = [
    gstRow['GSTIN STATUS'] ? `Status: ${gstRow['GSTIN STATUS']}` : null,
    gstRow['TAXPAYER TYPE'] ? `Taxpayer Type: ${gstRow['TAXPAYER TYPE']}` : null,
    gstRow.STATE ? `State: ${gstRow.STATE}` : null,
  ].filter(Boolean);
  if (bits.length) parts.push(bits.join(', ') + '.');

  if (gstRow['NATURE OF BUSINESS ACTIVITIES']) {
    parts.push(`Activities: ${gstRow['NATURE OF BUSINESS ACTIVITIES']}.`);
  }

  return parts.join(' ');
}

/**
 * Creates or updates the GST_REGISTRATION lead_signals row for one real
 * GSTIN row from a Probe42 XLS "GST" sheet (see
 * scripts/importProbe42Xls.js's extractGstRegistrations()) — present for
 * most companies but genuinely absent for some (e.g. P P Enterprises has
 * no GST sheet at all; callers must skip those, not fabricate a row).
 *
 * `gstRow` is the raw sheet row keyed verbatim by the sheet's own column
 * headers (GSTIN, "GSTIN STATUS", STATE, "DATE OF REGISTRATION", "LEGAL
 * NAME OF BUSINESS", "TRADE NAME", "NATURE OF BUSINESS ACTIVITIES", FLAGS,
 * ...) and is stored as-is in raw_data — nothing about the source row is
 * lost or reshaped. `companyName`/`companyCin` come from the same XLS
 * file's own "About the Company" sheet (the real Probe42 company identity
 * this GSTIN belongs to), not invented. `signalDate` must already be a
 * parsed ISO date (the importer converts Probe42's "31 May, 2023" format
 * via parseProbe42Date() before calling this) — passing an unparseable or
 * missing date refuses the write entirely rather than guessing one.
 *
 * Refuses to write when GSTIN, companyName, or signalDate is missing.
 */
export async function upsertGstRegistrationSignal(gstRow, companyName, companyCin, signalDate) {
  const gstin = gstRow?.GSTIN;
  const validDate = toDateOrNull(signalDate);

  if (!gstin || !companyName || !validDate) return null;

  const fields = {
    companyName,
    companyCin: companyCin || null,
    source: 'Probe42 (GST)',
    signalDate: validDate,
    title: 'GST registration',
    description: buildGstRegistrationDescription(gstRow, companyName),
    value: null,
    location: gstRow.STATE || null,
    rawData: JSON.stringify(gstRow),
  };

  const existingId = await findExistingGstRegistrationSignalId(gstin);

  if (existingId) {
    await run(
      `UPDATE lead_signals
       SET company_name = ?, company_cin = ?, source = ?, signal_date = ?, title = ?, description = ?, value = ?, location = ?, raw_data = ?
       WHERE id = ?`,
      [
        fields.companyName,
        fields.companyCin,
        fields.source,
        fields.signalDate,
        fields.title,
        fields.description,
        fields.value,
        fields.location,
        fields.rawData,
        existingId,
      ]
    );
    return { id: existingId, created: false };
  }

  const result = await run(
    `INSERT INTO lead_signals
       (company_name, company_cin, signal_type, source, signal_date, title, description, value, location, raw_data)
     VALUES (?, ?, 'GST_REGISTRATION', ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.companyName,
      fields.companyCin,
      fields.source,
      fields.signalDate,
      fields.title,
      fields.description,
      fields.value,
      fields.location,
      fields.rawData,
    ]
  );
  return { id: result.lastID, created: true };
}

/**
 * Reads the persisted GOVERNMENT_TENDER_WIN lead_signals row for one
 * tender_id — same JSON-based lookup pattern as findTenderSignal() above
 * (raw_data.tenderId, not a dedicated column). Returns the full row, or
 * null if none exists yet.
 */
export async function findGovernmentTenderWinSignal(tenderId) {
  if (!tenderId) return null;
  const row = await get(
    `SELECT * FROM lead_signals
     WHERE signal_type = 'GOVERNMENT_TENDER_WIN'
       AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.tenderId')) = ?
     LIMIT 1`,
    [tenderId]
  );
  return row ?? null;
}

async function findExistingGovernmentTenderWinSignalId(tenderId) {
  const existing = await findGovernmentTenderWinSignal(tenderId);
  return existing?.id ?? null;
}

/**
 * Builds a concise description strictly from fields actually present on
 * `tender` — never invents a fact the record doesn't state.
 */
function buildGovernmentTenderWinDescription(tender) {
  const amountBit = tender.winningBidAmount ? ` with a winning bid of ${tender.winningBidAmount}` : '';
  const parts = [`${tender.winningCompanyName} was awarded tender "${tender.title || tender.tenderId}"${amountBit}.`];

  const bits = [
    tender.category ? `Category: ${tender.category}` : null,
    tender.buyerDepartment ? `Department: ${tender.buyerDepartment}` : null,
  ].filter(Boolean);
  if (bits.length) parts.push(bits.join(', ') + '.');

  return parts.join(' ');
}

/**
 * Creates or updates the GOVERNMENT_TENDER_WIN lead_signals row for one
 * normalized `tenders` record — same camelCase shape upsertTender()/
 * upsertTenderSignal() already accept (tenderId, title, winningCompanyName,
 * winningBidAmount, winningBidAmountValue, contractDate, category,
 * buyerDepartment, location, url, source).
 *
 * GENUINE WIN EVIDENCE ONLY: this only ever fires when winningCompanyName
 * is actually populated — that field is written by
 * src/automation/scraper/detail.js's rank-1-only bidder extraction (see
 * that file's extractWinnerFields()), which explicitly discards any
 * non-winning bidder even when visible on the page. There is no bidder-
 * list/participant data anywhere in `tenders`, so a GOVERNMENT_TENDER_BID
 * counterpart cannot be built from real evidence — deliberately not
 * implemented here (see scripts/importTenderSignals.js's header comment).
 *
 * Refuses to write when tenderId or winningCompanyName is missing.
 */
export async function upsertGovernmentTenderWinSignal(tender) {
  if (!tender?.tenderId || !tender?.winningCompanyName) return null;

  const fields = {
    companyName: tender.winningCompanyName,
    companyCin: null,
    source: 'TenderBook',
    signalDate: toDateOrNull(tender.contractDate),
    title: 'Government tender won',
    description: buildGovernmentTenderWinDescription(tender),
    value: tender.winningBidAmountValue ?? null,
    location: tender.location || null,
    rawData: JSON.stringify({
      tenderId: tender.tenderId,
      title: tender.title ?? null,
      category: tender.category ?? null,
      buyerDepartment: tender.buyerDepartment ?? null,
      url: tender.url ?? null,
      source: tender.source ?? null,
      winningBidAmount: tender.winningBidAmount ?? null,
      contractDate: tender.contractDate ?? null,
    }),
  };

  const existingId = await findExistingGovernmentTenderWinSignalId(tender.tenderId);

  if (existingId) {
    await run(
      `UPDATE lead_signals
       SET company_name = ?, company_cin = ?, source = ?, signal_date = ?, title = ?, description = ?, value = ?, location = ?, raw_data = ?
       WHERE id = ?`,
      [
        fields.companyName,
        fields.companyCin,
        fields.source,
        fields.signalDate,
        fields.title,
        fields.description,
        fields.value,
        fields.location,
        fields.rawData,
        existingId,
      ]
    );
    return { id: existingId, created: false };
  }

  const result = await run(
    `INSERT INTO lead_signals
       (company_name, company_cin, signal_type, source, signal_date, title, description, value, location, raw_data)
     VALUES (?, ?, 'GOVERNMENT_TENDER_WIN', ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.companyName,
      fields.companyCin,
      fields.source,
      fields.signalDate,
      fields.title,
      fields.description,
      fields.value,
      fields.location,
      fields.rawData,
    ]
  );
  return { id: result.lastID, created: true };
}

/**
 * Reads the persisted COMPANY_EXPANSION lead_signals row for one
 * (cin, establishmentId, evidenceType) triple — same JSON-based lookup
 * pattern as the other signal types, but three-part: a company can have
 * several establishments, and the same establishment can independently
 * carry both ESTABLISHMENT_EXPANSION and EMPLOYEE_GROWTH evidence (two
 * distinct facts, two distinct rows). Returns the full row, or null.
 */
export async function findCompanyExpansionSignal(cin, establishmentId, evidenceType) {
  if (!cin || !establishmentId || !evidenceType) return null;
  const row = await get(
    `SELECT * FROM lead_signals
     WHERE signal_type = 'COMPANY_EXPANSION'
       AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.cin')) = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.establishmentId')) = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.evidenceType')) = ?
     LIMIT 1`,
    [cin, establishmentId, evidenceType]
  );
  return row ?? null;
}

async function findExistingCompanyExpansionSignalId(cin, establishmentId, evidenceType) {
  const existing = await findCompanyExpansionSignal(cin, establishmentId, evidenceType);
  return existing?.id ?? null;
}

/** Shared write path for both COMPANY_EXPANSION evidence types — find-then-insert/update, identical shape to every other signal type in this file. `rawData` must already include cin/establishmentId/evidenceType (the dedup key) alongside the rest of the real evidence. */
async function upsertCompanyExpansionRow({ cin, companyName, establishmentId, evidenceType, signalDate, title, description, value, location, rawData }) {
  const fields = {
    companyName,
    companyCin: cin,
    source: 'Probe42 (EPFO)',
    signalDate,
    title,
    description,
    value,
    location,
    rawData: JSON.stringify(rawData),
  };

  const existingId = await findExistingCompanyExpansionSignalId(cin, establishmentId, evidenceType);

  if (existingId) {
    await run(
      `UPDATE lead_signals
       SET company_name = ?, company_cin = ?, source = ?, signal_date = ?, title = ?, description = ?, value = ?, location = ?, raw_data = ?
       WHERE id = ?`,
      [
        fields.companyName,
        fields.companyCin,
        fields.source,
        fields.signalDate,
        fields.title,
        fields.description,
        fields.value,
        fields.location,
        fields.rawData,
        existingId,
      ]
    );
    return { id: existingId, created: false };
  }

  const result = await run(
    `INSERT INTO lead_signals
       (company_name, company_cin, signal_type, source, signal_date, title, description, value, location, raw_data)
     VALUES (?, ?, 'COMPANY_EXPANSION', ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.companyName,
      fields.companyCin,
      fields.source,
      fields.signalDate,
      fields.title,
      fields.description,
      fields.value,
      fields.location,
      fields.rawData,
    ]
  );
  return { id: result.lastID, created: true };
}

/**
 * Evidence type A — a new establishment set up genuinely after the
 * company's own incorporation date (both real dates from the same Probe42
 * XLS: EPFO Establishments' DATE OF SETUP vs. About the Company's Date of
 * Incorporation — the caller, scripts/importProbe42Xls.js, already did
 * that comparison before calling this). Refuses to write without a real
 * CIN, company name, establishment ID, and setup date.
 */
export async function upsertEstablishmentExpansionSignal({
  cin,
  companyName,
  establishmentId,
  establishmentName,
  city,
  setupDate,
  employeeCount,
  businessActivity,
  address,
}) {
  const validDate = toDateOrNull(setupDate);
  if (!cin || !companyName || !establishmentId || !validDate) return null;

  const nameBit = establishmentName ? `"${establishmentName}"` : `establishment ${establishmentId}`;
  const parts = [`${companyName} set up a new establishment ${nameBit}${city ? ` in ${city}` : ''} on ${setupDate}.`];
  const bits = [
    employeeCount != null ? `${employeeCount} employees` : null,
    businessActivity ? `Activity: ${businessActivity}` : null,
  ].filter(Boolean);
  if (bits.length) parts.push(bits.join(', ') + '.');

  return upsertCompanyExpansionRow({
    cin,
    companyName,
    establishmentId,
    evidenceType: 'ESTABLISHMENT_EXPANSION',
    signalDate: validDate,
    title: 'Company expansion — new establishment',
    description: parts.join(' '),
    value: employeeCount ?? null,
    location: city || null,
    rawData: {
      cin,
      establishmentId,
      evidenceType: 'ESTABLISHMENT_EXPANSION',
      establishmentName: establishmentName ?? null,
      city: city ?? null,
      setupDate,
      employeeCount: employeeCount ?? null,
      businessActivity: businessActivity ?? null,
      address: address ?? null,
    },
  });
}

/**
 * Evidence type B — measurable, positive employee-count growth at one
 * establishment between its earliest and latest available EPFO monthly
 * filing (from the Annexure - EPFO Establishments sheet; the caller
 * already grouped by establishment ID and picked the earliest/latest
 * valid observations). Refuses to write unless latestCount is genuinely
 * greater than earliestCount — a flat or declining count is not
 * expansion evidence and is never forced into one.
 */
export async function upsertEmployeeGrowthSignal({
  cin,
  companyName,
  establishmentId,
  establishmentName,
  city,
  earliestMonth,
  earliestCount,
  earliestDate,
  latestMonth,
  latestCount,
  latestDate,
}) {
  if (!cin || !companyName || !establishmentId) return null;
  if (earliestCount == null || latestCount == null) return null;
  if (!(latestCount > earliestCount)) return null;

  const validDate = toDateOrNull(latestDate);
  if (!validDate) return null;

  const growth = latestCount - earliestCount;
  const nameBit = establishmentName ? `"${establishmentName}"` : `establishment ${establishmentId}`;
  const description =
    `${companyName}'s establishment ${nameBit}${city ? ` in ${city}` : ''} grew from ${earliestCount} employees ` +
    `(${earliestMonth ?? earliestDate}) to ${latestCount} employees (${latestMonth ?? latestDate}), a real increase of ${growth}.`;

  return upsertCompanyExpansionRow({
    cin,
    companyName,
    establishmentId,
    evidenceType: 'EMPLOYEE_GROWTH',
    signalDate: validDate,
    title: 'Company expansion — employee growth',
    description,
    value: growth,
    location: city || null,
    rawData: {
      cin,
      establishmentId,
      evidenceType: 'EMPLOYEE_GROWTH',
      establishmentName: establishmentName ?? null,
      city: city ?? null,
      earliestMonth: earliestMonth ?? null,
      earliestDate: earliestDate ?? null,
      earliestCount,
      latestMonth: latestMonth ?? null,
      latestDate: latestDate ?? null,
      latestCount,
      employeeGrowth: growth,
    },
  });
}

// ---- Dashboard "Lead Category" filter — reads real lead_signals directly.
// A signal (GST_REGISTRATION, COMPANY_EXPANSION, NEW_COMPANY_REGISTRATION,
// TENDER, GOVERNMENT_TENDER_WIN) is its own real, standalone row — this
// intentionally does NOT try to resolve which `tenders` row a CIN-keyed
// signal (GST/expansion/registration) "belongs to": tenders has no CIN
// column for the winning company, and a raw company_name string comparison
// isn't reliable on its own (see tenderRepository.js's CIN_KEYED_LEAD_
// CATEGORIES comment and resolveTenderIdsByCinSignalTypes(), which instead
// bridges through the real Probe42 CIN match for the Leads/Analytics
// tender-filtering path). Listing/counting lead_signals directly here
// sidesteps that problem entirely for this dashboard feature — every count
// is exactly `SELECT COUNT(*) ... GROUP BY signal_type`, nothing inferred.

/**
 * Real per-type row counts across every signal actually stored — backs the
 * Dashboard Lead Category dropdown so it only ever offers categories that
 * genuinely have at least one real row (a type with zero rows simply never
 * appears, rather than a hardcoded option that would filter to nothing).
 */
export async function getSignalTypeCounts() {
  const rows = await all('SELECT signal_type, COUNT(*) AS count FROM lead_signals GROUP BY signal_type ORDER BY signal_type');
  return rows.map((row) => ({ signalType: row.signal_type, count: row.count }));
}

/**
 * Real, paginated lead_signals rows, optionally filtered to one
 * signal_type. No `signalType` (or an unrecognized one) lists across all
 * types — mirrors tenderRepository.listTenders()'s page/limit defensive
 * parsing exactly.
 */
export async function listSignals({ signalType, page = 1, limit = 10 } = {}) {
  const conditions = [];
  const params = [];

  if (signalType) {
    conditions.push('signal_type = ?');
    params.push(signalType);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const totalRow = await get(`SELECT COUNT(*) AS count FROM lead_signals ${whereClause}`, params);
  const total = totalRow?.count || 0;

  const signals = await all(
    `SELECT * FROM lead_signals ${whereClause} ORDER BY signal_date DESC, id DESC LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    signals,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
}