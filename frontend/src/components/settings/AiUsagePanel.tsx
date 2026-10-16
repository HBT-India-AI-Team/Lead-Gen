import { useQuery } from '@tanstack/react-query';
import { fetchAiUsage } from '../../services/aiApi';

// Measured AI usage on the Settings page, from GET /api/ai/usage (every
// model call is logged with its latency and tokens by the backend's
// llmTelemetry.js). Cost appears only when prices are configured on the
// server — never estimated here.

interface OperationUsage {
  operation: string;
  calls: number;
  failures: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  avgTokensPerCall: number | null;
  avgCostUsdPerCall: number | null;
}

interface AiUsage {
  days: number;
  overall: OperationUsage & { totalTokens: number; estimatedCostUsd: number | null };
  operations: OperationUsage[];
  perLead: { operations: string[]; measured: string[]; avgTokens: number | null; avgCostUsd: number | null };
  pricingConfigured: boolean;
}

const OPERATION_LABELS: Record<string, string> = {
  qualification_advisory: 'Qualification advisory',
  proposal: 'Proposal draft',
  outreach_email: 'Outreach email',
  daily_brief: 'Daily brief',
  lead_narrative: 'Lead analysis narrative',
  tender_extraction: 'Tender extraction',
  lead_intelligence: 'Lead intelligence',
  lead_qualification_batch: 'Batch qualification',
  mca_profile: 'MCA profiling',
};

const seconds = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const number = (value: number | null) => (value == null ? '—' : value.toLocaleString('en-IN'));
const usd = (value: number | null) => (value == null ? '—' : `$${value < 0.01 ? value.toFixed(5) : value.toFixed(3)}`);

export default function AiUsagePanel() {
  const query = useQuery({ queryKey: ['settings-ai-usage'], queryFn: () => fetchAiUsage(7) as Promise<AiUsage>, retry: 0 });

  if (query.isLoading) return <p className="mt-4 text-xs text-ink-muted">Loading measured usage…</p>;
  if (query.isError || !query.data) return <p className="mt-4 text-xs text-ink-muted">Measured usage unavailable.</p>;

  const { overall, operations, perLead, pricingConfigured, days } = query.data;
  if (overall.calls === 0) {
    return <p className="mt-4 text-xs text-ink-muted">No model calls recorded in the last {days} days yet.</p>;
  }

  return (
    <div className="mt-5 border-t border-hairline pt-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Measured usage (last {days} days)</h4>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Model calls', `${number(overall.calls)}${overall.failures ? ` (${overall.failures} failed)` : ''}`],
          ['Avg latency', seconds(overall.avgLatencyMs)],
          ['p95 latency', seconds(overall.p95LatencyMs)],
          ['Tokens per lead', perLead.avgTokens == null ? '—' : `${number(perLead.avgTokens)}${pricingConfigured ? ` · ${usd(perLead.avgCostUsd)}` : ''}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-hairline bg-surface-muted p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
            <dd className="tabular mt-1 text-sm font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-xs">
          <thead>
            <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-ink-muted">
              <th scope="col" className="pb-1.5 text-left font-semibold">Feature</th>
              <th scope="col" className="pb-1.5 text-right font-semibold">Calls</th>
              <th scope="col" className="pb-1.5 text-right font-semibold">Avg latency</th>
              <th scope="col" className="pb-1.5 text-right font-semibold">Avg tokens</th>
              {pricingConfigured && <th scope="col" className="pb-1.5 text-right font-semibold">Avg cost</th>}
            </tr>
          </thead>
          <tbody>
            {operations.map((op) => (
              <tr key={op.operation} className="border-b border-hairline last:border-0">
                <td className="py-1.5 text-ink">{OPERATION_LABELS[op.operation] ?? op.operation}</td>
                <td className="tabular py-1.5 text-right text-ink-soft">{number(op.calls)}{op.failures ? ` (${op.failures} failed)` : ''}</td>
                <td className="tabular py-1.5 text-right text-ink-soft">{seconds(op.avgLatencyMs)}</td>
                <td className="tabular py-1.5 text-right text-ink-soft">{number(op.avgTokensPerCall)}</td>
                {pricingConfigured && <td className="tabular py-1.5 text-right text-ink-soft">{usd(op.avgCostUsdPerCall)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        Every model call is logged with its latency and token count. “Tokens per lead” adds the average advisory, proposal and outreach calls
        {perLead.measured.length < perLead.operations.length ? ` (measured so far: ${perLead.measured.map((op) => OPERATION_LABELS[op] ?? op).join(', ') || 'none'})` : ''}.
        {!pricingConfigured && ' Cost appears once Gemini prices are set on the server.'}
      </p>
    </div>
  );
}
