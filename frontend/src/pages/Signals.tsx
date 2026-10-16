import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Gavel,
  Inbox,
  ReceiptText,
  Loader2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import { fetchLeadSignalCategories, fetchLeadSignals } from '../services/leadsApi';
import { fetchScrapeStatus, startScrape } from '../services/ingestionApi';
import Button from '../components/ui/Button';
import { formatInrCompact } from '../utils/tenderFormatters';

// A buying signal is a dated, sourced event about a company — a tender won, a
// GST registration, an expansion. The page reads as a ledger rather than a
// card grid on purpose: these are entries in a running book, each with a date,
// a counterparty and an amount, and the app's signature passbook rule is the
// spine that carries them.
//
// Every field rendered here is a real lead_signals column (see
// src/repositories/leadSignalRepository.js). raw_data.tenderId is the only
// link back to a lead, and it exists only for tender-win signals, so the
// "Open lead" action is conditional rather than always drawn.

interface SignalCategory {
  value: string;
  label: string;
  count: number;
}

interface Signal {
  id: number;
  company_name: string;
  company_cin: string | null;
  signal_type: string;
  source: string | null;
  signal_date: string | null;
  title: string | null;
  description: string | null;
  value: string | null;
  location: string | null;
  raw_data: { tenderId?: string; url?: string; category?: string } | null;
}

// Icon and tint per signal type. Tints come from the index.css tokens so a new
// signal type added to the backend degrades to the neutral mark rather than an
// undefined Tailwind class.
const SIGNAL_KINDS: Record<
  string,
  { icon: typeof Gavel; label: string; iconClass: string; discClass: string }
> = {
  GOVERNMENT_TENDER_WIN: {
    icon: Gavel,
    label: 'Tender win',
    iconClass: 'text-primary',
    discClass: 'bg-primary-tint',
  },
  GST_REGISTRATION: {
    icon: ReceiptText,
    label: 'GST registration',
    iconClass: 'text-success',
    discClass: 'bg-success-bg',
  },
  COMPANY_EXPANSION: {
    icon: TrendingUp,
    label: 'Expansion',
    iconClass: 'text-warning',
    discClass: 'bg-accent-soft',
  },
};

const NEUTRAL_KIND = {
  icon: Building2,
  label: 'Signal',
  iconClass: 'text-ink-soft',
  discClass: 'bg-surface-sunken',
};

function kindOf(signalType: string) {
  return SIGNAL_KINDS[signalType] ?? NEUTRAL_KIND;
}

/** "30 Sep" / "—" — the ledger's date column, deliberately short so the rail stays narrow. */
function shortDate(value: string | null) {
  if (!value) return { day: '—', month: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '—', month: '' };
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: date.toLocaleString('en-IN', { month: 'short' }),
  };
}

