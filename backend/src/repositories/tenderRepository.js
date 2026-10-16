import { run, all, get } from '../config/database.js';
import { parseJsonColumns, parseJsonColumnsAll } from '../utils/jsonColumns.js';
import * as leadSignalRepository from './leadSignalRepository.js';
import * as probe42Repository from './probe42Repository.js';

// Data-access layer for the normalized `tenders` table. Distinct from
// src/automation/database/tenderRepository.js, which writes raw
// scraped_documents rows during scraping — this file only runs afterward,
// in the document-processing pipeline.

const defaultDb = { run };

// JSON columns on `tenders`. Parsed on read because a database restored
// from a MariaDB dump returns them as longtext strings (see
// src/utils/jsonColumns.js).
const TENDER_JSON_COLUMNS = ['qualification_reason'];

// Whitelisted so `sort_by` (a raw query-string value) is never interpolated
// into SQL directly — mirrors src/services/sourceService.js's SORTABLE_COLUMNS.
const SORTABLE_COLUMNS = {
  created_at: 'created_at',
  contract_date: 'contract_date',
  amount_value: 'amount_value',
  winning_bid_amount_value: 'winning_bid_amount_value',
  title: 'title',
};

function isNonEmpty(value) {
  return value !== undefined && value !== null && value !== '';
}

// Whitelisted so `amount_range` (a raw query-string value) is never
// interpolated into SQL directly — same pattern as SORTABLE_COLUMNS. Bounds
// match the Leads page's Amount filter spec exactly (rupee amounts against
// the real numeric amount_value column, not the formatted `amount` string).
const AMOUNT_RANGES = {
  under_1l: { max: 100000, maxInclusive: false },
  '1l_10l': { min: 100000, minInclusive: true, max: 1000000, maxInclusive: false },
  '10l_50l': { min: 1000000, minInclusive: true, max: 5000000, maxInclusive: false },
  '50l_1cr': { min: 5000000, minInclusive: true, max: 10000000, maxInclusive: true },
  above_1cr: { min: 10000000, minInclusive: false },
};

// Lead Category signal types genuinely, exactly identifying a `tenders` row
// via raw_data.tenderId (see leadSignalRepository.js) — the only two signal
// types where that key is a tender_id at all. Merged under one "Tender" key
// per business requirement: TENDER and GOVERNMENT_TENDER_WIN are the same
// Lead Category for the UI/filter — a tender that's confirmed won is still
// a tender. This changes nothing in MySQL (no UPDATE, no migration): both
// signal types keep existing exactly as scraped; only how they're grouped
// for the dropdown/filter/display changes. `Winner Status` (WINNER_OPTIONS
// below) remains the separate, real place a confirmed win is surfaced.
const TENDER_ID_KEYED_LEAD_CATEGORIES = {
  Tender: ['TENDER', 'GOVERNMENT_TENDER_WIN'],
};

// GST_REGISTRATION/NEW_COMPANY_REGISTRATION/COMPANY_EXPANSION are keyed on
// company CIN instead — `tenders` has no CIN column for the winning
// company, so these can't be matched with a plain SQL EXISTS the way the
// tender-ID-keyed categories above are. Resolved instead via
// resolveTenderIdsByCinSignalTypes() below, which reuses the SAME real,
// already-trusted CIN bridge leadQualificationPipelineService's evidence
// collector already relies on (evidenceCollectorService.js: winning company
// -> probe42Repository.findByCompanyName() -> profile.cin -> lead_signals
// for that CIN) — not a second/new matching system, and not a raw
// company_name string comparison (which probe42Repository.js's own
// normalizeForMatch() doc already found unreliable on its own).
const CIN_KEYED_LEAD_CATEGORIES = {
  'GST Registration': ['GST_REGISTRATION'],
  'New Company Registration': ['NEW_COMPANY_REGISTRATION'],
  'Company Expansion': ['COMPANY_EXPANSION'],
};

