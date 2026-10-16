import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, ChevronDown, ClipboardList, Inbox, Loader2, PieChart, SearchX } from 'lucide-react';
import Card from '../components/ui/Card';
import PipelineDistribution from '../components/analytics/PipelineDistribution';
import Button from '../components/ui/Button';
import SearchBox from '../components/ui/SearchBox';
import Select from '../components/ui/Select';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import { fetchTenders, fetchTenderCategories, fetchTenderLeadCategories } from '../services/tendersApi';
import { fetchLeads } from '../services/leadsApi';
import { useDebounce } from '../hooks/useDebounce';
import { formatDate, formatInrCompact, tenderTitleFrom, tenderStatus } from '../utils/tenderFormatters';

// No dedicated analytics/aggregation endpoint exists on the backend. Every
// number on this page is derived from the same two real, already-existing
// endpoints the rest of the app uses (GET /api/tenders and
// GET /api/tenders/categories) — `pagination.total`/`stats.enriched`/
// `stats.totalValue` are computed server-side regardless of `limit`, so
// requesting `limit=1` per filter combination is a cheap, real way to build
// distributions without a dedicated aggregation route. `stats.totalValue`
// (SUM(amount_value) across the whole table) is the exact same field
// Dashboard's "Total Tender Value" hero metric reads from this same
// endpoint — this page's overallQuery already fetches it.
//
// Two sections the spec asks for have NO real bulk data source at all:
//  - Lead Quality Distribution: HOT/WARM/QUALIFIED/LOW PRIORITY grades are
//    computed on demand by GET /api/tenders/:tenderId/health-check and never
//    persisted anywhere — there is no column/endpoint to aggregate them
//    across tenders without calling that endpoint once per tender (1,900+
//    calls), which isn't a reasonable reading of "derive from already
//    available API responses."
//  - Proposal Pipeline: GET /api/tender-proposals requires a `tenderId`
//    query param (verified in tenderProposalController.js) — there is no
//    "list all proposals" capability, so pipeline-wide counts aren't
//    available either.
// Both render "Awaiting backend integration." rather than a fabricated
// number or a per-tender N+1 fetch dressed up as an aggregate.
//
// PHASE 7 exception — the Lead Records table below fetches from
// GET /api/leads (leadsApi.fetchLeads), not GET /api/tenders: it's the same
// underlying `tenders` row, but /api/leads is the authenticated endpoint
// that also carries the real Phase 1-6 pipeline columns (pipeline_status,
// lead_status, qualification_completed_at) plus two read-only columns
// tenderRepository.listTenders() now derives per row —
// lead_signal_category (real lead_signals evidence) and human_reviewed
// (a real persisted Proposal/Communication Review decision) — see that
// function's PHASE 7 comments. Nothing here is computed client-side from
// nothing; every value traces back to a real column or a real EXISTS
// subquery over lead_signals/tender_proposals.

interface CategoriesResponse {
  categories: string[];
}

interface LeadCategoriesResponse {
  leadCategories: string[];
}

interface TendersResponse {
  tenders: LeadRecord[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  stats: { enriched: number; totalValue: number | null };
}

interface LeadRecord {
  tender_id: string;
  title: string | null;
  company_name: string | null;
  description: string | null;
  category: string | null;
  amount: string | null;
  closing_date: string | null;
  winning_company_name: string | null;
  // Only present when fetched via GET /api/leads (leadRecordsQuery below) —
  // GET /api/tenders (overallQuery/distributionQuery) doesn't return these.
  pipeline_status?: string;
  lead_status?: string;
  qualification_completed_at?: string | null;
  lead_signal_category?: string | null;
  human_reviewed?: number | boolean;
  // Real, latest generated-proposal state for this tender (see
  // leadController.list's batched tenderProposalRepository.
  // getProposalStateByTenderIds() enrichment) — null/null when no real
  // Phase 2 generated proposal exists yet (never a legacy
  // POST /api/tender-proposals row).
  proposal_status?: string | null;
  communication_status?: string | null;
}

interface CategoryCount {
  category: string;
  total: number;
}

// Same lead-status framing as the Dashboard's KPI cards. Only "All" and
// "Winning Companies Identified" map to a real, queryable `tenders` field
// (no filter, and winning_company_name IS NOT NULL respectively) — the
// other three workflow stages have no persisted per-tender status anywhere
// in the schema yet (see Dashboard.tsx's identical AWAITING_INTEGRATION
// cards), so selecting one of them here honestly returns no rows instead of
// guessing.
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'total', label: 'Total Tenders Identified' },
  { value: 'health_check', label: 'Awaiting Health Check' },
  { value: 'awaiting_proposal', label: 'Awaiting Proposal' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'review_waiting', label: 'Review Waiting List' },
  { value: 'winning', label: 'Winning Companies Identified' },
] as const;

