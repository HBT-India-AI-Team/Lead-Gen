import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSignature,
  FileText,
  HeartPulse,
  Inbox,
  ListChecks,
  Mail,
  RefreshCw,
  Server,
  Monitor,
  Radar,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import AiBriefCard from '../components/dashboard/AiBriefCard';
import { fetchTenders, fetchTenderStates, fetchTenderDistricts, fetchTenderLeadCategories } from '../services/tendersApi';
import { fetchPipelineSummary, fetchLeadSignalCategories, fetchLeadSignals } from '../services/leadsApi';
import { BACKEND_URL } from '../constants/dashboard';
import { formatDate, formatInrCompact, tenderTitleFrom, leadWorkflowStatus } from '../utils/tenderFormatters';

// Real PHASE 5 GET /api/leads/pipeline-summary response shape (see
// src/services/pipelineSummaryService.js) — every number here is a real
// MySQL aggregate; a category with zero real rows is 0, never omitted.
interface PipelineSummary {
  totalLeads: number;
  awaitingProposalReview: number;
  // PHASE 6 — real counts behind the four legacy Overview Cards below (see
  // src/services/pipelineSummaryService.js's getPipelineSummary() header
  // for exactly which real MySQL state each one reads).
  awaitingHealthCheck: number;
  awaitingProposal: number;
  proposalSent: number;
  reviewWaitingList: number;
  qualification: { good: number; hitl: number; bad: number; unqualified: number; totalQualified: number };
  proposal: { generated: number; readyForReview: number; approved: number; changesRequested: number; rejected: number; onHold: number; sent: number };
  communication: { notPrepared: number; draftReady: number; awaitingSendApproval: number; onHold: number; rejected: number; prepared: number };
}

// Exact backend enum values (PHASE 1/2/4) as display labels — per PHASE 5
// spec §9, never a similar-but-different frontend label.
const QUALIFICATION_TONE: Record<string, StatusTone> = { QUALIFIED_GOOD: 'success', QUALIFIED_HITL: 'warning', QUALIFIED_BAD: 'danger' };
const PROPOSAL_TONE: Record<string, StatusTone> = {
  'Ready For Review': 'info',
  Approved: 'success',
  'Changes Requested': 'warning',
  Rejected: 'danger',
  'On Hold': 'neutral',
};
const COMMUNICATION_TONE: Record<string, StatusTone> = {
  DRAFT_READY: 'info',
  AWAITING_SEND_APPROVAL: 'success',
  ON_HOLD: 'neutral',
  REJECTED: 'danger',
};

function DistributionRow({ label, value, tone }: { label: string; value: number; tone: StatusTone }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline py-2.5 last:border-0">
      <StatusBadge tone={tone}>{label}</StatusBadge>
      <span className="tabular text-sm font-bold text-ink">{value.toLocaleString('en-IN')}</span>
    </div>
  );
}

function FunnelStage({ label, value, isLast, isCurrent }: { label: string; value: number; isLast: boolean; isCurrent?: boolean }) {
  return (
    <div className="flex flex-1 items-center gap-2">
      {/* Ledger accent reserved for the funnel's current/leading stage only
          (the furthest-right non-zero value a lead has actually reached) —
          not blanket-applied to every stage box, so it still means something
          when it appears. */}
      <div
        className={`min-w-[132px] flex-1 rounded-xl border p-3 text-center ${
          isCurrent ? 'ledger border-hairline bg-primary-tint pl-4' : 'border-hairline bg-surface-muted'
        }`}
      >
        <p className={`tabular text-2xl font-bold ${isCurrent ? 'text-primary' : 'text-ink-soft'}`}>{value.toLocaleString('en-IN')}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      </div>
      {!isLast && <ArrowRight className="h-4 w-4 shrink-0 text-hairline-strong" strokeWidth={2} />}
    </div>
  );
}

// Quick-action cards are genuinely clickable (the whole card navigates, not
// just a button inside it) — bordered in brand blue with a light tint wash
// so they read as actionable surfaces distinct from the passive stat cards
// and the list-style pipeline panels next to them.
function ActionCard({
  icon: Icon,
  label,
  value,
  emptyHint,
  actionLabel,
  to,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: number;
  emptyHint: string;
  actionLabel: string;
  to: string;
}) {
  return (
    <Link to={to} className="block no-underline">
      <Card className="h-full border-primary-tint-2 bg-primary-tint/40 p-4 hover:border-primary hover:bg-primary-tint">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-primary shadow-sm">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
            <p className="tabular mt-1 text-2xl font-bold text-ink">{value.toLocaleString('en-IN')}</p>
            {value === 0 && <p className="mt-1 text-xs text-ink-muted">{emptyHint}</p>}
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-primary">
          {actionLabel} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </p>
      </Card>
    </Link>
  );
}

