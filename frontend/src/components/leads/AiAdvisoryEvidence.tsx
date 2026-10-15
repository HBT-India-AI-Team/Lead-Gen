import { AlertTriangle, CheckCircle2, CircleSlash, FileSearch } from 'lucide-react';

// The AI's advisory read of a lead next to the exact evidence it was shown.
// Both come straight from tenders.qualification_reason (aiAnalysis +
// evidence, written by backend/src/services/leadQualificationPipelineService.js)
// so a reviewer can check every claim in the reasoning against its inputs.
// The deterministic score stays authoritative; this panel never changes it.

export interface QualificationAiAnalysis {
  status: string;
  score?: number;
  classification?: string;
  confidence?: number;
  reasoning?: string;
  positiveSignals?: string[];
  riskFactors?: string[];
  missingEvidence?: string[];
  recommendedNextAction?: string;
  error?: string;
}

interface EvidenceSignal {
  type?: string;
  title?: string | null;
  source?: string | null;
  signalDate?: string | null;
}

export interface QualificationEvidenceSnapshot {
  company?: { name?: string | null; cin?: string | null; industry?: string | null; businessCategory?: string | null };
  signals?: EvidenceSignal[];
  gstEvidence?: EvidenceSignal[];
  expansionEvidence?: EvidenceSignal[];
  financialEvidence?: {
    annualRevenue?: number | null;
    netProfit?: number | null;
    creditRating?: string | null;
    incorporationDate?: string | null;
    directorCount?: number | null;
  };
  riskEvidence?: { complianceStatus?: string | null };
  unavailableEvidence?: string[];
  collectedAt?: string;
}

function formatInr(value: number | null | undefined) {
  if (value == null) return null;
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function SignalList({ title, items, icon: Icon, tone }: { title: string; items?: string[]; icon: typeof CheckCircle2; tone: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <h5 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{title}</h5>
      <ul className="mt-1.5 grid gap-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs text-ink">
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} strokeWidth={2} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  const missing = value == null || value === '';
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="shrink-0 font-semibold text-ink-soft">{label}</dt>
      <dd className={`truncate text-right ${missing ? 'text-ink-muted' : 'text-ink'}`}>{missing ? 'Not available' : value}</dd>
    </div>
  );
}

function EvidenceInputs({ evidence }: { evidence: QualificationEvidenceSnapshot }) {
  const financial = evidence.financialEvidence ?? {};
  const signals = [...(evidence.signals ?? []), ...(evidence.gstEvidence ?? []), ...(evidence.expansionEvidence ?? [])];

  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <div className="grid gap-3">
        <div>
          <h5 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Company</h5>
          <dl className="mt-1.5 grid gap-1">
            <EvidenceRow label="Name" value={evidence.company?.name} />
            <EvidenceRow label="CIN" value={evidence.company?.cin} />
            <EvidenceRow label="Industry" value={evidence.company?.industry} />
          </dl>
        </div>
        <div>
          <h5 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Financials (Probe42)</h5>
          <dl className="mt-1.5 grid gap-1">
            <EvidenceRow label="Annual revenue" value={formatInr(financial.annualRevenue)} />
            <EvidenceRow label="Net profit" value={formatInr(financial.netProfit)} />
            <EvidenceRow label="Credit rating" value={financial.creditRating} />
            <EvidenceRow label="Compliance" value={evidence.riskEvidence?.complianceStatus} />
          </dl>
        </div>
      </div>

      <div className="grid content-start gap-3">
        <div>
          <h5 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Signals ({signals.length})</h5>
          {signals.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-muted">No signals on record.</p>
          ) : (
            <ul className="mt-1.5 grid gap-1.5">
              {signals.map((signal, index) => (
                <li key={`${signal.type}-${index}`} className="text-xs">
                  <span className="font-medium text-ink">{signal.title || signal.type}</span>
                  <span className="block text-ink-muted">
                    {[signal.source, signal.signalDate?.slice(0, 10)].filter(Boolean).join(' · ') || 'Source not recorded'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(evidence.unavailableEvidence?.length ?? 0) > 0 && (
          <div>
            <h5 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Not available to the AI</h5>
            <ul className="mt-1.5 grid gap-1">
              {evidence.unavailableEvidence!.map((item) => (
                <li key={item} className="flex gap-2 text-xs text-ink-muted">
                  <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiAdvisoryEvidence({
  aiAnalysis,
  evidence,
}: {
  aiAnalysis: QualificationAiAnalysis | null | undefined;
  evidence: QualificationEvidenceSnapshot | null | undefined;
}) {
  if (!aiAnalysis) return null;

  return (
    <section aria-label="AI advisory analysis" className="rounded-xl border border-dashed border-hairline-strong bg-surface-muted p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">AI Advisory Analysis (not the authoritative score)</h4>

      {aiAnalysis.status !== 'AVAILABLE' ? (
        <p className="mt-2 text-sm text-ink-muted">AI advisory analysis unavailable for this lead.</p>
      ) : (
        <div className="mt-2 grid gap-3">
          <p className="text-xs text-ink-soft">
            Advisory score <span className="tabular font-semibold text-ink">{aiAnalysis.score}</span> · {aiAnalysis.classification} · confidence{' '}
            <span className="tabular font-semibold text-ink">{aiAnalysis.confidence}</span>
          </p>
          {aiAnalysis.reasoning && <p className="text-sm text-ink-soft">{aiAnalysis.reasoning}</p>}

          <div className="grid gap-3 sm:grid-cols-3">
            <SignalList title="Positive signals" items={aiAnalysis.positiveSignals} icon={CheckCircle2} tone="text-success" />
            <SignalList title="Risk factors" items={aiAnalysis.riskFactors} icon={AlertTriangle} tone="text-warning" />
            <SignalList title="Missing evidence" items={aiAnalysis.missingEvidence} icon={CircleSlash} tone="text-ink-muted" />
          </div>
          {aiAnalysis.recommendedNextAction && (
            <p className="text-xs text-ink-soft">
              Suggested next action: <span className="font-semibold text-ink">{aiAnalysis.recommendedNextAction}</span>
            </p>
          )}
        </div>
      )}

      <details className="group mt-3 border-t border-hairline pt-3">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <FileSearch className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Evidence the AI was shown
        </summary>
        {evidence ? (
          <EvidenceInputs evidence={evidence} />
        ) : (
          <p className="mt-2 text-xs text-ink-muted">
            No evidence snapshot was recorded for this qualification (it ran before snapshots were saved). Re-qualify the lead to capture one.
          </p>
        )}
      </details>
    </section>
  );
}
