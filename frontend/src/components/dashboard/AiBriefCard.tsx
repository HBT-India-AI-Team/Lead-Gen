import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Clock, Loader2, Sparkles, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Card from '../ui/Card';
import StatusBadge from '../ui/StatusBadge';
import { fetchAiBrief } from '../../services/aiApi';

// "Today's AI Brief" — written by Gemini once a day from the real pipeline
// numbers, top leads and the last 24 hours of decisions
// (backend/src/services/aiBriefService.js). Shows an honest "Unavailable"
// state with the reason when the model couldn't be reached.

type BulletKind = 'changed' | 'act' | 'stuck';

interface AiBrief {
  status: 'ready' | 'unavailable';
  date: string;
  headline?: string;
  bullets?: { kind: BulletKind; text: string; tenderId: string | null }[];
  model?: string;
  generatedAt?: string;
  basedOn?: { totalLeads: number | null; topLeads: number; decisionsLast24Hours: number };
  reason?: string;
}

const KIND: Record<BulletKind, { icon: LucideIcon; label: string; className: string }> = {
  changed: { icon: TrendingUp, label: 'What changed', className: 'bg-primary-tint text-primary' },
  act: { icon: ArrowRight, label: 'Act today', className: 'bg-success-bg text-success' },
  stuck: { icon: Clock, label: 'Stuck', className: 'bg-warning-bg text-warning' },
};

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function AiBriefCard() {
  const query = useQuery({
    queryKey: ['ai-brief'],
    queryFn: () => fetchAiBrief() as Promise<AiBrief>,
    staleTime: 30 * 60 * 1000,
  });
  const brief = query.data;
  const ready = brief?.status === 'ready';

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Today&apos;s AI Brief</h3>
        <span className="ml-auto">
          {query.isLoading && <StatusBadge tone="info">Generating…</StatusBadge>}
          {ready && <StatusBadge tone="success">Gemini · {brief.model}</StatusBadge>}
          {!query.isLoading && !ready && <StatusBadge tone="neutral">Unavailable</StatusBadge>}
        </span>
      </div>

      {query.isLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
          Reading today&apos;s pipeline…
        </p>
      )}

      {ready && (
        <div className="mt-4 grid gap-3">
          <p className="text-base font-semibold text-ink">{brief.headline}</p>
          <ul className="grid gap-2.5">
            {brief.bullets?.map((bullet, index) => {
              const kind = KIND[bullet.kind] ?? KIND.changed;
              const Icon = kind.icon;
              return (
                <li key={index} className="flex items-start gap-3 text-sm text-ink-soft">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${kind.className}`}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    <span className="sr-only">{kind.label}:</span>
                  </span>
                  <span className="min-w-0">
                    {bullet.text}
                    {bullet.tenderId && (
                      <Link to={`/lead-details?tenderId=${encodeURIComponent(bullet.tenderId)}`} className="ml-1.5 whitespace-nowrap text-xs font-semibold">
                        Open lead
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-ink-muted">
            Written by Gemini at {formatTime(brief.generatedAt)} from {brief.basedOn?.totalLeads?.toLocaleString('en-IN') ?? '—'} leads, the top {brief.basedOn?.topLeads} by score and {brief.basedOn?.decisionsLast24Hours} decisions in the last 24 hours. Refreshes daily.
          </p>
        </div>
      )}

      {!query.isLoading && !ready && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-dashed border-hairline-strong bg-surface-muted p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm text-ink-soft">
            Today&apos;s brief couldn&apos;t be generated
            {brief?.reason ? `: ${brief.reason}` : query.error instanceof Error ? `: ${query.error.message}` : '.'}
          </p>
        </div>
      )}
    </Card>
  );
}
