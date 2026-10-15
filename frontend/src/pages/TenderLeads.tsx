import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, FileText, Inbox, Loader2, MoreVertical, SearchX } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SearchBox from '../components/ui/SearchBox';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import { fetchTenders, fetchTenderCategories, fetchTenderLeadCategories, fetchTenderStates, fetchTenderDistricts } from '../services/tendersApi';
import { useDebounce } from '../hooks/useDebounce';
import { formatDate, tenderTitleFrom, tenderLocation, leadWorkflowStatus, leadPriority } from '../utils/tenderFormatters';

// Real `tenders` table shape, limited to the columns this page reads.
// Additional columns the API returns (buyer contact fields, EMD, etc.) are
// left untyped here since this list view never displays them.
interface Tender {
  tender_id: string;
  title: string | null;
  company_name: string | null;
  description: string | null;
  category: string | null;
  location: string | null;
  tender_city: string | null;
  tender_state: string | null;
  tender_district: string | null;
  lead_category: string | null;
  amount: string | null;
  amount_value: string | null;
  contract_date: string | null;
  closing_date: string | null;
  winning_company_name: string | null;
  winning_bid_amount: string | null;
  // Real columns added by src/db/migrations/addLeadQualificationSchema.js —
  // pipeline_status is the universal RM workflow stage (Identifying/Ready
  // to Qualify/Qualifying/...), lead_status is the qualification outcome
  // (QUALIFIED_GOOD/HITL/BAD) this page relabels as Priority. Distinct from
  // the tender-specific "Winner" outcome, which reads winning_company_name.
  pipeline_status: string | null;
  lead_status: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface TendersResponse {
  tenders: Tender[];
  pagination: Pagination;
  stats: { enriched: number };
}

interface CategoriesResponse {
  categories: string[];
}

interface LeadCategoriesResponse {
  leadCategories: string[];
}

interface StatesResponse {
  states: string[];
}

interface DistrictsResponse {
  districts: string[];
}

const AMOUNT_OPTIONS = [
  { value: 'All', label: 'All Amounts' },
  { value: 'under_1l', label: 'Under ₹1 Lakh' },
  { value: '1l_10l', label: '₹1 Lakh – ₹10 Lakhs' },
  { value: '10l_50l', label: '₹10 Lakhs – ₹50 Lakhs' },
  { value: '50l_1cr', label: '₹50 Lakhs – ₹1 Crore' },
  { value: 'above_1cr', label: 'Above ₹1 Crore' },
] as const;

const DATE_OPTIONS = [
  { value: 'All', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
] as const;

// Universal lead workflow status — the real `tenders.pipeline_status` enum
// (see src/db/migrations/addLeadQualificationSchema.js's PIPELINE_STATUSES),
// the same concept for every lead category, not just tenders. Deliberately
// does NOT include tender-specific outcomes (Winner/Awarded) or values with
// no backing data (Closing Soon/Cancelled/Result Awaited don't exist in the
// schema) — see PIPELINE_STATUS_META in tenderFormatters.js for the shared
// label/tone mapping this list mirrors.
const STATUS_OPTIONS = [
  { value: 'All', label: 'All Statuses' },
  { value: 'IDENTIFYING', label: 'Identifying' },
  { value: 'READY_FOR_QUALIFY', label: 'Ready to Qualify' },
  { value: 'QUALIFYING', label: 'Qualifying' },
  { value: 'READY_FOR_PROPOSAL', label: 'Ready for Proposal' },
  { value: 'AWAITING_PROPOSAL_REVIEW', label: 'Awaiting Proposal Review' },
  { value: 'AWAITING_QUALITY_REVIEW', label: 'Awaiting Quality Review' },
  { value: 'ON_HOLD', label: 'On Hold' },
];

// Priority is the real `tenders.lead_status` qualification outcome
// (QUALIFIED_GOOD/HITL/BAD), relabeled High/Medium/Low — not a separately
// stored priority value. See LEAD_PRIORITY_META in tenderFormatters.js.
const PRIORITY_OPTIONS = [
  { value: 'All', label: 'All Priorities' },
  { value: 'QUALIFIED_GOOD', label: 'High' },
  { value: 'QUALIFIED_HITL', label: 'Medium' },
  { value: 'QUALIFIED_BAD', label: 'Low' },
];

const SORT_OPTIONS = [
  { value: 'created_at-desc', label: 'Newest Scraped', sortBy: 'created_at', order: 'desc' },
  { value: 'contract_date-desc', label: 'Contract Date (Newest)', sortBy: 'contract_date', order: 'desc' },
  { value: 'amount_value-desc', label: 'Tender Value (High → Low)', sortBy: 'amount_value', order: 'desc' },
  { value: 'winning_bid_amount_value-desc', label: 'Winning Bid (High → Low)', sortBy: 'winning_bid_amount_value', order: 'desc' },
  { value: 'title-asc', label: 'Buyer Name (A → Z)', sortBy: 'title', order: 'asc' },
] as const;

const LIMIT = 10;

// Row overflow menu — the table needs ~1,448px for all 10 columns but a
// 1440px viewport (this app's primary target width, per the design brief's
// ~1280px floor) only has ~1,136px to give it after the sidebar and page
// padding, so Priority and Actions (the two rightmost, lowest-priority-to
// -always-show columns — Tender Title/Winning Company/Tender Value/Status
// stay visible per the same brief) collapse into a single kebab menu here
// instead of being silently clipped. The horizontal-scroll container on the
// table itself is untouched — this only removes the *need* to scroll at the
// common 1440px width, it doesn't replace the scroll fallback for narrower
// viewports.
function RowActionsMenu({
  priority,
  onViewDetails,
}: {
  priority: { label: string; tone: StatusTone } | null;
  onViewDetails: () => void;
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

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-9 w-9 place-items-center rounded-lg border border-hairline-strong bg-surface text-ink-soft transition-colors hover:border-primary-tint-2 hover:bg-primary-tint hover:text-primary"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-hairline bg-surface p-2 shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-2 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Priority</span>
            {priority ? (
              <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
            ) : (
              <span className="text-xs italic text-ink-muted">Not yet scored</span>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onViewDetails();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            <FileText className="h-4 w-4 shrink-0" strokeWidth={2} /> View Details
          </button>
        </div>
      )}
    </div>
  );
}

function TenderLeads() {
  const navigate = useNavigate();

  // Every filter/sort/pagination value lives in the URL, not component
  // state — this is what survives unmount when the user opens Lead Details
  // or navigates elsewhere via the Sidebar and comes back (component state
  // resets on remount; the URL doesn't). 'All'/empty values are simply
  // absent from the URL rather than written literally, so a fresh
  // /tender-leads visit still renders identically to before this change,
  // and the URL stays as clean as the spec's own example
  // (/tender-leads?search=Mallcom&category=...&page=2).
  const [searchParams, setSearchParams] = useSearchParams();

  // Purely presentational — whether Tender Category/State/District/Amount/
  // Date Range/Sort By show inline or stay behind "More filters". Search,
  // Status, Priority, and Lead Category are the primary row (per usage
  // frequency) and always visible; unlike the Dashboard's 5-filter row
  // (which already fit on one line), this page genuinely has 9 filters, so
  // collapsing the other 5 measurably reduces the panel from 3 rows to 1.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const search = searchParams.get('search') ?? '';
  const leadCategory = searchParams.get('leadCategory') ?? 'All';
  const category = searchParams.get('category') ?? 'All';
  const state = searchParams.get('state') ?? 'All';
  const district = searchParams.get('district') ?? 'All';
  const status = searchParams.get('status') ?? 'All';
  const priority = searchParams.get('priority') ?? 'All';
  const amountRange = (searchParams.get('amountRange') ?? 'All') as (typeof AMOUNT_OPTIONS)[number]['value'];
  const dateRangeValue = (searchParams.get('dateRange') ?? 'All') as (typeof DATE_OPTIONS)[number]['value'];
  const customDateFrom = searchParams.get('dateFrom') ?? '';
  const customDateTo = searchParams.get('dateTo') ?? '';
  const sortValue = (searchParams.get('sort') ?? 'created_at-desc') as (typeof SORT_OPTIONS)[number]['value'];
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const debouncedSearch = useDebounce(search, 300);
  const sortOption = SORT_OPTIONS.find((option) => option.value === sortValue) ?? SORT_OPTIONS[0];

  // Writes one or more filter values into the URL. Uses `replace` (not
  // `push`) so adjusting filters doesn't flood browser history with one
  // entry per keystroke/click — Back from here goes to wherever the user
  // came from (e.g. Dashboard), matching this page's pre-existing
  // useState-based behavior, which never touched history either. Any value
  // that's 'All'/empty is deleted rather than written, and changing a
  // filter always resets pagination back to page 1 (the previous page
  // number may no longer exist under the new filter combination).
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

  // Selecting a State clears any District chosen under a previous State,
  // since the districts query below is scoped to the new state and the old
  // pick likely no longer belongs to it.
  function handleStateChange(value: string) {
    updateParams({ state: value, district: undefined });
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
    queryKey: ['tender-categories'],
    queryFn: () => fetchTenderCategories() as Promise<CategoriesResponse>,
    staleTime: 5 * 60_000,
  });
  const categories = categoriesQuery.data?.categories ?? [];

  // Distinct from Tender Category (the scraped `category` column) — this is
  // backed by real lead_signals evidence (TENDER/GOVERNMENT_TENDER_WIN
  // signals keyed to the tender's own tender_id; see
  // tenderRepository.js's LEAD_CATEGORY_SIGNAL_TYPES for why the other
  // signal types aren't offered here yet). Options come entirely from the
  // backend — nothing hardcoded — so this list only ever shows categories
  // the backend can actually filter on.
  const leadCategoriesQuery = useQuery({
    queryKey: ['tender-lead-categories'],
    queryFn: () => fetchTenderLeadCategories() as Promise<LeadCategoriesResponse>,
    staleTime: 5 * 60_000,
  });
  const leadCategories = leadCategoriesQuery.data?.leadCategories ?? [];

  const statesQuery = useQuery({
    queryKey: ['tender-states'],
    queryFn: () => fetchTenderStates() as Promise<StatesResponse>,
    staleTime: 5 * 60_000,
  });
  const states = statesQuery.data?.states ?? [];

  // Districts belong ONLY to the selected state — no state means there is
  // nothing to scope the list to, so the query doesn't run at all (rather
  // than fetching every district nationwide) and the dropdown stays
  // disabled below until a state is chosen.
  const districtsQuery = useQuery({
    queryKey: ['tender-districts', state],
    queryFn: () => fetchTenderDistricts(state) as Promise<DistrictsResponse>,
    staleTime: 5 * 60_000,
    enabled: state !== 'All',
  });
  const districts = state !== 'All' ? districtsQuery.data?.districts ?? [] : [];

  const tendersQuery = useQuery({
    queryKey: [
      'tenders',
      debouncedSearch,
      leadCategory,
      category,
      state,
      district,
      status,
      priority,
      amountRange,
      dateRangeValue,
      dateRangeValue === 'custom' ? customDateFrom : undefined,
      dateRangeValue === 'custom' ? customDateTo : undefined,
      sortOption.sortBy,
      sortOption.order,
      page,
    ],
    queryFn: () =>
      fetchTenders({
        search: debouncedSearch,
        lead_category: leadCategory !== 'All' ? leadCategory : undefined,
        category: category !== 'All' ? category : undefined,
        state: state !== 'All' ? state : undefined,
        district: district !== 'All' ? district : undefined,
        pipeline_status: status !== 'All' ? status : undefined,
        lead_status: priority !== 'All' ? priority : undefined,
        amount_range: amountRange !== 'All' ? amountRange : undefined,
        date_range: dateRangeValue !== 'All' ? dateRangeValue : undefined,
        date_from: dateRangeValue === 'custom' && customDateFrom ? customDateFrom : undefined,
        date_to: dateRangeValue === 'custom' && customDateTo ? customDateTo : undefined,
        sort_by: sortOption.sortBy,
        order: sortOption.order,
        page,
        limit: LIMIT,
      }) as Promise<TendersResponse>,
    placeholderData: keepPreviousData,
  });

  const tenders = tendersQuery.data?.tenders ?? [];
  const pagination = tendersQuery.data?.pagination ?? { page: 1, limit: LIMIT, total: 0, total_pages: 1 };
  const stats = tendersQuery.data?.stats ?? { enriched: 0 };
  const hasActiveFilters =
    Boolean(search) ||
    leadCategory !== 'All' ||
    category !== 'All' ||
    state !== 'All' ||
    district !== 'All' ||
    status !== 'All' ||
    priority !== 'All' ||
    amountRange !== 'All' ||
    dateRangeValue !== 'All';

  // Any filter collapsed behind "More filters" (Tender Category, State,
  // District, Amount, Date Range, Sort By isn't included since "Newest
  // Scraped" is its own default, not a filter someone would expect surfaced)
  // that's already set — e.g. from a shared/bookmarked URL — auto-opens the
  // panel so an active filter is never hidden from view on load.
  const hasActiveSecondaryFilters = category !== 'All' || state !== 'All' || district !== 'All' || amountRange !== 'All' || dateRangeValue !== 'All';
  useEffect(() => {
    if (hasActiveSecondaryFilters) setMoreFiltersOpen(true);
    // Only checked once on mount — a user who explicitly collapses the
    // panel after that shouldn't have it forced back open by a filter they
    // themselves just set through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">Leads</h2>
        <p className="mt-1 text-sm text-ink-soft">Browse government tenders and identify the companies that won them.</p>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4">
          {/* Primary row — Search, Status, Priority, Lead Category, the
              filters used most often — always visible. Tender Category,
              State, District, Amount, Date Range, and Sort By (5-6 filters,
              genuinely too many for one row unlike the Dashboard's 5) sit
              behind "More filters", auto-opened if one of them is already
              set from the URL so an active filter is never hidden. */}
          <div className="flex flex-wrap items-end gap-4">
            <SearchBox
              label="Search"
              value={search}
              onChange={updateFilter('search')}
              placeholder="Search by buyer or winning company"
              className="min-w-[26ch] flex-1"
            />
            <Select label="Status" value={status} onChange={(event) => updateFilter('status')(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <Select label="Priority" value={priority} onChange={(event) => updateFilter('priority')(event.target.value)}>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            {/* Real signal-backed classification (TENDER/GOVERNMENT_TENDER_WIN
                lead_signals keyed to this tender) — distinct from "Tender
                Category" below, which is the scraped `category` column. */}
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

            <button
              type="button"
              onClick={() => setMoreFiltersOpen((value) => !value)}
              className="mb-0.5 ml-auto flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary-tint"
            >
              {moreFiltersOpen ? 'Fewer filters' : 'More filters'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreFiltersOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>
          </div>

          {moreFiltersOpen && (
            <div className="flex flex-wrap items-end gap-4 border-t border-hairline pt-4">
              <Select
                label="Category"
                value={category}
                onChange={(event) => updateFilter('category')(event.target.value)}
              >
                <option value="All">All Categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
              <Select label="State" value={state} onChange={(event) => handleStateChange(event.target.value)}>
                <option value="All">All States</option>
                {states.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
              <Select
                label="District"
                value={district}
                onChange={(event) => updateFilter('district')(event.target.value)}
                disabled={state === 'All'}
              >
                {state === 'All' ? (
                  <option value="All">Select a state first</option>
                ) : (
                  <>
                    <option value="All">All Districts</option>
                    {districts.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </>
                )}
              </Select>
              <Select
                label="Amount"
                value={amountRange}
                onChange={(event) => updateFilter('amountRange')(event.target.value)}
              >
                {AMOUNT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <Select
                label="Date Range"
                value={dateRangeValue}
                onChange={(event) => updateFilter('dateRange')(event.target.value)}
              >
                {DATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <Select
                label="Sort By"
                value={sortValue}
                onChange={(event) => updateFilter('sort')(event.target.value)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              {dateRangeValue === 'custom' && (
                <>
                  <Input
                    type="date"
                    label="From"
                    aria-label="Custom range start date"
                    value={customDateFrom}
                    onChange={(event) => updateFilter('dateFrom')(event.target.value)}
                    className="w-auto"
                  />
                  <Input
                    type="date"
                    label="To"
                    aria-label="Custom range end date"
                    value={customDateTo}
                    onChange={(event) => updateFilter('dateTo')(event.target.value)}
                    className="w-auto"
                  />
                </>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {/* Compact stat bar — not full hero-metric treatment (this is a
            list page, not the Dashboard), but enough numeric weight that
            the result count reads as the page's anchor rather than a plain
            caption easily lost under the filter panel above it. */}
        <div className="flex items-center gap-6 border-b border-hairline bg-surface-muted px-5 py-3">
          {tendersQuery.isSuccess ? (
            <>
              <div>
                <p className="tabular text-lg font-bold leading-none text-ink">{pagination.total.toLocaleString('en-IN')}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Tender{pagination.total === 1 ? '' : 's'}
                </p>
              </div>
              <div className="h-8 w-px bg-hairline-strong" />
              <div>
                <p className="tabular text-lg font-bold leading-none text-ink">{stats.enriched.toLocaleString('en-IN')}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Winning Bidder Identified</p>
              </div>
            </>
          ) : (
            <p className="text-xs font-semibold text-ink-soft"> </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Tender Title</th>
                <th className="px-5 py-3">Winning Company</th>
                <th className="px-5 py-3 text-right">Winning Bid</th>
                <th className="px-5 py-3 text-right">Tender Value</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Closing Date</th>
                <th className="px-5 py-3">Status</th>
                {/* Priority + View Details/AI Analysis live in the row's
                    overflow menu (see RowActionsMenu) — freed to keep every
                    column above fully visible at the app's 1440px primary
                    width instead of requiring horizontal scroll to reach
                    them; the scroll container still covers narrower widths. */}
                <th className="w-12 px-5 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tendersQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-ink-muted">
                      <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} />
                      <p className="text-sm font-medium">Loading tenders…</p>
                    </div>
                  </td>
                </tr>
              ) : tendersQuery.isError ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
                      <p className="text-sm font-semibold text-danger">Couldn&apos;t load tenders</p>
                      <p className="max-w-sm text-xs text-ink-muted">
                        {tendersQuery.error instanceof Error ? tendersQuery.error.message : 'An unexpected error occurred.'}
                      </p>
                      <Button type="button" variant="secondary" onClick={() => tendersQuery.refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : tenders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      {hasActiveFilters ? (
                        <SearchX className="h-6 w-6 text-ink-muted" strokeWidth={2} />
                      ) : (
                        <Inbox className="h-6 w-6 text-ink-muted" strokeWidth={2} />
                      )}
                      <p className="text-sm font-semibold text-ink">No tenders found</p>
                      <p className="max-w-sm text-xs text-ink-muted">
                        {hasActiveFilters
                          ? 'Adjust your search or filters to see more results.'
                          : 'No tenders have been scraped into the database yet.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                tenders.map((tender, index) => {
                  const workflowStatus = leadWorkflowStatus(tender);
                  const priorityInfo = leadPriority(tender);
                  const rowNumber = (pagination.page - 1) * pagination.limit + index + 1;
                  return (
                    <tr
                      key={tender.tender_id}
                      onClick={() => navigate(`/lead-details?tenderId=${encodeURIComponent(tender.tender_id)}`)}
                      className="cursor-pointer border-b border-hairline align-top transition-colors hover:bg-primary-tint/40"
                    >
                      <td className="tabular px-5 py-4 text-ink-muted">{rowNumber}</td>
                      <td className="max-w-[19rem] px-5 py-4">
                        {/* 2-line clamp + title tooltip — same pattern used
                            for this cell's earlier width fix — keeps every
                            row a predictable height instead of the longest
                            real title (routinely 4+ lines) dictating the
                            whole table's row heights. */}
                        <p
                          className="line-clamp-2 font-semibold text-ink"
                          title={tenderTitleFrom(tender)}
                        >
                          {tenderTitleFrom(tender)}
                        </p>
                        <p className="mt-1 truncate text-xs text-ink-muted">
                          {tender.company_name || tender.title || '—'} · {tender.category || 'Uncategorized'} · {tender.lead_category || 'Not classified'}
                        </p>
                      </td>
                      {/* "Not yet identified" instead of a bare dash — most
                          tenders (1,797 of 1,901 in production) haven't
                          concluded yet, so a repeated "—" down the column
                          reads as missing/broken data rather than the honest
                          "nothing to show here yet" it actually is. */}
                      <td className="px-5 py-4 text-ink-soft">
                        {tender.winning_company_name || <span className="text-xs italic text-ink-muted">Not yet identified</span>}
                      </td>
                      <td className="tabular px-5 py-4 text-right font-medium text-ink-soft">
                        {tender.winning_bid_amount || <span className="text-xs italic text-ink-muted">Not yet identified</span>}
                      </td>
                      <td className="tabular px-5 py-4 text-right font-semibold text-ink">{tender.amount || '—'}</td>
                      <td className="px-5 py-4 text-ink-soft">{tenderLocation(tender)}</td>
                      <td className="tabular px-5 py-4 text-ink-soft">{formatDate(tender.closing_date)}</td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={workflowStatus.tone}>{workflowStatus.label}</StatusBadge>
                      </td>
                      {/* Stops the click from bubbling to the row's own
                          navigate handler — this menu has its own actions
                          (Priority display, View Details) that shouldn't
                          double-navigate or get swallowed by the row click. */}
                      <td className="px-5 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                        <RowActionsMenu
                          priority={priorityInfo}
                          onViewDetails={() => navigate(`/lead-details?tenderId=${encodeURIComponent(tender.tender_id)}`)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="tabular text-xs font-semibold text-ink-muted">
            Page {pagination.page} of {pagination.total_pages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1 || tendersQuery.isLoading}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= pagination.total_pages || tendersQuery.isLoading}
              onClick={() => setPage(Math.min(pagination.total_pages, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default TenderLeads;