/** "September 2026" — the group heading entries are filed under. */
function monthKey(value: string | null) {
  if (!value) return 'Undated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Undated';
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function groupByMonth(signals: Signal[]) {
  const groups = new Map<string, Signal[]>();
  for (const signal of signals) {
    const key = monthKey(signal.signal_date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(signal);
  }
  return [...groups.entries()];
}

function SignalEntry({ signal, index }: { signal: Signal; index: number }) {
  const kind = kindOf(signal.signal_type);
  const Icon = kind.icon;
  const { day, month } = shortDate(signal.signal_date);
  const amount = signal.value != null ? formatInrCompact(Number(signal.value)) : null;
  const tenderId = signal.raw_data?.tenderId;
  const sourceUrl = signal.raw_data?.url;

  return (
    <li
      className="signal-entry relative flex gap-4 pb-7 last:pb-0 sm:gap-5"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* Date rail + the mark that sits on the ledger spine. */}
      <div className="relative z-10 flex w-12 shrink-0 flex-col items-center sm:w-14">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-canvas ${kind.discClass}`}
        >
          <Icon className={`h-[18px] w-[18px] ${kind.iconClass}`} aria-hidden="true" />
        </span>
        <span className="mt-2 text-center text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink-muted">
          {day}
          {month && (
            <>
              <br />
              {month}
            </>
          )}
        </span>
      </div>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-bold leading-snug text-ink">{signal.company_name}</h3>
          <StatusBadge tone="neutral">{kind.label}</StatusBadge>
          {amount && (
            <span className="text-sm font-semibold tabular-nums text-ink-soft">{amount}</span>
          )}
        </div>

        {signal.description && (
          <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-ink-soft">
            {signal.description}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          {signal.source && <span>{signal.source}</span>}
          {signal.company_cin && <span className="tabular-nums">CIN {signal.company_cin}</span>}
          {signal.location && <span>{signal.location}</span>}

          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Evidence
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}

          {tenderId && (
            <Link
              to={`/lead-details?tenderId=${encodeURIComponent(tenderId)}`}
              className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Open lead
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function EntrySkeleton() {
  return (
    <li className="relative flex gap-4 pb-7 sm:gap-5">
      <div className="relative z-10 w-12 shrink-0 sm:w-14">
        <span className="block h-10 w-10 animate-pulse rounded-full bg-surface-sunken ring-4 ring-canvas" />
      </div>
      <div className="flex-1 space-y-2 pt-2">
        <span className="block h-4 w-56 animate-pulse rounded bg-surface-sunken" />
        <span className="block h-3 w-full max-w-xl animate-pulse rounded bg-surface-sunken" />
        <span className="block h-3 w-40 animate-pulse rounded bg-surface-sunken" />
      </div>
    </li>
  );
}

export default function Signals() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const categoriesQuery = useQuery({
    queryKey: ['lead-signal-categories'],
    queryFn: () => fetchLeadSignalCategories() as Promise<{ categories: SignalCategory[] }>,
  });

  const signalsQuery = useQuery({
    queryKey: ['lead-signals', activeCategory],
    queryFn: () =>
      fetchLeadSignals(
        activeCategory === 'ALL' ? { limit: 200 } : { signal_type: activeCategory, limit: 200 }
      ) as Promise<{ signals: Signal[] }>,
  });

  const queryClient = useQueryClient();

  // Discovery runs as a Cloud Run Job, so this polls while one is in flight
  // rather than holding a request open for the hours a scrape can take.
  const scrapeQuery = useQuery({
    queryKey: ['scrape-status'],
    queryFn: () =>
      fetchScrapeStatus() as Promise<{
        configured: boolean;
        executions: { startedAt: string | null; running: boolean; succeeded: boolean; failed: boolean }[];
      }>,
    refetchInterval: (query) =>
      query.state.data?.executions?.some((execution) => execution.running) ? 15000 : false,
  });

  const scrapeMutation = useMutation({
    mutationFn: () => startScrape(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scrape-status'] }),
  });

  const latestRun = scrapeQuery.data?.executions?.[0];
  const isRunning = Boolean(latestRun?.running);
  const scrapeConfigured = scrapeQuery.data?.configured ?? false;

  const categories = categoriesQuery.data?.categories ?? [];
  const totalCount = categories.reduce((sum, category) => sum + category.count, 0);
  const signals = signalsQuery.data?.signals ?? [];

  // Summary reads as one sentence of running totals rather than a row of stat
  // tiles: on a feed the counts are context for the entries, not the headline.
  const summary = useMemo(() => {
    const companies = new Set(signals.map((signal) => signal.company_name)).size;
    const value = signals.reduce((sum, signal) => sum + Number(signal.value ?? 0), 0);
    return { companies, value };
  }, [signals]);

  const grouped = useMemo(() => groupByMonth(signals), [signals]);

  const tabs = [{ value: 'ALL', label: 'All signals', count: totalCount }, ...categories];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Signals</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">
            Dated, sourced events that say a company may need financing now — contract awards, new
            registrations and expansion activity, newest first.
          </p>
        </div>

        {scrapeConfigured && (
          <div className="text-right">
            <Button
              type="button"
              onClick={() => scrapeMutation.mutate()}
              disabled={isRunning || scrapeMutation.isPending}
            >
              {isRunning || scrapeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {isRunning ? 'Discovery running' : 'Run discovery'}
            </Button>
            <p className="mt-1.5 max-w-[32ch] text-xs text-ink-muted">
              {scrapeMutation.isError
                ? (scrapeMutation.error as Error).message
                : isRunning
                  ? 'Scraping tender portals now. New signals appear as they are processed.'
                  : latestRun?.startedAt
                    ? `Last run ${new Date(latestRun.startedAt).toLocaleString('en-IN')}`
                    : 'Fetches new tender awards from the connected portals.'}
            </p>
          </div>
        )}
      </header>

      {/* Category filter. A segmented row rather than a dropdown: there are few
          categories, each carries a count worth seeing, and switching is the
          page's primary interaction. */}
      <div
        role="tablist"
        aria-label="Signal category"
        className="flex flex-wrap gap-2 border-b border-hairline pb-3"
      >
        {tabs.map((tab) => {
          const isActive = activeCategory === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveCategory(tab.value)}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isActive
                  ? 'bg-primary text-ink-inverse'
                  : 'bg-surface text-ink-soft ring-1 ring-hairline hover:bg-primary-tint hover:text-primary'
              }`}
            >
              {tab.label}
              <span
                className={`tabular-nums text-xs font-bold ${
                  isActive ? 'text-ink-inverse/80' : 'text-ink-muted'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <Card accent className="p-5 sm:p-6">
        {/* Running totals for the current filter. */}
        <p className="text-sm text-ink-soft">
          <span className="font-bold tabular-nums text-ink">{signals.length}</span>{' '}
          {signals.length === 1 ? 'signal' : 'signals'} across{' '}
          <span className="font-bold tabular-nums text-ink">{summary.companies}</span>{' '}
          {summary.companies === 1 ? 'company' : 'companies'}
          {summary.value > 0 && (
            <>
              {' · '}
              <span className="font-bold tabular-nums text-ink">
                {formatInrCompact(summary.value)}
              </span>{' '}
              in combined contract value
            </>
          )}
        </p>

        <div className="mt-6">
          {signalsQuery.isLoading && (
            <ul className="relative">
              <span
                className="absolute bottom-4 left-6 top-4 w-px bg-hairline sm:left-7"
                aria-hidden="true"
              />
              <EntrySkeleton />
              <EntrySkeleton />
              <EntrySkeleton />
            </ul>
          )}

          {signalsQuery.isError && (
            <div className="flex items-start gap-3 rounded-lg bg-danger-bg p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">Signals could not be loaded.</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  The signals service did not respond.{' '}
                  <button
                    type="button"
                    onClick={() => signalsQuery.refetch()}
                    className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Try again
                  </button>
                </p>
              </div>
            </div>
          )}

          {signalsQuery.isSuccess && signals.length === 0 && (
            <div className="py-10 text-center">
              <Inbox className="mx-auto h-7 w-7 text-ink-muted" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">No signals in this category yet.</p>
              <p className="mx-auto mt-1 max-w-[44ch] text-sm text-ink-soft">
                Signals arrive when the ingestion jobs find a registration, an award or an expansion
                for a company already in the pipeline.
              </p>
            </div>
          )}

          {signalsQuery.isSuccess &&
            grouped.map(([month, entries], groupIndex) => (
              <section key={month} className={groupIndex > 0 ? 'mt-8' : ''}>
                <h2 className="mb-5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                  {month}
                </h2>
                <ul className="relative">
                  {/* The ledger spine: one continuous rule the entries hang from. */}
                  <span
                    className="absolute bottom-6 left-6 top-4 w-px bg-hairline sm:left-7"
                    aria-hidden="true"
                  />
                  {entries.map((signal, index) => (
                    <SignalEntry key={signal.id} signal={signal} index={index} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </Card>
    </div>
  );
}