const UNSUPPORTED_STATUS_VALUES: ReadonlyArray<(typeof STATUS_TABS)[number]['value']> = [
  'health_check',
  'awaiting_proposal',
  'proposal_sent',
  'review_waiting',
];

// PHASE 7: real filter, backed by tenderRepository.listTenders()'s
// `aiHuman`/`ai_human` param. "AI Selected" = qualification_completed_at IS
// NOT NULL (the deterministic + advisory qualification pipeline actually
// ran). "Human Selected" = a real Proposal Review or Communication Review
// decision is persisted for that tender's generated proposal
// (HUMAN_REVIEWED_EXISTS) — never true just because a lead is merely
// eligible for review.
// value: 'human' stays as-is — it's the real backend ai_human filter value
// (tenderRepository.listTenders()'s param), not display text; only the
// visible label changes.
const AI_HUMAN_OPTIONS = [
  { value: 'All', label: 'All' },
  { value: 'ai', label: 'AI Selected' },
  { value: 'human', label: 'Expert Selected' },
] as const;

// Mirrors the real `date_range` values tenderRepository.listTenders() already
// accepts (see resolveCreatedAtRange) — created_at is the only real TIMESTAMP
// column on `tenders`, so this filters when a lead was actually scraped in.
const DATE_OPTIONS = [
  { value: 'All', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'this_year', label: 'This Year' },
] as const;

const STATUS_TONE: Record<string, StatusTone> = { Awarded: 'success', Open: 'info', Closed: 'neutral' };

/**
 * Derives the Lead Records "AI / Human" cell from real, persisted pipeline
 * state only — never from eligibility, and never two conflicting labels at
 * once. Walks the real funnel furthest-stage-first (Communication ->
 * Proposal -> Qualification), so a lead that's actually reached
 * Communication Review shows that, not a stale "AI — Qualified" left over
 * from an earlier stage:
 *
 *   lead_status                              -> Not Qualified / AI — Bad /
 *                                                Expert Review / AI — Qualified
 *     -> proposal_status (real generated proposal only — leadController.list's
 *        batched query already excludes any legacy row with
 *        raw_ai_response IS NULL)            -> AI Proposal Ready / Expert
 *                                                Approved / Changes Requested /
 *                                                Proposal Rejected / Proposal
 *                                                On Hold
 *       -> communication_status               -> Communication Ready /
 *                                                Awaiting Send Approval /
 *                                                Communication On Hold /
 *                                                Communication Rejected
 *
 * lead_status QUALIFIED_HITL reuses "Expert Review" for the qualification-
 * stage HITL gate specifically (proposalPipelineService.js blocks proposal
 * generation for HITL/BAD outright, so a HITL row can never also have a
 * proposal_status — no ambiguity with the proposal-stage labels below).
 */