// Real `tenders` row shape, limited to what Recent Tender Activity reads.
interface Tender {
  tender_id: string;
  title: string | null;
  company_name: string | null;
  description: string | null;
  amount: string | null;
  closing_date: string | null;
  winning_company_name: string | null;
  created_at: string | null;
  // Real columns added by src/db/migrations/addLeadQualificationSchema.js —
  // see TenderLeads.tsx for the same Status/Priority concepts this page's
  // filter bar and Recent Tender Activity table now share.
  pipeline_status: string | null;
  lead_status: string | null;
}

interface TendersResponse {
  tenders: Tender[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  stats: { enriched: number; totalValue: number | null };
}

interface StatesResponse {
  states: string[];
}

interface DistrictsResponse {
  districts: string[];
}

// Real GET /api/tenders/lead-categories response shape — the SAME
// tenders-oriented Lead Category filter as the Leads/Analytics pages (not
// the Lead Signals section's /api/leads/signal-categories below, which
// filters lead_signals rows, not tenders).
interface LeadCategoriesResponse {
  leadCategories: string[];
}

// Real GET /api/leads/signal-categories / /api/leads/signals response
// shapes (see src/services/leadSignalService.js) — every value here is a
// real lead_signals.signal_type or a real row from that table, never a
// fixed/hardcoded list.
interface SignalCategory {
  value: string;
  label: string;
  count: number;
}
interface SignalCategoriesResponse {
  categories: SignalCategory[];
}
interface LeadSignal {
  id: number;
  company_name: string | null;
  company_cin: string | null;
  signal_type: string;
  source: string | null;
  signal_date: string | null;
  title: string | null;
  description: string | null;
  value: string | null;
  location: string | null;
}
interface SignalsResponse {
  signals: LeadSignal[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

// Same universal Status/Priority option lists as the Leads page
// (TenderLeads.tsx) — see PIPELINE_STATUS_META/LEAD_PRIORITY_META in
// tenderFormatters.js for why these are the only real, DB-backed values.
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

const PRIORITY_OPTIONS = [
  { value: 'All', label: 'All Priorities' },
  { value: 'QUALIFIED_GOOD', label: 'High' },
  { value: 'QUALIFIED_HITL', label: 'Medium' },
  { value: 'QUALIFIED_BAD', label: 'Low' },
];

const AWAITING_INTEGRATION = 'Awaiting backend integration.';

// PHASE 6 — the four legacy Overview Cards are now wired to real, live
// data (GET /api/leads/pipeline-summary), so a fetch failure is a genuine
// runtime error, not "not yet integrated". Matches SystemStatusCard's own
// "Status unavailable." wording elsewhere on this page rather than
// reusing AWAITING_INTEGRATION, which would misleadingly imply the
// backend was never wired up at all.
const PIPELINE_UNAVAILABLE = 'Unavailable';

// Same control styling as the Leads page's filter dropdowns (TenderLeads.tsx).
const selectClass =
  'h-10 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10';

// Narrower, fixed-width variant for the compressed inline filter row at the
// top of the page — same visual treatment as selectClass, just sized to sit
// several-in-a-row instead of stacked full-width in a boxed card.
const compactSelectClass =
  'h-9 w-44 rounded-lg border border-hairline-strong bg-surface px-2.5 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10';

// Fallback only for when the API has no tenders yet to read a created_at
// from at all (recentQuery.isError or an empty table) — normal operation
// always shows the real latest tender's created_at above.
const DEMO_LATEST_SYNC = '05 Aug 2026';

// Base stat card — no ledger accent by default now (see Card's `accent`
// prop): the accent is reserved for genuinely hero/active surfaces, not
// applied blanket to every box on the page. Pass `accent` explicitly on the
// few cards that should still carry it.
function OverviewCard({
  label,
  value,
  loading,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <Card accent={accent} className={accent ? 'p-5' : 'p-4'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      {loading ? (
        <div className="mt-2 h-6 w-20 animate-pulse rounded bg-surface-sunken" />
      ) : (
        <p className={`tabular mt-1.5 font-bold text-ink ${accent ? 'text-2xl' : 'text-lg'}`}>{value}</p>
      )}
    </Card>
  );
}

// Hero metric — the two outcome numbers that matter most at a glance (Total
// Tender Value, Winning Companies Identified). Rendered at display scale in
// its own top section, not inside the same-size grid as the pipeline-count
// cards below it, so it reads as the headline rather than one tile among
// many. Always carries the ledger accent (it's the one place on this page
// where "this is what matters" should be unambiguous).
function HeroMetric({ label, value, loading, icon: Icon }: { label: string; value: ReactNode; loading: boolean; icon: typeof Server }) {
  return (
    // min-w (not w-full/flex-1) so the card sizes to its content instead of
    // stretching to fill whatever share of the row a grid/flex container
    // hands it — that stretching was the actual cause of the empty space to
    // the right of the number, not the hero treatment itself.
    <Card accent className="min-w-[260px] p-6">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon className="h-4 w-4" strokeWidth={2} />
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      {loading ? (
        <div className="mt-3 h-10 w-40 animate-pulse rounded bg-surface-sunken" />
      ) : (
        <p className="tabular mt-2 text-4xl font-bold tracking-tight text-ink">{value}</p>
      )}
    </Card>
  );
}

function SystemStatusCard({
  icon: Icon,
  label,
  tone,
  text,
}: {
  icon: typeof Server;
  label: string;
  tone: StatusTone;
  text: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        <StatusBadge tone={tone} className="mt-1">{text}</StatusBadge>
      </div>
    </Card>
  );
}

function Dashboard() {
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  // State/District filters live in the URL (same pattern as TenderLeads.tsx)
  // so navigating away via the Sidebar and back restores whatever the user
  // had selected instead of resetting to "All" on remount.
  const [searchParams, setSearchParams] = useSearchParams();
  const state = searchParams.get('state') ?? 'All';
  const district = searchParams.get('district') ?? 'All';
  // Distinct from the Lead Signals section's own `leadCategory` state below
  // (which filters lead_signals rows via /api/leads/signal-categories) —
  // this scopes Recent Tender Activity/Overview Cards to real `tenders`
  // rows via /api/tenders/lead-categories, same endpoint and filter shape
  // as the Leads/Analytics pages' Lead Category dropdown.
  const tenderLeadCategory = searchParams.get('leadCategory') ?? 'All';
  const status = searchParams.get('status') ?? 'All';
  const priority = searchParams.get('priority') ?? 'All';

  function handleStatusChange(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'All') next.delete('status');
        else next.set('status', value);
        return next;
      },
      { replace: true }
    );
  }