// PHASE 7 — per-row, real-signal-derived Lead Category for display (Analytics'
// Lead Records table). Built from TENDER_ID_KEYED_LEAD_CATEGORIES so it can
// never drift from the filter's own definition of what counts as each
// category. Only the tender-ID-keyed categories are shown per-row this way
// (a SQL CASE can't cheaply run the CIN bridge per row); values are a fixed,
// server-owned constant (never user input), so inlining them as SQL string
// literals here is safe — same pattern already used by the migrations for
// CHECK constraint value lists.
const LEAD_SIGNAL_CATEGORY_CASE = Object.entries(TENDER_ID_KEYED_LEAD_CATEGORIES)
  .map(
    ([label, signalTypes]) => `WHEN EXISTS (
      SELECT 1 FROM lead_signals ls
      WHERE ls.signal_type IN (${signalTypes.map((type) => `'${type}'`).join(',')})
        AND JSON_UNQUOTE(JSON_EXTRACT(ls.raw_data, '$.tenderId')) = tenders.tender_id
    ) THEN '${label}'`
  )
  .join(' ');

/**
 * Resolves which real `tenders` rows' winning company has at least one real
 * `lead_signals` row of one of `signalTypes` (GST_REGISTRATION,
 * NEW_COMPANY_REGISTRATION, or COMPANY_EXPANSION — all CIN-keyed, never
 * tender-ID-keyed). Reuses probe42Repository.findByCompanyName() — the
 * exact same matcher already trusted for qualification scoring and the
 * evidence collector — never a new/duplicate name-matching implementation.
 * Bounded by real table sizes (currently ~104 tenders with a winning
 * company, 4 Probe42 profiles), so the parallel per-winner lookups stay
 * cheap. Returns [] (not an error) when nothing real matches.
 */
async function resolveTenderIdsByCinSignalTypes(signalTypes) {
  const winners = await all(
    `SELECT tender_id, winning_company_name FROM tenders WHERE winning_company_name IS NOT NULL`
  );
  if (!winners.length) return [];

  const cinRows = await all(
    `SELECT DISTINCT company_cin FROM lead_signals WHERE signal_type IN (${signalTypes.map(() => '?').join(',')}) AND company_cin IS NOT NULL`,
    signalTypes
  );
  const targetCins = new Set(cinRows.map((row) => row.company_cin));
  if (targetCins.size === 0) return [];

  const profiles = await Promise.all(
    winners.map((winner) => probe42Repository.findByCompanyName(winner.winning_company_name))
  );

  return winners
    .filter((_, index) => profiles[index]?.cin && targetCins.has(profiles[index].cin))
    .map((winner) => winner.tender_id);
}

// PHASE 7 — whether a real human decision has been persisted for this
// tender's generated proposal: either the PHASE 3 Proposal Review
// (reviewed_by) or the PHASE 4 Communication Review (communication_approved_by).
// Scoped to raw_ai_response IS NOT NULL — same "generated proposal" scope
// proposalPipelineService.js/communicationPreparationService.js already use
// — so a legacy POST /api/tender-proposals row (never reviewed by a human
// through the real review endpoints) can never count as human-reviewed.
// Defined once and reused identically in both the SELECT projection (per-row
// display) and the WHERE clause (the "Human Selected" filter), so a row
// flagged human-reviewed in one place is guaranteed to match in the other.
const HUMAN_REVIEWED_EXISTS = `EXISTS (
  SELECT 1 FROM tender_proposals tp
  WHERE tp.tender_id = tenders.tender_id
    AND tp.raw_ai_response IS NOT NULL
    AND (tp.reviewed_by IS NOT NULL OR tp.communication_approved_by IS NOT NULL)
)`;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Resolves the Leads page's Date filter to a [from, to) bound on
 * `created_at` (when the tender was scraped/added — the only real date
 * column on `tenders` that's an actual TIMESTAMP rather than a free-text
 * scraped string). `to` is always exclusive so "today" includes the whole
 * current day regardless of what time it is right now.
 */
function resolveCreatedAtRange(dateRange, dateFrom, dateTo) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + ONE_DAY_MS);

  switch (dateRange) {
    case 'today':
      return { from: todayStart, to: tomorrowStart };
    case 'last_7_days':
      return { from: new Date(todayStart.getTime() - 6 * ONE_DAY_MS), to: tomorrowStart };
    case 'last_30_days':
      return { from: new Date(todayStart.getTime() - 29 * ONE_DAY_MS), to: tomorrowStart };
    case 'last_90_days':
      return { from: new Date(todayStart.getTime() - 89 * ONE_DAY_MS), to: tomorrowStart };
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) };
    case 'custom': {
      const from = isNonEmpty(dateFrom) ? startOfDay(new Date(dateFrom)) : undefined;
      const to = isNonEmpty(dateTo) ? new Date(startOfDay(new Date(dateTo)).getTime() + ONE_DAY_MS) : undefined;
      return { from, to };
    }
    default:
      return null;
  }
}