function resolveAiHumanState(record: LeadRecord): { label: string; tone: StatusTone } | null {
  switch (record.communication_status) {
    case 'AWAITING_SEND_APPROVAL':
      return { label: 'Awaiting Send Approval', tone: 'success' };
    case 'DRAFT_READY':
      return { label: 'Communication Ready', tone: 'info' };
    case 'ON_HOLD':
      return { label: 'Communication On Hold', tone: 'neutral' };
    case 'REJECTED':
      return { label: 'Communication Rejected', tone: 'danger' };
    default:
      break;
  }

  switch (record.proposal_status) {
    case 'READY_FOR_REVIEW':
    case 'NEEDS_HUMAN_REVIEW':
      return { label: 'AI Proposal Ready', tone: 'info' };
    case 'APPROVED':
      return { label: 'Expert Approved', tone: 'success' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes Requested', tone: 'warning' };
    case 'REJECTED':
      return { label: 'Proposal Rejected', tone: 'danger' };
    case 'ON_HOLD':
      return { label: 'Proposal On Hold', tone: 'neutral' };
    default:
      break;
  }

  switch (record.lead_status) {
    case 'QUALIFIED_GOOD':
      return { label: 'AI — Qualified', tone: 'success' };
    case 'QUALIFIED_HITL':
      return { label: 'Expert Review', tone: 'warning' };
    case 'QUALIFIED_BAD':
      return { label: 'AI — Bad', tone: 'danger' };
    case 'IDENTIFYING':
    case 'QUALIFY':
      return { label: 'Not Qualified', tone: 'neutral' };
    default:
      // lead_status is only ever undefined when the row came from
      // GET /api/tenders instead of GET /api/leads — never real for this
      // table's own leadRecordsQuery. Honest "unknown" rather than a guess.
      return null;
  }
}

const selectClass =
  'h-10 w-full rounded-lg border border-hairline-strong bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10';

const LIMIT = 10;

function KpiCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  const isUnavailable = value === 'Awaiting backend integration.';

  return (
    <Card accent className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-surface-sunken" />
      ) : isUnavailable ? (
        <p className="mt-2 text-sm font-medium text-ink-muted">{value}</p>
      ) : (
        <p className="tabular mt-2 text-2xl font-bold text-ink">{value}</p>
      )}
    </Card>
  );
}