  function handlePriorityChange(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'All') next.delete('priority');
        else next.set('priority', value);
        return next;
      },
      { replace: true }
    );
  }

  // Selecting a State clears any District chosen under the previous State —
  // same rule as the Leads page (TenderLeads.tsx), since the districts query
  // below is scoped to the new state and the old pick may not belong to it.
  function handleStateChange(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'All') next.delete('state');
        else next.set('state', value);
        next.delete('district');
        return next;
      },
      { replace: true }
    );
  }

  function handleDistrictChange(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'All') next.delete('district');
        else next.set('district', value);
        return next;
      },
      { replace: true }
    );
  }

  function handleTenderLeadCategoryChange(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'All') next.delete('leadCategory');
        else next.set('leadCategory', value);
        return next;
      },
      { replace: true }
    );
  }

  // Same real, MySQL-backed distinct-value endpoints the Leads page uses for
  // its State/District dropdowns (GET /api/tenders/states, /api/tenders/districts)
  // — reused as-is rather than a second copy of state/district data.
  const statesQuery = useQuery({
    queryKey: ['tender-states'],
    queryFn: () => fetchTenderStates() as Promise<StatesResponse>,
    staleTime: 5 * 60_000,
  });
  const states = statesQuery.data?.states ?? [];

  const districtsQuery = useQuery({
    queryKey: ['tender-districts', state],
    queryFn: () => fetchTenderDistricts(state) as Promise<DistrictsResponse>,
    staleTime: 5 * 60_000,
    enabled: state !== 'All',
  });
  const districts = state !== 'All' ? districtsQuery.data?.districts ?? [] : [];

  // Same real GET /api/tenders/lead-categories endpoint (and
  // fetchTenderLeadCategories()) the Leads/Analytics pages already use —
  // reused as-is, not a second/hardcoded category list.
  const tenderLeadCategoriesQuery = useQuery({
    queryKey: ['tender-lead-categories'],
    queryFn: () => fetchTenderLeadCategories() as Promise<LeadCategoriesResponse>,
    staleTime: 5 * 60_000,
  });
  const tenderLeadCategories = tenderLeadCategoriesQuery.data?.leadCategories ?? [];

  // Backs both the Overview Cards (total/enriched counts + latest sync
  // timestamp) and Recent Tender Activity — one real query against the
  // existing GET /api/tenders endpoint, sorted newest-first. State/District/
  // Lead Category are passed through as real backend query params (same as
  // the Leads page), so every card below reflects actual filtered MySQL
  // results — never a client-side filter over an unfiltered fetch.
  const recentQuery = useQuery({
    queryKey: ['dashboard-recent-tenders', state, district, tenderLeadCategory, status, priority],
    queryFn: () =>
      fetchTenders({
        state: state !== 'All' ? state : undefined,
        district: district !== 'All' ? district : undefined,
        lead_category: tenderLeadCategory !== 'All' ? tenderLeadCategory : undefined,
        pipeline_status: status !== 'All' ? status : undefined,
        lead_status: priority !== 'All' ? priority : undefined,
        sort_by: 'created_at',
        order: 'desc',
        limit: 5,
        page: 1,
      }) as Promise<TendersResponse>,
  });

  // No dedicated health-check endpoint exists yet for the database or the
  // TenderBook scraper — this only checks the one real unauthenticated
  // signal that does exist (the API's own root route).
  const apiHealthQuery = useQuery({
    queryKey: ['dashboard-api-health'],
    queryFn: async () => {
      const response = await fetch(`${BACKEND_URL}/`);
      if (!response.ok) throw new Error('API unreachable');
      return response.json() as Promise<{ status: string }>;
    },
    retry: 0,
  });

  // PHASE 5 — real qualification/proposal/communication aggregate counts
  // (GET /api/leads/pipeline-summary, the one new backend endpoint this
  // phase adds — see src/services/pipelineSummaryService.js). Independent
  // of the State/District filters above: the pipeline funnel reflects the
  // whole real dataset, matching what Human Review/Communication actually
  // operate on, not a filtered subset.
  const pipelineSummaryQuery = useQuery({
    queryKey: ['dashboard-pipeline-summary'],
    queryFn: () => fetchPipelineSummary() as Promise<PipelineSummary>,
  });
  const pipeline = pipelineSummaryQuery.data;

  // Lead Category filter — real lead_signals.signal_type values, NOT the
  // qualification statuses (QUALIFIED_GOOD/HITL/BAD). Options come entirely
  // from the backend (GET /api/leads/signal-categories), so this dropdown
  // only ever offers a category that genuinely has at least one real row.
  const [leadCategory, setLeadCategory] = useState('All');
  const [signalsPage, setSignalsPage] = useState(1);

  function handleLeadCategoryChange(value: string) {
    setLeadCategory(value);
    setSignalsPage(1);
  }

  const signalCategoriesQuery = useQuery({
    queryKey: ['dashboard-signal-categories'],
    queryFn: () => fetchLeadSignalCategories() as Promise<SignalCategoriesResponse>,
    staleTime: 60_000,
  });
  const signalCategories = signalCategoriesQuery.data?.categories ?? [];

  const signalsQuery = useQuery({
    queryKey: ['dashboard-signals', leadCategory, signalsPage],
    queryFn: () =>
      fetchLeadSignals({
        signal_type: leadCategory !== 'All' ? leadCategory : undefined,
        page: signalsPage,
        limit: 5,
      }) as Promise<SignalsResponse>,
  });
  const signals = signalsQuery.data?.signals ?? [];
  const signalsPagination = signalsQuery.data?.pagination;

  const tenders = recentQuery.data?.tenders ?? [];
  const pagination = recentQuery.data?.pagination;
  const stats = recentQuery.data?.stats;
  const latestSync = tenders[0]?.created_at;

  function handleRefresh() {
    recentQuery.refetch();
    apiHealthQuery.refetch();
    pipelineSummaryQuery.refetch();
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">Dashboard</h2>
          <p className="mt-1 text-sm text-ink-soft">Enterprise overview of Fintech Lead Intelligence.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-ink-muted">{today}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={handleRefresh}
            disabled={recentQuery.isFetching || apiHealthQuery.isFetching || pipelineSummaryQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                recentQuery.isFetching || apiHealthQuery.isFetching || pipelineSummaryQuery.isFetching ? 'animate-spin' : ''
              }`}
              strokeWidth={2}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* State/District/Lead Category/Status/Priority filters — scope every
          card and Recent Tender Activity below to real, backend-filtered
          MySQL results. Same State -> District dependency and data sources
          as the Leads page; Lead Category reuses /api/tenders/lead-categories,
          the same tenders-oriented filter the Leads/Analytics pages use
          (distinct from the Lead Signals section's own signal_type filter
          below). Status/Priority use the exact same universal
          pipeline_status/lead_status terminology as the Leads page (see
          TenderLeads.tsx) rather than a second, page-specific vocabulary.
          All 5 filters render inline in a single row — they fit at every
          supported width, so there's nothing to collapse behind a toggle. */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 shadow-card">
        <div>
          <label htmlFor="dashboard-state-filter" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            State
          </label>
          <select
            id="dashboard-state-filter"
            className={compactSelectClass}
            value={state}
            onChange={(event) => handleStateChange(event.target.value)}
          >
            <option value="All">All States</option>
            {states.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dashboard-district-filter" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            District
          </label>
          <select
            id="dashboard-district-filter"
            className={`${compactSelectClass} ${state === 'All' ? 'cursor-not-allowed opacity-60' : ''}`}
            value={district}
            onChange={(event) => handleDistrictChange(event.target.value)}
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
          </select>
        </div>
        <div>
          <label htmlFor="dashboard-tender-lead-category-filter" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Lead Category
          </label>
          <select
            id="dashboard-tender-lead-category-filter"
            className={compactSelectClass}
            value={tenderLeadCategory}
            onChange={(event) => handleTenderLeadCategoryChange(event.target.value)}
          >
            <option value="All">All Lead Categories</option>
            {tenderLeadCategories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dashboard-status-filter" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Status
          </label>
          <select
            id="dashboard-status-filter"
            className={compactSelectClass}
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dashboard-priority-filter" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Priority
          </label>
          <select
            id="dashboard-priority-filter"
            className={compactSelectClass}
            value={priority}
            onChange={(event) => handlePriorityChange(event.target.value)}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Section 1 — Hero metrics. The two outcome numbers that matter most
          at a glance sit in their own top section, well above the fold, at
          display scale — not inside the same-size grid as pipeline-count
          tiles like "Proposal Sent: 0" below. flex-wrap (not a 2-col grid)
          so each card sizes to its own content instead of stretching to
          fill an even 50% column — a 50/50 grid was leaving a wide strip of
          empty space to the right of the number on anything wider than a
          phone. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        <HeroMetric
          icon={FileSignature}
          label="Total Tender Value"
          loading={recentQuery.isLoading}
          value={recentQuery.isError || stats?.totalValue == null ? AWAITING_INTEGRATION : formatInrCompact(stats.totalValue)}
        />
        <HeroMetric
          icon={CheckCircle2}
          label="Winning Companies Identified"
          loading={recentQuery.isLoading}
          value={recentQuery.isError || stats === undefined ? AWAITING_INTEGRATION : stats.enriched.toLocaleString('en-IN')}
        />
      </div>

      {/* Secondary stat row — demoted tier: smaller type, no ledger accent,
          tighter cards, clearly subordinate to the hero metrics above. Same
          five real pipeline counts as before, just no longer competing with
          the outcome metrics for attention. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <OverviewCard
          label="Total Tenders Identified"
          loading={recentQuery.isLoading}
          value={recentQuery.isError || pagination === undefined ? AWAITING_INTEGRATION : pagination.total.toLocaleString('en-IN')}
        />
        <OverviewCard
          label="Awaiting Health Check"
          loading={pipelineSummaryQuery.isLoading}
          value={pipelineSummaryQuery.isError ? PIPELINE_UNAVAILABLE : (pipeline?.awaitingHealthCheck ?? 0).toLocaleString('en-IN')}
        />
        <OverviewCard
          label="Awaiting Proposal"
          loading={pipelineSummaryQuery.isLoading}
          value={pipelineSummaryQuery.isError ? PIPELINE_UNAVAILABLE : (pipeline?.awaitingProposal ?? 0).toLocaleString('en-IN')}
        />
        <OverviewCard
          label="Proposal Sent"
          loading={pipelineSummaryQuery.isLoading}
          value={pipelineSummaryQuery.isError ? PIPELINE_UNAVAILABLE : (pipeline?.proposalSent ?? 0).toLocaleString('en-IN')}
        />
        <OverviewCard
          label="Review Waiting List"
          loading={pipelineSummaryQuery.isLoading}
          value={pipelineSummaryQuery.isError ? PIPELINE_UNAVAILABLE : (pipeline?.reviewWaitingList ?? 0).toLocaleString('en-IN')}
        />
      </div>

      {/* Latest Sync — small meta indicator, not a full KPI card */}
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="uppercase tracking-wide">Latest Sync</span>
        <span className="text-ink-soft">
          {recentQuery.isLoading
            ? '…'
            : recentQuery.isError || !latestSync
              ? DEMO_LATEST_SYNC
              : formatDate(latestSync.slice(0, 10))}
        </span>
      </div>

      {/* Section 2 — Pipeline Status: real qualification/proposal/communication
          state from GET /api/leads/pipeline-summary. A distinct visual zone
          from the hero/secondary stat tiers above (hairline top rule +
          generous top spacing) so the page reads as hero -> pipeline ->
          actions -> activity rather than one continuous scroll of
          same-weight blocks. */}
      <div className="border-t border-hairline pt-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
            <ListChecks className="h-4 w-4" strokeWidth={2} />
          </span>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Pipeline Status</h3>
        </div>

        {pipelineSummaryQuery.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((row) => (
              <Card key={row} className="h-20 p-5" />
            ))}
          </div>
        )}

        {pipelineSummaryQuery.isError && (
          <Card className="grid justify-items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
            <p className="text-sm font-semibold text-danger">Couldn&apos;t load pipeline status</p>
            <p className="max-w-sm text-xs text-ink-muted">
              {pipelineSummaryQuery.error instanceof Error ? pipelineSummaryQuery.error.message : 'An unexpected error occurred.'}
            </p>
            <Button type="button" variant="secondary" onClick={() => pipelineSummaryQuery.refetch()}>Retry</Button>
          </Card>
        )}

        {pipeline && (
          <div className="grid gap-5">
            {/* Funnel — every stage this KPI grid used to repeat individually
                (Total Leads, Qualified, Good, Proposal Ready/Approved,
                Communication Ready/Awaiting Send Approval) now lives here
                once, at one consistent visual weight, plus the one number
                that wasn't already covered (Awaiting Proposal Review) rather
                than duplicating the same counts in two same-size grids. Only
                the funnel's current (rightmost non-zero) stage carries the
                ledger accent. */}
            <Card className="p-5">
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Pipeline Funnel</h4>
              {/* Fixed 8-stage list (see below), not a growable/paginated
                  one — so a horizontal scroll on overflow, same convention
                  this file already uses for wide tables (Recent Tender
                  Activity, Lead Signals), rather than pagination controls.
                  Each FunnelStage box has a 132px floor and no flex-wrap
                  here, so without this the row was silently clipped by the
                  parent Card's overflow-hidden on any narrower viewport. */}
              <div className="mt-4 flex flex-col gap-3 overflow-x-auto pb-1 md:flex-row md:items-center">
                {(() => {
                  // Every real stage the old KPI grid + funnel showed,
                  // ordered earliest -> latest. "Current" is computed as the
                  // furthest stage with a non-zero count, so the accent
                  // always lands on wherever the real pipeline actually sits
                  // right now instead of a hand-picked pair of stages that
                  // silently shows no accent for other data states.
                  const stages = [
                    { label: 'Total Leads', value: pipeline.totalLeads },
                    { label: 'Qualified', value: pipeline.qualification.totalQualified },
                    { label: 'Good', value: pipeline.qualification.good },
                    { label: 'Proposal Ready', value: pipeline.proposal.generated },
                    { label: 'Awaiting Proposal Review', value: pipeline.awaitingProposalReview },
                    { label: 'Proposal Approved', value: pipeline.proposal.approved },
                    { label: 'Communication Ready', value: pipeline.communication.prepared },
                    { label: 'Awaiting Send Approval', value: pipeline.communication.awaitingSendApproval },
                  ];
                  let currentIndex = -1;
                  for (let i = stages.length - 1; i >= 0; i -= 1) {
                    if (stages[i].value > 0) {
                      currentIndex = i;
                      break;
                    }
                  }
                  return stages.map((stage, index) => (
                    <FunnelStage
                      key={stage.label}
                      label={stage.label}
                      value={stage.value}
                      isLast={index === stages.length - 1}
                      isCurrent={index === currentIndex}
                    />
                  ));
                })()}
              </div>
              {pipeline.qualification.good === 0 && (
                <p className="mt-3 text-xs text-ink-muted">No leads have reached the GOOD qualification threshold yet.</p>
              )}
            </Card>

            {/* Status distribution — compact list style (label pill + right-
                aligned tabular count, hairline row dividers), deliberately
                plainer than the stat/hero cards above so breakdowns, counts,
                and actions each read as a distinct kind of content rather
                than three sections wearing the same card. */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Qualification</h4>
                <div className="mt-3">
                  <DistributionRow label="QUALIFIED_GOOD" value={pipeline.qualification.good} tone={QUALIFICATION_TONE.QUALIFIED_GOOD} />
                  <DistributionRow label="QUALIFIED_HITL" value={pipeline.qualification.hitl} tone={QUALIFICATION_TONE.QUALIFIED_HITL} />
                  <DistributionRow label="QUALIFIED_BAD" value={pipeline.qualification.bad} tone={QUALIFICATION_TONE.QUALIFIED_BAD} />
                  <DistributionRow label="Unqualified" value={pipeline.qualification.unqualified} tone="neutral" />
                </div>
              </Card>
              <Card className="p-5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Proposal</h4>
                {pipeline.proposal.generated === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">No approved qualification has generated a proposal yet.</p>
                ) : (
                  <div className="mt-3">
                    <DistributionRow label="Ready for Review" value={pipeline.proposal.readyForReview} tone={PROPOSAL_TONE['Ready For Review']} />
                    <DistributionRow label="Approved" value={pipeline.proposal.approved} tone={PROPOSAL_TONE.Approved} />
                    <DistributionRow label="Changes Requested" value={pipeline.proposal.changesRequested} tone={PROPOSAL_TONE['Changes Requested']} />
                    <DistributionRow label="Rejected" value={pipeline.proposal.rejected} tone={PROPOSAL_TONE.Rejected} />
                    <DistributionRow label="On Hold" value={pipeline.proposal.onHold} tone={PROPOSAL_TONE['On Hold']} />
                  </div>
                )}
              </Card>
              <Card className="p-5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Communication</h4>
                {pipeline.communication.prepared === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">No communication is currently awaiting final approval.</p>
                ) : (
                  <div className="mt-3">
                    <DistributionRow label="Draft Ready" value={pipeline.communication.draftReady} tone={COMMUNICATION_TONE.DRAFT_READY} />
                    <DistributionRow label="Awaiting Send Approval" value={pipeline.communication.awaitingSendApproval} tone={COMMUNICATION_TONE.AWAITING_SEND_APPROVAL} />
                    <DistributionRow label="On Hold" value={pipeline.communication.onHold} tone={COMMUNICATION_TONE.ON_HOLD} />
                    <DistributionRow label="Rejected" value={pipeline.communication.rejected} tone={COMMUNICATION_TONE.REJECTED} />
                  </div>
                )}
              </Card>
            </div>

            {/* Section 3 — quick-action cards. Distinct role from the stat
                tiles and distribution panels above: these are genuinely
                clickable (the whole card is a Link — see ActionCard) with a
                brand-tinted surface and a call-to-action row, not a passive
                number in a box. Every action routes to an existing page/
                queue, never a duplicate screen. */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">Take Action</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ActionCard
                icon={ClipboardCheck}
                label="HITL Leads"
                value={pipeline.qualification.hitl}
                emptyHint="No leads are currently awaiting quality review."
                actionLabel="Browse Leads"
                to="/tender-leads"
              />
              <ActionCard
                icon={FileSignature}
                label="Proposal Reviews"
                value={pipeline.awaitingProposalReview}
                emptyHint="No proposals are currently awaiting human review."
                actionLabel="Review Proposals"
                to="/human-review"
              />
              <ActionCard
                icon={CheckCircle2}
                label="Approved Proposals"
                value={pipeline.proposal.approved}
                emptyHint="No approved proposal is ready for communication preparation yet."
                actionLabel="Prepare Communication"
                to="/communication"
              />
              <ActionCard
                icon={Mail}
                label="Awaiting Send Approval"
                value={pipeline.communication.awaitingSendApproval}
                emptyHint="No communication is currently awaiting final approval."
                actionLabel="Open Communication"
                to="/communication"
              />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 4 — activity feed zone starts here (AI Brief, Recent Tender
          Activity, Lead Signals) — same top rule + spacing pattern as the
          Pipeline Status zone above, so the page reads as clearly separated
          hero -> pipeline -> actions -> activity zones rather than one
          continuous scroll. */}
      <div className="grid gap-6 border-t border-hairline pt-6">
        {/* Today's AI Brief — Gemini, once a day, from the real pipeline. */}
        <AiBriefCard />

      {/* Section 3 — Recent Tender Activity */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b border-hairline px-5 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
            <FileText className="h-4 w-4" strokeWidth={2} />
          </span>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Recent Tender Activity</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-3">Tender Title</th>
                <th className="px-5 py-3">Winning Company</th>
                <th className="px-5 py-3 text-right">Tender Value</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentQuery.isLoading ? (
                [0, 1, 2].map((row) => (
                  <tr key={row} className="border-b border-hairline">
                    <td colSpan={4} className="px-5 py-4">
                      <div className="h-4 w-full max-w-md animate-pulse rounded bg-surface-sunken" />
                    </td>
                  </tr>
                ))
              ) : recentQuery.isError ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <AlertTriangle className="h-5 w-5 text-danger" strokeWidth={2} />
                      <p className="text-sm font-semibold text-danger">Couldn&apos;t load recent activity</p>
                      <Button type="button" variant="secondary" onClick={() => recentQuery.refetch()}>Retry</Button>
                    </div>
                  </td>
                </tr>
              ) : tenders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-center text-ink-muted">
                      <Inbox className="h-5 w-5" strokeWidth={2} />
                      <p className="text-sm font-medium">No recent activity.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                tenders.map((tender) => {
                  const workflowStatus = leadWorkflowStatus(tender);
                  return (
                    <tr key={tender.tender_id} className="border-b border-hairline align-top transition-colors hover:bg-primary-tint/40">
                      <td className="max-w-xs px-5 py-4">
                        <p className="truncate font-semibold text-ink" title={tenderTitleFrom(tender)}>
                          {tenderTitleFrom(tender)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-ink-soft">{tender.winning_company_name || <span className="text-ink-muted">—</span>}</td>
                      <td className="tabular px-5 py-4 text-right font-semibold text-ink">{tender.amount || '—'}</td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={workflowStatus.tone}>{workflowStatus.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Lead Signals — real lead_signals rows, filterable by real
          signal_type (Lead Category). Distinct from qualification status
          (QUALIFIED_GOOD/HITL/BAD, shown in Pipeline Status above): a
          signal_type like GST_REGISTRATION or COMPANY_EXPANSION is keyed on
          a company CIN, not a tender_id, so this filters lead_signals
          directly rather than the tenders list — see
          src/repositories/leadSignalRepository.js's header on this. */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-hairline px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
              <Radar className="h-4 w-4" strokeWidth={2} />
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Lead Signals</h3>
          </div>
          <div className="w-full sm:w-64">
            <label htmlFor="dashboard-lead-category-filter" className="sr-only">Lead Category</label>
            <select
              id="dashboard-lead-category-filter"
              className={selectClass}
              value={leadCategory}
              onChange={(event) => handleLeadCategoryChange(event.target.value)}
            >
              <option value="All">All Lead Categories</option>
              {signalCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label} ({category.count.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Signal Date</th>
                <th className="px-5 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {signalsQuery.isLoading ? (
                [0, 1, 2].map((row) => (
                  <tr key={row} className="border-b border-hairline">
                    <td colSpan={5} className="px-5 py-4">
                      <div className="h-4 w-full max-w-md animate-pulse rounded bg-surface-sunken" />
                    </td>
                  </tr>
                ))
              ) : signalsQuery.isError ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <AlertTriangle className="h-5 w-5 text-danger" strokeWidth={2} />
                      <p className="text-sm font-semibold text-danger">Couldn&apos;t load lead signals</p>
                      <Button type="button" variant="secondary" onClick={() => signalsQuery.refetch()}>Retry</Button>
                    </div>
                  </td>
                </tr>
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-center text-ink-muted">
                      <Inbox className="h-5 w-5" strokeWidth={2} />
                      <p className="text-sm font-medium">No lead signals found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                signals.map((signal) => (
                  <tr key={signal.id} className="border-b border-hairline align-top transition-colors hover:bg-primary-tint/40">
                    <td className="px-5 py-4 font-semibold text-ink">{signal.company_name || <span className="text-ink-muted">—</span>}</td>
                    <td className="px-5 py-4">
                      <StatusBadge tone="info">{signal.signal_type}</StatusBadge>
                    </td>
                    <td className="max-w-xs truncate px-5 py-4 text-ink-soft" title={signal.title ?? undefined}>{signal.title || '—'}</td>
                    <td className="tabular px-5 py-4 text-ink-soft">{formatDate(signal.signal_date ? signal.signal_date.slice(0, 10) : null)}</td>
                    <td className="px-5 py-4 text-ink-soft">{signal.source || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {signalsPagination && signals.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-ink-muted">
              {signalsPagination.total.toLocaleString('en-IN')} signal{signalsPagination.total === 1 ? '' : 's'} · Page {signalsPagination.page} of {signalsPagination.total_pages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={signalsPage <= 1 || signalsQuery.isLoading}
                onClick={() => setSignalsPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={signalsPage >= signalsPagination.total_pages || signalsQuery.isLoading}
                onClick={() => setSignalsPage((value) => Math.min(signalsPagination.total_pages, value + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
      </div>

      {/* Section 5 — Quick Actions (static shortcut links, distinct from the
          pipeline's data-driven ActionCards above) */}
      <Card className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </span>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Quick Actions</h3>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/tender-leads" className="no-underline">
            <Button type="button" variant="secondary">
              <ListChecks className="h-4 w-4" /> Browse Tender Leads
            </Button>
          </Link>
          <Link to="/lead-details" className="no-underline">
            <Button type="button" variant="secondary">
              <FileText className="h-4 w-4" /> Open Lead Details
            </Button>
          </Link>
          <Button type="button" variant="secondary">
            <HeartPulse className="h-4 w-4" /> Run Health Check
          </Button>
          <Button type="button" variant="secondary">
            <FileSignature className="h-4 w-4" /> Generate Proposal
          </Button>
        </div>
      </Card>

      {/* Section 5 — System Status */}
      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
            <Server className="h-4 w-4" strokeWidth={2} />
          </span>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">System Status</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SystemStatusCard icon={Radar} label="TenderBook Scraper" tone="neutral" text="Status unavailable." />
          <SystemStatusCard icon={Database} label="Database" tone="neutral" text="Status unavailable." />
          <SystemStatusCard
            icon={Server}
            label="API"
            tone={apiHealthQuery.isLoading ? 'neutral' : apiHealthQuery.isError ? 'danger' : 'success'}
            text={apiHealthQuery.isLoading ? 'Checking…' : apiHealthQuery.isError ? 'Offline' : 'Online'}
          />
          <SystemStatusCard icon={Monitor} label="Frontend" tone="success" text="Online" />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;