/**
 * Lists `tenders` with search/category/source/hasWinner filters, sort, and
 * page/limit pagination — same shape as sourceService.listSources().
 * `page`/`limit` are parsed defensively (they arrive as query-string
 * values) and interpolated as LIMIT/OFFSET since mysql2 can't bind those as
 * placeholders; every filter value stays a bound `?` param.
 */
export async function listTenders({
  search,
  category,
  source,
  state,
  district,
  leadCategory,
  hasWinner,
  amountRange,
  dateRange,
  dateFrom,
  dateTo,
  pipelineStatus,
  pipeline_status: pipelineStatusSnake,
  leadStatus,
  lead_status: leadStatusSnake,
  proposalStatus,
  proposal_status: proposalStatusSnake,
  aiHuman,
  ai_human: aiHumanSnake,
  page = 1,
  limit = 10,
  sortBy = 'created_at',
  order = 'desc',
} = {}) {
  const conditions = [];
  const params = [];

  // Accepts either naming convention: leadController.list forwards
  // req.query as-is (no snake->camel remapping, unlike tenderController.list
  // below), so a real `?pipeline_status=...` query string arrives here
  // under its raw snake_case key. A bound `?` param either way — no
  // whitelist needed (unlike SORTABLE_COLUMNS, which whitelists identifiers
  // that can't be parameterized; this is a value, not an identifier).
  const effectivePipelineStatus = pipelineStatus ?? pipelineStatusSnake;
  if (isNonEmpty(effectivePipelineStatus)) {
    conditions.push('pipeline_status = ?');
    params.push(effectivePipelineStatus);
  }

  // Same accepts-either-naming-convention pattern as pipeline_status above.
  // lead_status here doubles as the Leads page's Priority filter (High/
  // Medium/Low map to the real QUALIFIED_GOOD/HITL/BAD values already
  // written by qualificationScoringService.js) — not a new column or a
  // separately-persisted "priority" value.
  const effectiveLeadStatus = leadStatus ?? leadStatusSnake;
  if (isNonEmpty(effectiveLeadStatus)) {
    conditions.push('lead_status = ?');
    params.push(effectiveLeadStatus);
  }

  // Filters to tenders whose LATEST generated proposal (raw_ai_response IS
  // NOT NULL, highest id per tender_id) has this real tender_proposals.status
  // value (e.g. 'APPROVED') — same "latest" definition
  // tenderProposalRepository.getProposalStateByTenderIds() uses to compute
  // the proposal_status column this filter's value is meant to match.
  // Needed so Communication's approved-proposals queue can paginate
  // server-side instead of filtering the page's rows client-side after the
  // fact (which would make "Page X of Y" count the wrong universe of rows).
  const effectiveProposalStatus = proposalStatus ?? proposalStatusSnake;
  if (isNonEmpty(effectiveProposalStatus)) {
    conditions.push(`EXISTS (
      SELECT 1 FROM tender_proposals tp
      INNER JOIN (
        SELECT tender_id, MAX(id) AS max_id
        FROM tender_proposals
        WHERE raw_ai_response IS NOT NULL
        GROUP BY tender_id
      ) latest ON latest.tender_id = tp.tender_id AND latest.max_id = tp.id
      WHERE tp.tender_id = tenders.tender_id AND tp.status = ?
    )`);
    params.push(effectiveProposalStatus);
  }

  if (isNonEmpty(search)) {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(winning_company_name) LIKE ? OR LOWER(company_name) LIKE ?)');
    const term = `%${String(search).trim().toLowerCase()}%`;
    params.push(term, term, term);
  }

  // `category` doubles as the Analytics page's "Sectors" multi-select — a
  // single value keeps its original exact-match behavior (Leads page
  // usage, unchanged); a comma-separated list (Analytics sending 2+
  // selected sectors) becomes a real IN (...) match instead of being
  // silently dropped or requiring a second endpoint.
  if (isNonEmpty(category)) {
    const categoryList = String(category).split(',').map((value) => value.trim()).filter(Boolean);
    if (categoryList.length === 1) {
      conditions.push('category = ?');
      params.push(categoryList[0]);
    } else if (categoryList.length > 1) {
      conditions.push(`category IN (${categoryList.map(() => '?').join(',')})`);
      params.push(...categoryList);
    }
  }

  if (isNonEmpty(source)) {
    conditions.push('source = ?');
    params.push(source);
  }

  if (isNonEmpty(state)) {
    conditions.push('tender_state = ?');
    params.push(state);

    // District only ever applies alongside a State — the same district
    // name can exist under multiple states, so filtering by district alone
    // (no state selected) would silently match the wrong state's rows.
    // Mirrors the Leads page's own State -> District UI dependency, where
    // the District dropdown is only enabled/populated once a State is
    // chosen. Filters on `tender_district`, not the older `district`
    // column — the real scrape-normalization path
    // (documentProcessorService.js -> upsertTender()) writes district data
    // into tender_district, so `district` stays permanently empty and
    // would silently break this filter.
    if (isNonEmpty(district)) {
      conditions.push('tender_district = ?');
      params.push(district);
    }
  }

  // `tenders.lead_category` itself is NULL on every row (no classification
  // pipeline writes it), so this is derived at query time from real
  // `lead_signals` evidence instead — see TENDER_ID_KEYED_LEAD_CATEGORIES/
  // CIN_KEYED_LEAD_CATEGORIES above. Anything else — an old/unsupported
  // value — honestly returns zero rows rather than silently ignoring the
  // filter.
  if (isNonEmpty(leadCategory)) {
    const tenderIdKeyedTypes = TENDER_ID_KEYED_LEAD_CATEGORIES[leadCategory];
    const cinKeyedTypes = CIN_KEYED_LEAD_CATEGORIES[leadCategory];

    if (tenderIdKeyedTypes?.length) {
      conditions.push(`EXISTS (
        SELECT 1 FROM lead_signals ls
        WHERE ls.signal_type IN (${tenderIdKeyedTypes.map(() => '?').join(',')})
          AND JSON_UNQUOTE(JSON_EXTRACT(ls.raw_data, '$.tenderId')) = tenders.tender_id
      )`);
      params.push(...tenderIdKeyedTypes);
    } else if (cinKeyedTypes?.length) {
      const matchingTenderIds = await resolveTenderIdsByCinSignalTypes(cinKeyedTypes);
      if (matchingTenderIds.length) {
        conditions.push(`tender_id IN (${matchingTenderIds.map(() => '?').join(',')})`);
        params.push(...matchingTenderIds);
      } else {
        conditions.push('1 = 0');
      }
    } else {
      conditions.push('1 = 0');
    }
  }

  if (isNonEmpty(hasWinner)) {
    const wantsWinner = hasWinner === 'true' || hasWinner === true || hasWinner === '1';
    conditions.push(wantsWinner ? 'winning_company_name IS NOT NULL' : 'winning_company_name IS NULL');
  }

  if (isNonEmpty(amountRange) && AMOUNT_RANGES[amountRange]) {
    const range = AMOUNT_RANGES[amountRange];
    if (range.min !== undefined) {
      conditions.push(`amount_value ${range.minInclusive ? '>=' : '>'} ?`);
      params.push(range.min);
    }
    if (range.max !== undefined) {
      conditions.push(`amount_value ${range.maxInclusive ? '<=' : '<'} ?`);
      params.push(range.max);
    }
  }

  if (isNonEmpty(dateRange) && dateRange !== 'All') {
    const range = resolveCreatedAtRange(dateRange, dateFrom, dateTo);
    if (range) {
      if (range.from) {
        conditions.push('created_at >= ?');
        params.push(range.from);
      }
      if (range.to) {
        conditions.push('created_at < ?');
        params.push(range.to);
      }
    }
  }

  // PHASE 7 — Analytics' "AI Selected"/"Human Selected" Lead Records filter.
  // 'ai' means the real qualification pipeline has actually persisted a
  // completed outcome for this row (qualification_completed_at is only ever
  // set by tenderRepository.saveQualificationResult() on a successful
  // qualification run — see addLeadQualificationSchema.js). 'human' reuses
  // the exact same EXISTS condition the SELECT projection uses below (see
  // HUMAN_REVIEWED_EXISTS's header), so this filter and the AI/Human column
  // can never disagree about which rows count as human-reviewed. Any other
  // value is ignored (behaves like "All") rather than guessed at.
  const effectiveAiHuman = aiHuman ?? aiHumanSnake;
  if (effectiveAiHuman === 'ai') {
    conditions.push('qualification_completed_at IS NOT NULL');
  } else if (effectiveAiHuman === 'human') {
    conditions.push(HUMAN_REVIEWED_EXISTS);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const sortColumn = SORTABLE_COLUMNS[sortBy] || 'created_at';
  const sortOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const totalRow = await get(`SELECT COUNT(*) AS count FROM tenders ${whereClause}`, params);
  const total = totalRow?.count || 0;

  // Same conditions/params as the main query above, plus the winner check —
  // so "enriched" reflects the active filter (e.g. a category with 0
  // winners must report 0, not the whole table's count) instead of a
  // global, filter-blind number.
  const enrichedWhereClause = `WHERE ${[...conditions, 'winning_company_name IS NOT NULL'].join(' AND ')}`;
  const enrichedRow = await get(`SELECT COUNT(*) AS count FROM tenders ${enrichedWhereClause}`, params);
  const valueRow = await get(`SELECT SUM(amount_value) AS total FROM tenders`);

  // PHASE 7 — two derived, read-only columns appended to the real row data:
  // lead_signal_category (which real lead_signals-backed category this
  // tender belongs to, if any — see LEAD_SIGNAL_CATEGORY_CASE) and
  // human_reviewed (whether a real human review decision is persisted for
  // this tender — see HUMAN_REVIEWED_EXISTS). Both are correlated
  // subqueries in the SELECT list, so — unlike the WHERE-clause filters
  // above — they only ever execute for the LIMIT rows actually returned on
  // this page, never across the whole table.
  const tenders = await all(
    `SELECT tenders.*,
        (CASE ${LEAD_SIGNAL_CATEGORY_CASE} END) AS lead_signal_category,
        ${HUMAN_REVIEWED_EXISTS} AS human_reviewed
     FROM tenders ${whereClause}
     ORDER BY ${sortColumn} ${sortOrder}, id DESC LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    tenders: parseJsonColumnsAll(tenders, TENDER_JSON_COLUMNS),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
    stats: {
      enriched: enrichedRow?.count || 0,
      totalValue: valueRow?.total !== null && valueRow?.total !== undefined ? Number(valueRow.total) : null,
    },
  };
}

/** Looks up a tender by its natural key (tender_id), not the numeric `id` PK — every other part of this app (URLs, dedupe checks, the scraper) already keys off tender_id. Returns undefined if not found; callers decide whether that's a 404. */
export async function getTenderById(tenderId) {
  const row = await get('SELECT * FROM tenders WHERE tender_id = ?', [tenderId]);
  return parseJsonColumns(row, TENDER_JSON_COLUMNS);
}

/**
 * PHASE 5: real qualification-outcome distribution — one GROUP BY over the
 * whole table, no filter/injectable input. Backs the Dashboard's
 * qualification KPI cards/funnel/distribution without requiring the
 * frontend to page through all 1,901+ rows to count them itself (the
 * "inefficient frontend aggregation" PHASE 5 spec §3 explicitly warns
 * against) or requiring a per-status filter added to listTenders() (which
 * nothing else in this app needs today — see pipelineSummaryService.js's
 * header for why this single query was the smaller footprint of the two
 * options).
 */
export async function getQualificationCounts() {
  const rows = await all('SELECT lead_status, COUNT(*) AS count FROM tenders GROUP BY lead_status');
  return rows.map((row) => ({ leadStatus: row.lead_status, count: row.count }));
}

/**
 * Every Lead Category the backend can honestly back with real
 * `lead_signals` evidence — the tender-ID-keyed categories (matched via a
 * plain SQL EXISTS) plus the CIN-keyed ones (matched via the real
 * Probe42-CIN bridge — see resolveTenderIdsByCinSignalTypes()). Not a DB
 * query: which categories exist is an architectural fact about the schema
 * plus the fixed SIGNAL_TYPES enum (addLeadSignalsSchema.js), not data that
 * changes at runtime.
 */
export function listLeadCategories() {
  return [...Object.keys(TENDER_ID_KEYED_LEAD_CATEGORIES), ...Object.keys(CIN_KEYED_LEAD_CATEGORIES)];
}

/** Distinct, non-empty category values actually present in `tenders` — backs the Lead Dashboard's category filter with real data instead of a hardcoded/guessed list. */
export async function listCategories() {
  const rows = await all(
    `SELECT DISTINCT category FROM tenders WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`
  );
  return rows.map((row) => row.category);
}

/** Distinct, non-empty tender_state values actually present in `tenders` — backs the State filter dropdown with real data instead of a hardcoded/guessed list. */
export async function listStates() {
  const rows = await all(
    `SELECT DISTINCT tender_state FROM tenders WHERE tender_state IS NOT NULL AND tender_state != '' ORDER BY tender_state ASC`
  );
  return rows.map((row) => row.tender_state);
}

/**
 * Distinct, non-empty tender_district values actually present in `tenders`,
 * optionally narrowed to a single state — backs the District filter, which
 * must only offer districts that belong to the selected State (or all
 * districts when no state is selected). Reads tender_district, not the
 * older `district` column — see the comment on the district filter in
 * listTenders() above for why.
 */
export async function listDistricts(state) {
  const conditions = ["tender_district IS NOT NULL", "tender_district != ''"];
  const params = [];

  if (isNonEmpty(state)) {
    conditions.push('tender_state = ?');
    params.push(state);
  }

  const rows = await all(
    `SELECT DISTINCT tender_district FROM tenders WHERE ${conditions.join(' AND ')} ORDER BY tender_district ASC`,
    params
  );
  return rows.map((row) => row.tender_district);
}

/**
 * Upserts a normalized tender row keyed on tender_id (the natural/business
 * key). Only the fields this pipeline is authoritative over are updated on
 * conflict — company_name/cin/gst/email/phone/state belong to the MCA
 * ingest pipeline and are left untouched here, mirroring the exact
 * ON DUPLICATE KEY UPDATE column list already proven in
 * src/jobs/migrateTenderData.js.
 */
export async function upsertTender(tender, db = defaultDb) {
  await db.run(
    `
    INSERT INTO tenders
    (
        tender_id,
        title,
        description,
        category,
        location,
        amount,
        amount_value,
        contract_date,
        url,
        source,
        company_name,
        tender_type,
        closing_date,
        tender_city,
        tender_state,
        tender_district,
        emd_amount,
        tender_fee,
        buyer_department,
        publish_date,
        opening_date,
        pdf_url,
        buyer_contact_person,
        buyer_contact_phone,
        buyer_contact_email,
        buyer_address,
        winning_company_name,
        winning_bid_amount,
        winning_bid_amount_value
    )
    VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

    ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        category = VALUES(category),
        location = VALUES(location),
        amount = VALUES(amount),
        amount_value = VALUES(amount_value),
        contract_date = VALUES(contract_date),
        url = VALUES(url),
        tender_type = VALUES(tender_type),
        closing_date = VALUES(closing_date),
        tender_city = VALUES(tender_city),
        tender_state = VALUES(tender_state),
        tender_district = VALUES(tender_district),
        emd_amount = VALUES(emd_amount),
        tender_fee = VALUES(tender_fee),
        buyer_department = VALUES(buyer_department),
        publish_date = VALUES(publish_date),
        opening_date = VALUES(opening_date),
        pdf_url = VALUES(pdf_url),
        buyer_contact_person = VALUES(buyer_contact_person),
        buyer_contact_phone = VALUES(buyer_contact_phone),
        buyer_contact_email = VALUES(buyer_contact_email),
        buyer_address = VALUES(buyer_address),
        winning_company_name = VALUES(winning_company_name),
        winning_bid_amount = VALUES(winning_bid_amount),
        winning_bid_amount_value = VALUES(winning_bid_amount_value)
    `,
    [
      tender.tenderId,
      tender.title,
      tender.description,
      tender.category,
      tender.location,
      tender.amount,
      tender.amountValue,
      tender.contractDate,
      tender.url,
      tender.source,
      tender.companyName,
      tender.tenderType,
      tender.closingDate,
      tender.tenderCity,
      tender.tenderState,
      tender.tenderDistrict ?? null,
      tender.emdAmount,
      tender.tenderFee,
      tender.buyerDepartment,
      tender.publishDate,
      tender.openingDate,
      tender.pdfUrl,
      tender.buyerContactPerson,
      tender.buyerContactPhone,
      tender.buyerContactEmail,
      tender.buyerAddress,
      tender.winningCompanyName,
      tender.winningBidAmount,
      tender.winningBidAmountValue
    ]
  );

  // Best-effort TENDER lead_signals upsert — see
  // leadSignalRepository.js's upsertTenderSignal() doc for why this is
  // never allowed to fail the tender write above.
  try {
    await leadSignalRepository.upsertTenderSignal(tender);
  } catch (error) {
    console.error('[TenderRepository] Failed to upsert TENDER lead_signal (non-fatal):', error.message);
  }
}

/**
 * Enrichment-only write: sets winner fields on an EXISTING tenders row
 * (matched by tender_id) and touches no other column. Used by the winner
 * backfill job (src/jobs/tenderbookEnrichWinners.js), which must never
 * create a tender — only upsertTender() (the scrape-normalization path)
 * is allowed to INSERT.
 *
 * COALESCE keeps whichever value (new or existing) is non-null instead of
 * blindly overwriting: the backfill job re-selects any row missing EITHER
 * winner field, so a row that already has winning_company_name but not
 * winning_bid_amount would otherwise have its already-known name wiped out
 * to NULL if this run's page fetch didn't happen to re-surface it.
 */
export async function updateWinnerFields(tenderId, fields, db = defaultDb) {
  const result = await db.run(
    `
    UPDATE tenders
    SET
        winning_company_name = COALESCE(?, winning_company_name),
        winning_bid_amount = COALESCE(?, winning_bid_amount),
        winning_bid_amount_value = COALESCE(?, winning_bid_amount_value)
    WHERE tender_id = ?
    `,
    [
      fields.winningCompanyName ?? null,
      fields.winningBidAmount ?? null,
      fields.winningBidAmountValue ?? null,
      tenderId
    ]
  );

  return result.changes > 0;
}

/**
 * Sets only pipeline_status/lead_status on an existing tenders row — used
 * for the transient "READY_FOR_QUALIFY"/"QUALIFYING" transitions the Lead
 * Qualification workflow (src/services/leadQualificationPipelineService.js)
 * writes before the deterministic score itself is known. Touches no other
 * column, same enrichment-only shape as updateWinnerFields() above.
 */
export async function updatePipelineTransition(tenderId, { pipelineStatus, leadStatus }, db = defaultDb) {
  const result = await db.run(
    `UPDATE tenders SET pipeline_status = ?, lead_status = ? WHERE tender_id = ?`,
    [pipelineStatus, leadStatus, tenderId]
  );
  return result.changes > 0;
}

/**
 * Persists a completed (or failed) deterministic qualification result.
 * On success, qualification_error is explicitly cleared (a re-qualification
 * after a prior failure must not leave a stale error message behind). On
 * failure, score/reason/completed_at are left untouched — the last
 * successful qualification (if any) stays intact rather than being wiped
 * by a failed retry.
 */
export async function saveQualificationResult(tenderId, { pipelineStatus, leadStatus, score, reason, error }, db = defaultDb) {
  const result = error !== undefined
    ? await db.run(
        `UPDATE tenders SET pipeline_status = ?, lead_status = ?, qualification_error = ? WHERE tender_id = ?`,
        [pipelineStatus, leadStatus, error, tenderId]
      )
    : await db.run(
        `
        UPDATE tenders
        SET
            pipeline_status = ?,
            lead_status = ?,
            qualification_score = ?,
            qualification_reason = ?,
            qualification_completed_at = NOW(),
            qualification_error = NULL
        WHERE tender_id = ?
        `,
        [pipelineStatus, leadStatus, score, JSON.stringify(reason), tenderId]
      );

  return result.changes > 0;
}