/** Checkbox-list dropdown for the Sectors filter — real `tenders.category` values only, "Select All" included per spec. Closes on outside click, like a native <select>. */
function SectorMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = options.length > 0 && selected.length === options.length;

  function toggleAll() {
    onChange(allSelected ? [] : options);
  }

  function toggleOne(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  const label =
    selected.length === 0 || allSelected
      ? 'All Sectors'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} Sectors`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={`${selectClass} flex items-center justify-between gap-2 text-left`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-hairline-strong bg-white p-2 shadow-lg">
          <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-primary-tint">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-hairline-strong text-primary focus:ring-primary/30"
            />
            <span className="font-semibold text-ink">Select All</span>
          </label>
          <div className="my-1 border-t border-surface-sunken" />
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-ink-muted">No sectors available.</p>
          ) : (
            options.map((option) => (
              <label key={option} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-primary-tint">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => toggleOne(option)}
                  className="h-4 w-4 rounded border-hairline-strong text-primary focus:ring-primary/30"
                />
                <span className="text-ink">{option}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Analytics() {
  const navigate = useNavigate();

  // Lead Records' filters/pagination live in the URL (same pattern as
  // TenderLeads.tsx) — this table now navigates away on every row click
  // (see the "View Details" button below), so without this the whole
  // filter set would reset to defaults on remount every time a user comes
  // back from Lead Details via the Sidebar. `selectedIds` (the bulk-action
  // checkbox selection) deliberately stays local component state below: no
  // bulk action actually consumes it yet, so persisting an arbitrary set of
  // tender_ids into the URL would add real complexity for a still-inert
  // UI affordance — flagged here rather than silently done.
  const [searchParams, setSearchParams] = useSearchParams();

  const statusTab = (searchParams.get('status') ?? 'all') as (typeof STATUS_TABS)[number]['value'];
  const selectedSectorsParam = searchParams.get('sectors') ?? '';
  const selectedSectors = selectedSectorsParam ? selectedSectorsParam.split(',') : [];
  const leadCategory = searchParams.get('leadCategory') ?? 'All';
  const aiHuman = (searchParams.get('aiHuman') ?? 'All') as (typeof AI_HUMAN_OPTIONS)[number]['value'];
  const dateFilter = (searchParams.get('dateRange') ?? 'All') as (typeof DATE_OPTIONS)[number]['value'];
  const search = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounce(search, 300);

  // Same replace-not-push URL-writing convention as TenderLeads.tsx: filter
  // changes don't flood browser history, and always land back on page 1.
  function updateParams(patch: Record<string, string | undefined>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (!value || value === 'All') next.delete(key);
          else next.set(key, value);
        }
        next.delete('page');
        return next;
      },
      { replace: true }
    );
  }

  function updateFilter<T extends string>(key: string) {
    return (value: T) => updateParams({ [key]: value });
  }

  function setPage(next: number) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next <= 1) params.delete('page');
        else params.set('page', String(next));
        return params;
      },
      { replace: true }
    );
  }

  const categoriesQuery = useQuery({
    queryKey: ['analytics-categories'],
    queryFn: () => fetchTenderCategories() as Promise<CategoriesResponse>,
    staleTime: 5 * 60_000,
  });
  const categories = categoriesQuery.data?.categories ?? [];

  // Real lead_signals-backed categories (currently just "Tender" — see
  // tenderRepository.js's LEAD_CATEGORY_SIGNAL_TYPES) for the Lead Category
  // filter — same endpoint the Leads page's Lead Category filter already
  // uses, restored here per PHASE 7 spec §7.
  const leadCategoriesQuery = useQuery({
    queryKey: ['analytics-lead-categories'],
    queryFn: () => fetchTenderLeadCategories() as Promise<LeadCategoriesResponse>,
    staleTime: 5 * 60_000,
  });
  const leadCategories = leadCategoriesQuery.data?.leadCategories ?? [];

  const overallQuery = useQuery({
    queryKey: ['analytics-overall'],
    queryFn: () => fetchTenders({ limit: 1, page: 1 }) as Promise<TendersResponse>,
  });

  const distributionQuery = useQuery({
    queryKey: ['analytics-tender-distribution', categories],
    queryFn: async () => {
      const results = await Promise.all(
        categories.map(async (category): Promise<CategoryCount> => {
          const data = (await fetchTenders({ category, limit: 1, page: 1 })) as TendersResponse;
          return { category, total: data.pagination.total };
        })
      );
      return results.sort((a, b) => b.total - a.total);
    },
    enabled: categories.length > 0,
  });

  const isLoading = categoriesQuery.isLoading || overallQuery.isLoading;
  const isError = categoriesQuery.isError || overallQuery.isError || distributionQuery.isError;
  const firstError = categoriesQuery.error ?? overallQuery.error ?? distributionQuery.error;

  const totalTenders = overallQuery.data?.pagination.total ?? 0;
  const enriched = overallQuery.data?.stats.enriched ?? 0;
  const withoutWinner = Math.max(0, totalTenders - enriched);
  // Same GET /api/tenders `stats.totalValue` (a real SUM(amount_value) over
  // the whole table) that Dashboard's "Total Tender Value" hero metric
  // already reads — overallQuery already fetches it, this was just never
  // read from the response.
  const totalValue = overallQuery.data?.stats.totalValue;
  const totalValueDisplay = overallQuery.isError || totalValue == null ? 'Awaiting backend integration.' : formatInrCompact(totalValue);
  const categoryCounts = distributionQuery.data ?? [];
  const maxCategoryTotal = categoryCounts.reduce((max, item) => Math.max(max, item.total), 0);

  function handleRetry() {
    categoriesQuery.refetch();
    overallQuery.refetch();
    distributionQuery.refetch();
  }

  // ---- Lead Records: status tabs + checkbox table + Sectors/AI-Human/Date/Search filters ----
  // (statusTab/selectedSectors/leadCategory/aiHuman/dateFilter/search/page/
  // updateFilter/setPage are all declared above, sourced from the URL.)

  function setSelectedSectors(next: string[]) {
    updateParams({ sectors: next.length > 0 ? next.join(',') : undefined });
  }

  // Only the legacy STATUS_TABS values still have no backing field in the
  // schema (see UNSUPPORTED_STATUS_VALUES above) — rather than fabricate a
  // filtered dataset for them, the query is skipped and the table honestly
  // reports zero matching records. AI/Human is no longer in this list: PHASE
  // 7 wires it to a real, persisted qualification/review state (see
  // tenderRepository.listTenders()'s `aiHuman` param), so it's a real filter
  // like Sector/Date/Search below.
  const unsupportedReasons: string[] = [];
  if (UNSUPPORTED_STATUS_VALUES.includes(statusTab)) {
    unsupportedReasons.push(`the "${STATUS_TABS.find((tab) => tab.value === statusTab)?.label}" status`);
  }
  const isUnsupportedFilters = unsupportedReasons.length > 0;

  const isAllSectors = selectedSectors.length === 0 || selectedSectors.length === categories.length;

  // PHASE 7: hits GET /api/leads (authenticated), not GET /api/tenders —
  // the only endpoint whose response carries the real pipeline_status/
  // lead_status/qualification_completed_at/lead_signal_category/
  // human_reviewed fields the AI/Human column and filter below depend on.
  // Same filter shape as before (tenderService.listTenders forwards these
  // query params through to tenderRepository.listTenders unchanged), plus
  // `lead_category` and `ai_human`.
  const leadRecordsQuery = useQuery({
    queryKey: ['analytics-lead-records', statusTab, selectedSectors, leadCategory, aiHuman, dateFilter, debouncedSearch, page],
    queryFn: () =>
      fetchLeads({
        search: debouncedSearch,
        category: isAllSectors ? undefined : selectedSectors.join(','),
        lead_category: leadCategory,
        has_winner: statusTab === 'winning' ? 'true' : undefined,
        date_range: dateFilter !== 'All' ? dateFilter : undefined,
        ai_human: aiHuman,
        page,
        limit: LIMIT,
      }) as Promise<TendersResponse>,
    placeholderData: keepPreviousData,
    enabled: !isUnsupportedFilters,
  });

  const leadRecords = leadRecordsQuery.data?.tenders ?? [];
  const leadPagination = leadRecordsQuery.data?.pagination ?? { page: 1, limit: LIMIT, total: 0, total_pages: 1 };
  const hasActiveLeadFilters =
    Boolean(search) || statusTab !== 'all' || !isAllSectors || leadCategory !== 'All' || aiHuman !== 'All' || dateFilter !== 'All';

  const pageIds = leadRecords.map((record) => record.tender_id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allOnPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">Analytics</h2>
          <p className="mt-1 text-sm text-ink-soft">Measure lead conversion, proposal performance, and relationship manager activity.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleRetry}
          disabled={categoriesQuery.isFetching || overallQuery.isFetching || distributionQuery.isFetching}
        >
          <Loader2
            className={`h-4 w-4 ${
              categoriesQuery.isFetching || overallQuery.isFetching || distributionQuery.isFetching ? 'animate-spin' : ''
            }`}
            strokeWidth={2}
          />
          Refresh
        </Button>
      </div>

      {isError && (
        <Card className="grid justify-items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
          <p className="text-sm font-semibold text-danger">Couldn&apos;t load analytics data</p>
          <p className="max-w-sm text-xs text-ink-muted">
            {firstError instanceof Error ? firstError.message : 'An unexpected error occurred.'}
          </p>
          <Button type="button" variant="secondary" onClick={handleRetry}>Retry</Button>
        </Card>
      )}

      {!isError && !isLoading && totalTenders === 0 && (
        <Card className="grid justify-items-center gap-3 p-12 text-center">
          <Inbox className="h-8 w-8 text-ink-muted" strokeWidth={2} />
          <p className="text-sm font-semibold text-ink">No tenders yet</p>
          <p className="max-w-sm text-xs text-ink-muted">Analytics will populate once tenders have been scraped into the database.</p>
        </Card>
      )}

      {!isError && (isLoading || totalTenders > 0) && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total Tenders" value={totalTenders.toLocaleString('en-IN')} loading={isLoading} />
            <KpiCard label="Winning Companies Identified" value={enriched.toLocaleString('en-IN')} loading={isLoading} />
            <KpiCard label="Categories Tracked" value={categories.length.toLocaleString('en-IN')} loading={isLoading} />
            <KpiCard label="Total Tender Value" value={totalValueDisplay} loading={isLoading} />
          </div>

          {/* Tender Distribution */}
          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
                <PieChart className="h-4 w-4" strokeWidth={2} />
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Tender Distribution by Category</h3>
            </div>
            {distributionQuery.isLoading ? (
              <div className="mt-4 grid gap-3">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-6 w-full animate-pulse rounded bg-surface-sunken" />
                ))}
              </div>
            ) : categoryCounts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">No category data available.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {categoryCounts.map(({ category, total }) => (
                  <div key={category} className="grid gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink">{category}</span>
                      <span className="tabular font-semibold text-ink-soft">{total.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${maxCategoryTotal > 0 ? (total / maxCategoryTotal) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Lead Quality Distribution + Proposal Pipeline — from the
              persisted qualification outcomes and proposal statuses
              (GET /api/leads/pipeline-summary). */}
          <PipelineDistribution />

          {/* Opportunity Summary */}
          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
                <BarChart3 className="h-4 w-4" strokeWidth={2} />
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Opportunity Summary</h3>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Total Tenders</p>
                <p className="tabular mt-1 text-sm font-semibold text-ink">{totalTenders.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">With Winner Identified</p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge tone="success">{enriched.toLocaleString('en-IN')}</StatusBadge>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Without Winner Yet</p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge tone="neutral">{withoutWinner.toLocaleString('en-IN')}</StatusBadge>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Total Tender Value</p>
                <p className={`mt-1 text-sm ${totalValueDisplay === 'Awaiting backend integration.' ? 'text-ink-muted' : 'font-semibold text-ink'}`}>
                  {totalValueDisplay}
                </p>
              </div>
            </div>
          </Card>

          {/* Lead Records — new filterable results table */}
          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
                <ClipboardList className="h-4 w-4" strokeWidth={2} />
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Lead Records</h3>
            </div>

            {/* Status tabs — moved directly above the table/filters they
                actually control (was previously at the top of the page,
                far from Lead Records, reading as a second copy of
                Dashboard's KPI labels rather than a filter for this table).
                Reuses the same lead-status framing as Dashboard's funnel. */}
            <div className="mt-4 flex flex-wrap gap-2 border-b border-hairline pb-4">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  type="button"
                  variant={statusTab === tab.value ? 'primary' : 'secondary'}
                  onClick={() => updateFilter('status')(tab.value)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Selection</span>
                <label className="flex h-10 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    disabled={pageIds.length === 0}
                    className="h-4 w-4 rounded border-hairline-strong text-primary focus:ring-primary/30"
                  />
                  <span className="font-semibold">Select All</span>
                  {selectedIds.size > 0 && (
                    <span className="text-xs font-medium text-ink-muted">({selectedIds.size} selected)</span>
                  )}
                </label>
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Sectors</span>
                <SectorMultiSelect
                  options={categories}
                  selected={selectedSectors}
                  onChange={(next) => setSelectedSectors(next)}
                />
              </div>
              {/* Real lead_signals-backed category (distinct from the Sectors/
                  Tender Category filter above) — PHASE 7 spec §7/§8. */}
              <Select
                label="Lead Category"
                value={leadCategory}
                onChange={(event) => updateFilter('leadCategory')(event.target.value)}
              >
                <option value="All">All Lead Categories</option>
                {leadCategories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
              <Select
                label="AI / Expert"
                value={aiHuman}
                onChange={(event) => updateFilter('aiHuman')(event.target.value)}
              >
                {AI_HUMAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <Select
                label="Date"
                value={dateFilter}
                onChange={(event) => updateFilter('dateRange')(event.target.value)}
              >
                {DATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <SearchBox
                label="Search"
                value={search}
                onChange={updateFilter('search')}
                placeholder="Search by buyer or winning company"
                className="min-w-[26ch] flex-1"
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        disabled={pageIds.length === 0}
                        aria-label="Select all rows on this page"
                        className="h-4 w-4 rounded border-hairline-strong text-primary focus:ring-primary/30"
                      />
                    </th>
                    <th className="px-3 py-3">Lead / Tender</th>
                    <th className="px-3 py-3">Sector</th>
                    <th className="px-3 py-3">Lead Category</th>
                    <th className="px-3 py-3">Winning Company</th>
                    <th className="px-3 py-3 text-right">Tender Value</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">AI / Expert</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isUnsupportedFilters ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-14">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <SearchX className="h-6 w-6 text-ink-muted" strokeWidth={2} />
                          <p className="text-sm font-semibold text-ink">No real records match these filters</p>
                          <p className="max-w-md text-xs text-ink-muted">
                            {unsupportedReasons.join(' and ')} {unsupportedReasons.length === 1 ? 'has' : 'have'} no persisted field
                            in the backend yet, so there is nothing real to show rather than a guessed count.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : leadRecordsQuery.isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-14">
                        <div className="flex flex-col items-center justify-center gap-3 text-ink-muted">
                          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} />
                          <p className="text-sm font-medium">Loading lead records…</p>
                        </div>
                      </td>
                    </tr>
                  ) : leadRecordsQuery.isError ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-14">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
                          <p className="text-sm font-semibold text-danger">Couldn&apos;t load lead records</p>
                          <Button type="button" variant="secondary" onClick={() => leadRecordsQuery.refetch()}>Retry</Button>
                        </div>
                      </td>
                    </tr>
                  ) : leadRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-14">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <Inbox className="h-6 w-6 text-ink-muted" strokeWidth={2} />
                          <p className="text-sm font-semibold text-ink">No lead records found</p>
                          <p className="max-w-sm text-xs text-ink-muted">
                            {hasActiveLeadFilters ? 'Adjust your filters to see more results.' : 'No tenders have been scraped into the database yet.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    leadRecords.map((record) => {
                      const status = tenderStatus(record);
                      const aiHumanState = resolveAiHumanState(record);
                      return (
                        <tr key={record.tender_id} className="border-b border-hairline align-top transition-colors hover:bg-primary-tint/40">
                          <td className="px-3 py-4">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(record.tender_id)}
                              onChange={() => toggleRow(record.tender_id)}
                              aria-label={`Select ${tenderTitleFrom(record)}`}
                              className="h-4 w-4 rounded border-hairline-strong text-primary focus:ring-primary/30"
                            />
                          </td>
                          <td className="max-w-xs px-3 py-4">
                            {/* 2-line clamp instead of single-line truncate —
                                same fix as the Leads page table (TenderLeads.tsx):
                                keeps row height predictable instead of the
                                longest real title dictating the whole table. */}
                            <p className="line-clamp-2 font-semibold text-ink" title={tenderTitleFrom(record)}>
                              {tenderTitleFrom(record)}
                            </p>
                            <p className="mt-1 truncate text-xs text-ink-muted">
                              {record.company_name || record.title || '—'} · {formatDate(record.closing_date)}
                            </p>
                          </td>
                          <td className="px-3 py-4 text-ink-soft">{record.category || 'Uncategorized'}</td>
                          <td className="px-3 py-4 text-ink-soft">{record.lead_signal_category || <span className="text-ink-muted">—</span>}</td>
                          {/* "Not yet identified" instead of a bare dash — same
                              reasoning as the Leads page table: most tenders
                              haven't concluded yet, so a repeated "—" reads as
                              missing/broken data rather than "nothing to show
                              here yet". */}
                          <td className="px-3 py-4 text-ink-soft">
                            {record.winning_company_name || <span className="text-xs italic text-ink-muted">Not yet identified</span>}
                          </td>
                          <td className="tabular px-3 py-4 text-right font-semibold text-ink">{record.amount || '—'}</td>
                          <td className="px-3 py-4">
                            <StatusBadge tone={STATUS_TONE[status.label] ?? 'neutral'}>{status.label}</StatusBadge>
                          </td>
                          <td className="px-3 py-4">
                            {aiHumanState ? (
                              <StatusBadge tone={aiHumanState.tone}>{aiHumanState.label}</StatusBadge>
                            ) : (
                              <span className="text-ink-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-4 text-right">
                            {/* Reuses LeadDetails.tsx's existing ?tenderId= convention
                                (same as TenderLeads.tsx's "View Details" button) rather
                                than a second detail screen — LeadDetails itself links
                                onward to Human Review/Communication once a lead reaches
                                those real stages. */}
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => navigate(`/lead-details?tenderId=${encodeURIComponent(record.tender_id)}`)}
                            >
                              View Details
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!isUnsupportedFilters && (
              <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="tabular text-xs font-semibold text-ink-muted">
                  Page {leadPagination.page} of {leadPagination.total_pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page <= 1 || leadRecordsQuery.isLoading}
                    onClick={() => setPage(Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page >= leadPagination.total_pages || leadRecordsQuery.isLoading}
                    onClick={() => setPage(Math.min(leadPagination.total_pages, page + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default Analytics;
