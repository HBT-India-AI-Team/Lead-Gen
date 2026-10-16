import { useQuery } from '@tanstack/react-query';
import Card from '../ui/Card';
import { fetchPipelineSummary } from '../../services/leadsApi';

// Lead Quality Distribution + Proposal Pipeline on Analytics, from the same
// GET /api/leads/pipeline-summary aggregate the Dashboard uses (counts of
// persisted qualification outcomes and proposal statuses across all leads).
// The Analytics filters above don't apply — each card says so.

interface PipelineSummary {
  qualification: { good: number; hitl: number; bad: number; unqualified: number; totalQualified: number };
  proposal: { generated: number; readyForReview: number; approved: number; changesRequested: number; rejected: number; onHold: number; sent: number };
}

interface Bar {
  label: string;
  value: number;
  className: string;
}

function Bars({ bars }: { bars: Bar[] }) {
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);
  return (
    <ul className="mt-4 grid gap-2.5">
      {bars.map((bar) => {
        const share = total > 0 ? (bar.value / total) * 100 : 0;
        return (
          <li key={bar.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
            <span className="truncate text-ink-soft">{bar.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
              <span className={`block h-full rounded-full ${bar.className}`} style={{ width: `${share}%` }} />
            </span>
            <span className="tabular w-24 text-right text-ink">
              {bar.value.toLocaleString('en-IN')} <span className="text-ink-muted">({share.toFixed(0)}%)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SummaryCard({ title, note, bars, loading, error }: { title: string; note: string; bars: Bar[]; loading: boolean; error: boolean }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{title}</h3>
      {loading && <p className="mt-3 text-xs text-ink-muted" role="status">Loading…</p>}
      {error && <p className="mt-3 text-xs text-ink-muted">Couldn&apos;t load the pipeline summary.</p>}
      {!loading && !error && <Bars bars={bars} />}
      <p className="mt-3 text-[11px] text-ink-muted">{note}</p>
    </Card>
  );
}

export default function PipelineDistribution() {
  const query = useQuery({
    queryKey: ['analytics-pipeline-summary'],
    queryFn: () => fetchPipelineSummary() as Promise<PipelineSummary>,
  });
  const q = query.data?.qualification;
  const p = query.data?.proposal;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <SummaryCard
        title="Lead Quality Distribution"
        loading={query.isLoading}
        error={query.isError}
        note={`Qualification outcomes across all ${(q ? q.totalQualified + q.unqualified : 0).toLocaleString('en-IN')} leads (filters above don't apply). Good = 80+, review = 60–79, low = below 60.`}
        bars={[
          { label: 'Good (80+)', value: q?.good ?? 0, className: 'bg-success' },
          { label: 'Needs review (60–79)', value: q?.hitl ?? 0, className: 'bg-warning-border' },
          { label: 'Low (< 60)', value: q?.bad ?? 0, className: 'bg-danger' },
          { label: 'Not qualified yet', value: q?.unqualified ?? 0, className: 'bg-hairline-strong' },
        ]}
      />
      <SummaryCard
        title="Proposal Pipeline"
        loading={query.isLoading}
        error={query.isError}
        note={`Status of all ${(p?.generated ?? 0).toLocaleString('en-IN')} AI-drafted proposals (filters above don't apply).`}
        bars={[
          { label: 'Awaiting review', value: p?.readyForReview ?? 0, className: 'bg-primary' },
          { label: 'Approved', value: p?.approved ?? 0, className: 'bg-success' },
          { label: 'Changes requested', value: p?.changesRequested ?? 0, className: 'bg-warning-border' },
          { label: 'On hold', value: p?.onHold ?? 0, className: 'bg-hairline-strong' },
          { label: 'Rejected', value: p?.rejected ?? 0, className: 'bg-danger' },
          { label: 'Sent', value: p?.sent ?? 0, className: 'bg-secondary' },
        ]}
      />
    </div>
  );
}
