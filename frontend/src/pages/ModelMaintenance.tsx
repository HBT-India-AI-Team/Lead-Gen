import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Inbox,
  Loader2,
  LogOut,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import { fetchCurrentUser, getToken, login, logout } from '../services/authApi';
import { fetchMlModels, fetchMlOverview, fetchTrainingRuns, promoteModel, retireModel, startTrainingRun } from '../services/mlApi';

// Model Maintenance Agent — registry, retraining and the human approval
// step. The agent trains candidates and compares them against whatever
// scores leads today (the active model, or the rules engine); nothing goes
// live until an admin approves it here. Every shape below mirrors
// backend/src/services/ml/retrainingService.js / modelRegistryService.js.

interface MetricSummary {
  n: number;
  positives: number;
  negatives: number;
  rocAuc: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  balancedAccuracy: number | null;
  brier: number | null;
}

interface ClassCounts {
  n: number;
  positives: number;
  negatives: number;
}

interface SegmentComparison extends ClassCounts {
  segmentKey: string;
  evaluable: boolean;
  candidate: number | null;
  incumbent: number | null;
  delta: number | null;
  passed: boolean;
}

interface FeatureWeight {
  feature: string;
  label: string;
  candidate: number;
  incumbent: number | null;
  change: number | null;
}

interface Comparison {
  segmentKey: string;
  labelSource?: string;
  proceedThreshold?: number;
  data?: ClassCounts & { train?: ClassCounts; holdout?: ClassCounts };
  minimums?: { rows: number; rowsPerClass: number };
  candidate?: { modelId: number; version: number; label: string; metrics: MetricSummary };
  incumbent?: { kind: 'model' | 'rules'; modelId: number | null; label: string; metrics: MetricSummary; note?: string };
  segments?: SegmentComparison[];
  gate?: { passed: boolean; improvement: number | null; checks: { name: string; label: string; passed: boolean; detail: string }[] };
  featureWeights?: FeatureWeight[];
  caveats?: string[];
}

interface TrainingRun {
  id: number;
  segment_key: string;
  trigger_type: string;
  status: string;
  requested_by: string | null;
  started_at: string;
  finished_at: string | null;
  row_count: number | null;
  label_window_start: string | null;
  label_window_end: string | null;
  candidate_model_id: number | null;
  comparison: Comparison | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  review_note: string | null;
  error_text: string | null;
}

interface MlModel {
  id: number;
  segment_key: string;
  model_type: string;
  version: number;
  status: 'candidate' | 'active' | 'retired';
  trained_at: string;
  trained_by: string | null;
  promoted_at: string | null;
  retired_at: string | null;
  metrics: { holdout?: MetricSummary } | null;
}

interface LabelSummary extends Omit<ClassCounts, 'n'> {
  total: number;
  trainable: boolean;
  source: { name: string; description: string };
  minimums: { rows: number; rowsPerClass: number };
  bySector: { sector: string; segmentKey: string; total: number; positives: number; negatives: number; trainable: boolean }[];
}

interface Overview {
  fallbackChain: { resolvedVia: string; label: string }[];
  activeModels: MlModel[];
  pendingCandidates: MlModel[];
  labels: LabelSummary;
  promotionGate: { minImprovement: number; maxSegmentDrop: number };
  crmFeed: { connected: boolean; note: string };
}

interface CurrentUser {
  user: { first_name: string | null; last_name: string | null; email: string };
  role: { role_name: string } | null;
}

const RUN_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  running: { label: 'Running', tone: 'info' },
  failed: { label: 'Could not train', tone: 'neutral' },
  gate_failed: { label: 'Did not pass gate', tone: 'danger' },
  proposed: { label: 'Awaiting approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
};

const MODEL_STATUS_TONE: Record<string, StatusTone> = { active: 'success', candidate: 'warning', retired: 'neutral' };

function titleCase(slug: string) {
  return slug
    .split('-')
    .map((word) => (word === 'it' ? 'IT' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** "sector=construction|region=south" -> "Construction · South"; "__pooled__" -> "All segments (pooled)". */
function segmentLabel(segmentKey: string) {
  if (segmentKey === '__pooled__') return 'All segments (pooled)';
  return segmentKey
    .split('|')
    .map((part) => titleCase(part.split('=')[1] ?? part))
    .join(' · ');
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatMetric(value: number | null | undefined) {
  return value == null ? '—' : value.toFixed(3);
}

function formatDelta(value: number | null | undefined) {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// Admin session — train / approve / retire all require an Admin JWT.

function AdminSession({ session, onChanged }: { session: CurrentUser | null | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => {
      setOpen(false);
      setPassword('');
      onChanged();
    },
  });

  if (session) {
    const name = [session.user.first_name, session.user.last_name].filter(Boolean).join(' ') || session.user.email;
    const isAdmin = session.role?.role_name === 'Admin';
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink-soft">
          <ShieldCheck className={`h-4 w-4 ${isAdmin ? 'text-success' : 'text-ink-muted'}`} strokeWidth={2} aria-hidden="true" />
          {name} · {session.role?.role_name ?? 'No role'}
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            await logout();
            onChanged();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> Sign out
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> Admin sign-in
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        loginMutation.mutate();
      }}
    >
      <Input id="ml-admin-email" label="Email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <Input id="ml-admin-password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      <Button type="submit" disabled={loginMutation.isPending}>{loginMutation.isPending ? 'Signing in…' : 'Sign in'}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {loginMutation.isError && (
        <p className="w-full text-xs font-semibold text-danger" role="alert">{errorMessage(loginMutation.error)}</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Scoring path + labelled outcomes.

function ScoringPathCard({ overview }: { overview: Overview }) {
  const activeAt = (resolvedVia: string) =>
    overview.activeModels.filter((model) => {
      if (resolvedVia === 'pooled') return model.segment_key === '__pooled__';
      if (resolvedVia === 'sector_segment') return /^sector=[^|]+$/.test(model.segment_key);
      if (resolvedVia === 'exact_segment') return model.segment_key.includes('|');
      return false;
    });

  return (
    <Card className="p-5 lg:col-span-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">How a lead gets its score</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Each lead is scored by the most specific active model for its segment. Leads with no model, or unlike anything the model was trained on, use the rules engine.
      </p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-4 sm:gap-0">
        {overview.fallbackChain.map((step, index) => {
          const isFloor = step.resolvedVia === 'deterministic';
          const models = activeAt(step.resolvedVia);
          return (
            <li key={step.resolvedVia} className="flex items-center gap-2">
              <div className={`min-w-0 flex-1 rounded-lg border p-3 ${isFloor ? 'border-primary-tint-2 bg-primary-tint' : 'border-hairline bg-surface-muted'}`}>
                <p className="text-xs font-semibold text-ink">{step.label}</p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {isFloor
                    ? 'Always available'
                    : models.length === 0
                      ? 'No active model'
                      : models.map((model) => `${segmentLabel(model.segment_key)} v${model.version}`).join(', ')}
                </p>
              </div>
              {index < overview.fallbackChain.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-ink-muted sm:mx-1 sm:block" strokeWidth={2} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function LabelsCard({ labels, crmFeed }: { labels: LabelSummary; crmFeed: Overview['crmFeed'] }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Labelled outcomes</h3>
      <p className="mt-1 text-xs text-ink-muted">{labels.source.description}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="tabular text-2xl font-bold text-ink">{labels.total}</p>
        <p className="text-xs text-ink-soft">
          {labels.positives} approved · {labels.negatives} rejected
        </p>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {labels.trainable
          ? 'Enough to train a pooled model.'
          : `Training needs ${labels.minimums.rows}+ outcomes with ${labels.minimums.rowsPerClass}+ of each.`}
      </p>
      {!crmFeed.connected && (
        <p className="mt-3 rounded-lg border border-dashed border-hairline-strong bg-surface-muted p-2.5 text-[11px] text-ink-soft">{crmFeed.note}</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Training run detail — the candidate-vs-incumbent review.

function MetricRow({ label, candidate, incumbent, lowerIsBetter = false, primary = false }: { label: string; candidate: number | null; incumbent: number | null; lowerIsBetter?: boolean; primary?: boolean }) {
  const delta = candidate != null && incumbent != null ? candidate - incumbent : null;
  const better = delta == null || Math.abs(delta) < 1e-9 ? null : lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <tr className={primary ? 'bg-primary-tint/50 font-semibold' : ''}>
      <th scope="row" className="py-1.5 pr-3 text-left text-xs font-medium text-ink-soft">
        {label}
        {primary && <span className="ml-1.5 text-[10px] font-bold uppercase text-primary">primary</span>}
      </th>
      <td className="tabular py-1.5 pr-3 text-right text-sm text-ink">{formatMetric(candidate)}</td>
      <td className="tabular py-1.5 pr-3 text-right text-sm text-ink">{formatMetric(incumbent)}</td>
      <td className={`tabular py-1.5 text-right text-sm ${better == null ? 'text-ink-muted' : better ? 'text-success' : 'text-danger'}`}>{formatDelta(delta)}</td>
    </tr>
  );
}

function WeightBar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.min(50, (Math.abs(value) / max) * 50) : 0;
  return (
    <span className="relative block h-2 w-full rounded-full bg-surface-sunken" aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-hairline-strong" />
      <span
        className={`absolute inset-y-0 rounded-full ${value >= 0 ? 'bg-success' : 'bg-danger'}`}
        style={value >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
      />
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function RunDetail({ run, models, isAdmin, onChanged }: { run: TrainingRun; models: MlModel[]; isAdmin: boolean; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [confirmReject, setConfirmReject] = useState(false);
  const comparison = run.comparison;
  const candidateModel = models.find((model) => model.id === run.candidate_model_id) ?? null;
  const awaitingDecision = run.status === 'proposed' && candidateModel?.status === 'candidate';

  const promoteMutation = useMutation({
    mutationFn: () => promoteModel(run.candidate_model_id, note.trim() || undefined),
    onSuccess: () => {
      setNote('');
      onChanged();
    },
  });
  const rejectMutation = useMutation({
    mutationFn: () => retireModel(run.candidate_model_id, note.trim() || undefined),
    onSuccess: () => {
      setNote('');
      setConfirmReject(false);
      onChanged();
    },
  });
  const actionError = promoteMutation.error ?? rejectMutation.error;

  const status = RUN_STATUS[run.status] ?? { label: run.status, tone: 'neutral' as StatusTone };
  const weights = comparison?.featureWeights?.slice(0, 8) ?? [];
  const maxWeight = Math.max(0, ...weights.map((weight) => Math.abs(weight.candidate)));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">
            Training run #{run.id} · {segmentLabel(run.segment_key)}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {run.trigger_type} trigger · requested by {run.requested_by ?? '—'} · {formatDateTime(run.started_at)}
          </p>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      {run.status === 'failed' && (
        <div className="mt-4 rounded-lg border border-hairline bg-surface-muted p-3 text-sm text-ink-soft" role="status">
          {run.error_text}
        </div>
      )}

      {run.status === 'approved' && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-success-border bg-success-bg p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          Approved by {run.approved_by} on {formatDateTime(run.approved_at)} — {comparison?.candidate?.label.replace('Candidate', 'model')} is live for {segmentLabel(run.segment_key)}.
          {run.review_note && <span className="italic">“{run.review_note}”</span>}
        </p>
      )}
      {run.status === 'rejected' && (
        <p className="mt-4 rounded-lg border border-hairline bg-surface-muted p-3 text-sm text-ink-soft">
          Rejected by {run.rejected_by} on {formatDateTime(run.rejected_at)}.{run.review_note && <span className="italic"> “{run.review_note}”</span>}
        </p>
      )}

      {comparison?.candidate && comparison.incumbent && (
        <>
          <Section title={`${comparison.candidate.label} vs ${comparison.incumbent.label}, on ${comparison.data?.holdout?.n ?? '?'} held-out leads`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem]">
                <thead>
                  <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="pb-1.5 text-left font-semibold">Metric</th>
                    <th scope="col" className="pb-1.5 pr-3 text-right font-semibold">{comparison.candidate.label}</th>
                    <th scope="col" className="pb-1.5 pr-3 text-right font-semibold">{comparison.incumbent.label}</th>
                    <th scope="col" className="pb-1.5 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  <MetricRow primary label="ROC AUC" candidate={comparison.candidate.metrics.rocAuc} incumbent={comparison.incumbent.metrics.rocAuc} />
                  <MetricRow label="Precision (score ≥ 80)" candidate={comparison.candidate.metrics.precision} incumbent={comparison.incumbent.metrics.precision} />
                  <MetricRow label="Recall (score ≥ 80)" candidate={comparison.candidate.metrics.recall} incumbent={comparison.incumbent.metrics.recall} />
                  <MetricRow label="Balanced accuracy" candidate={comparison.candidate.metrics.balancedAccuracy} incumbent={comparison.incumbent.metrics.balancedAccuracy} />
                  <MetricRow label="Brier score (lower is better)" lowerIsBetter candidate={comparison.candidate.metrics.brier} incumbent={comparison.incumbent.metrics.brier} />
                </tbody>
              </table>
            </div>
            {comparison.incumbent.note && <p className="mt-2 text-xs text-ink-muted">{comparison.incumbent.note}</p>}
          </Section>

          {comparison.gate && (
            <Section title="Promotion gate">
              <ul className="grid gap-2">
                {comparison.gate.checks.map((check) => (
                  <li key={check.name} className="flex gap-2 text-sm">
                    {check.passed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2} aria-label="Passed" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={2} aria-label="Failed" />
                    )}
                    <span>
                      <span className="font-medium text-ink">{check.label}</span>
                      <span className="block text-xs text-ink-muted">{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(comparison.segments?.length ?? 0) > 0 && (
            <Section title="By segment (holdout)">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-ink-muted">
                      <th scope="col" className="pb-1.5 text-left font-semibold">Segment</th>
                      <th scope="col" className="pb-1.5 pr-3 text-right font-semibold">Leads (✓/✗)</th>
                      <th scope="col" className="pb-1.5 pr-3 text-right font-semibold">Candidate AUC</th>
                      <th scope="col" className="pb-1.5 pr-3 text-right font-semibold">Incumbent AUC</th>
                      <th scope="col" className="pb-1.5 text-right font-semibold">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.segments!.map((segment) => (
                      <tr key={segment.segmentKey} className="border-b border-hairline last:border-0">
                        <td className="py-1.5 pr-3 text-ink">{segmentLabel(segment.segmentKey)}</td>
                        <td className="tabular py-1.5 pr-3 text-right text-ink-soft">{segment.n} ({segment.positives}/{segment.negatives})</td>
                        <td className="tabular py-1.5 pr-3 text-right">{formatMetric(segment.candidate)}</td>
                        <td className="tabular py-1.5 pr-3 text-right">{formatMetric(segment.incumbent)}</td>
                        <td className={`py-1.5 text-right ${!segment.evaluable ? 'text-ink-muted' : segment.passed ? 'text-success' : 'text-danger'}`}>
                          {!segment.evaluable ? 'Too few leads' : segment.passed ? 'OK' : 'Regressed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {weights.length > 0 && (
            <Section title="What the candidate learned (standardized weights)">
              <ul className="grid gap-1.5">
                {weights.map((weight) => (
                  <li key={weight.feature} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                    <span className="truncate text-ink-soft" title={weight.label}>{weight.label}</span>
                    <WeightBar value={weight.candidate} max={maxWeight} />
                    <span className="tabular w-28 text-right text-ink">
                      {formatDelta(weight.candidate)}
                      {weight.change != null && <span className="text-ink-muted"> ({formatDelta(weight.change)})</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-muted">
                Green pushes a lead toward “proceed”, red toward “reject”.{weights.some((weight) => weight.change != null) && ' Brackets show the change from the active model.'}
              </p>
            </Section>
          )}

          <Section title="Data">
            <p className="text-xs text-ink-soft">
              {comparison.data?.n} labelled leads — trained on {comparison.data?.train?.n} ({comparison.data?.train?.positives} approved / {comparison.data?.train?.negatives} rejected), evaluated on {comparison.data?.holdout?.n} ({comparison.data?.holdout?.positives} / {comparison.data?.holdout?.negatives}). Labels from {formatDateTime(run.label_window_start)} to {formatDateTime(run.label_window_end)}.
            </p>
            {(comparison.caveats?.length ?? 0) > 0 && (
              <ul className="mt-2 grid gap-1">
                {comparison.caveats!.map((caveat) => (
                  <li key={caveat} className="flex gap-2 text-[11px] text-ink-muted">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                    {caveat}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {awaitingDecision && (
        <div className="mt-6 grid gap-3 rounded-xl border border-warning-border bg-warning-bg/40 p-4">
          <p className="text-sm font-semibold text-ink">Approve this model to start scoring {segmentLabel(run.segment_key)} leads with it?</p>
          <p className="text-xs text-ink-soft">
            It replaces {comparison?.incumbent?.label ?? 'the current scorer'} for this segment. Scores change only when leads are next qualified, and each change is recorded in that lead’s decision trail.
          </p>
          <div>
            <label htmlFor={`ml-review-note-${run.id}`} className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Note (optional)</label>
            <textarea
              id={`ml-review-note-${run.id}`}
              className="mt-1.5 h-16 w-full resize-none rounded-lg border border-hairline-strong bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {!isAdmin && <p className="text-xs text-ink-muted">Sign in as an admin to approve or reject.</p>}
          {actionError && <p className="text-xs font-semibold text-danger" role="alert">{errorMessage(actionError)}</p>}
          {confirmReject ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-danger">Reject and retire this candidate?</p>
              <Button type="button" variant="secondary" onClick={() => setConfirmReject(false)}>Cancel</Button>
              <Button type="button" variant="danger" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm reject'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button type="button" disabled={!isAdmin || promoteMutation.isPending} onClick={() => promoteMutation.mutate()}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {promoteMutation.isPending ? 'Approving…' : 'Approve & make live'}
              </Button>
              <Button type="button" variant="danger" disabled={!isAdmin} onClick={() => setConfirmReject(true)}>
                <XCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> Reject
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Runs list + manual trigger, and the registry table.

function RunsPanel({
  runs,
  selectedRunId,
  onSelect,
  segmentOptions,
  isAdmin,
  onTrained,
}: {
  runs: TrainingRun[];
  selectedRunId: number | null;
  onSelect: (id: number) => void;
  segmentOptions: { value: string; label: string }[];
  isAdmin: boolean;
  onTrained: (run: TrainingRun) => void;
}) {
  const [segmentKey, setSegmentKey] = useState('__pooled__');
  const trainMutation = useMutation({
    mutationFn: () => startTrainingRun(segmentKey) as Promise<TrainingRun>,
    onSuccess: onTrained,
  });

  return (
    <Card className="flex flex-col p-0">
      <div className="grid gap-3 border-b border-hairline p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Training runs</h3>
        <div className="flex flex-wrap items-end gap-2">
          <Select id="ml-train-segment" label="Segment" value={segmentKey} onChange={(event) => setSegmentKey(event.target.value)}>
            {segmentOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <Button type="button" disabled={!isAdmin || trainMutation.isPending} onClick={() => trainMutation.mutate()}>
            {trainMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            )}
            {trainMutation.isPending ? 'Training…' : 'Run retraining'}
          </Button>
        </div>
        {!isAdmin && <p className="text-[11px] text-ink-muted">Admin sign-in required to start a run.</p>}
        {trainMutation.isError && <p className="text-xs font-semibold text-danger" role="alert">{errorMessage(trainMutation.error)}</p>}
      </div>

      {runs.length === 0 ? (
        <div className="grid justify-items-center gap-2 p-8 text-center">
          <Inbox className="h-6 w-6 text-ink-muted" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm text-ink-muted">No training runs yet.</p>
        </div>
      ) : (
        <ul className="max-h-[32rem] overflow-y-auto" aria-label="Training runs">
          {runs.map((run) => {
            const status = RUN_STATUS[run.status] ?? { label: run.status, tone: 'neutral' as StatusTone };
            const selected = run.id === selectedRunId;
            return (
              <li key={run.id}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(run.id)}
                  className={`flex w-full items-start justify-between gap-2 border-b border-hairline px-4 py-3 text-left transition-colors ${selected ? 'bg-primary-tint' : 'hover:bg-surface-muted'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">#{run.id} · {segmentLabel(run.segment_key)}</span>
                    <span className="block text-[11px] text-ink-muted">{run.trigger_type} · {formatDateTime(run.started_at)}</span>
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RegistryCard({ models, isAdmin, onChanged }: { models: MlModel[]; isAdmin: boolean; onChanged: () => void }) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const retireMutation = useMutation({
    mutationFn: (id: number) => retireModel(id, 'Retired from the model registry.'),
    onSuccess: () => {
      setConfirmId(null);
      onChanged();
    },
  });

  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Model registry</h3>
      {models.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No models trained yet — every lead is scored by the rules engine.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-ink-muted">
                <th scope="col" className="pb-2 text-left font-semibold">Segment</th>
                <th scope="col" className="pb-2 text-left font-semibold">Version</th>
                <th scope="col" className="pb-2 text-left font-semibold">Status</th>
                <th scope="col" className="pb-2 text-right font-semibold">Holdout AUC</th>
                <th scope="col" className="pb-2 pl-4 text-left font-semibold">Trained</th>
                <th scope="col" className="pb-2 text-left font-semibold">Live from / until</th>
                <th scope="col" className="pb-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id} className="border-b border-hairline last:border-0">
                  <td className="py-2 pr-3 text-ink">{segmentLabel(model.segment_key)}</td>
                  <td className="py-2 pr-3 text-ink-soft">v{model.version}</td>
                  <td className="py-2 pr-3"><StatusBadge tone={MODEL_STATUS_TONE[model.status] ?? 'neutral'}>{model.status}</StatusBadge></td>
                  <td className="tabular py-2 text-right text-ink">{formatMetric(model.metrics?.holdout?.rocAuc)}</td>
                  <td className="py-2 pl-4 pr-3 text-xs text-ink-soft">{formatDateTime(model.trained_at)}</td>
                  <td className="py-2 pr-3 text-xs text-ink-soft">
                    {model.promoted_at ? formatDateTime(model.promoted_at) : '—'}
                    {model.retired_at && ` → ${formatDateTime(model.retired_at)}`}
                  </td>
                  <td className="py-2 text-right">
                    {model.status === 'active' && isAdmin && (confirmId === model.id ? (
                      <span className="inline-flex gap-2">
                        <Button type="button" variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                        <Button type="button" variant="danger" disabled={retireMutation.isPending} onClick={() => retireMutation.mutate(model.id)}>Confirm retire</Button>
                      </span>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => setConfirmId(model.id)}>Retire</Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {retireMutation.isError && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{errorMessage(retireMutation.error)}</p>}
    </Card>
  );
}

function ModelMaintenance() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hasToken, setHasToken] = useState(Boolean(getToken()));

  const overviewQuery = useQuery({ queryKey: ['ml-overview'], queryFn: () => fetchMlOverview() as Promise<Overview> });
  const runsQuery = useQuery({ queryKey: ['ml-training-runs'], queryFn: () => fetchTrainingRuns({ limit: 50 }) as Promise<{ runs: TrainingRun[] }> });
  const modelsQuery = useQuery({ queryKey: ['ml-models'], queryFn: () => fetchMlModels() as Promise<{ models: MlModel[] }> });
  const sessionQuery = useQuery({
    queryKey: ['ml-admin-session', hasToken],
    queryFn: () => fetchCurrentUser() as Promise<CurrentUser>,
    enabled: hasToken,
    retry: false,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['ml-overview'] });
    queryClient.invalidateQueries({ queryKey: ['ml-training-runs'] });
    queryClient.invalidateQueries({ queryKey: ['ml-models'] });
  };

  const session = hasToken && sessionQuery.isSuccess ? sessionQuery.data : null;
  const isAdmin = session?.role?.role_name === 'Admin';
  const runs = runsQuery.data?.runs ?? [];
  const models = modelsQuery.data?.models ?? [];
  const requestedRunId = Number(searchParams.get('run')) || null;
  const selectedRun = runs.find((run) => run.id === requestedRunId) ?? runs[0] ?? null;

  const segmentOptions = [
    { value: '__pooled__', label: `All segments (pooled) — ${overviewQuery.data?.labels.total ?? 0} outcomes` },
    ...(overviewQuery.data?.labels.bySector ?? []).map((sector) => ({ value: sector.segmentKey, label: `${titleCase(sector.sector)} — ${sector.total} outcomes` })),
  ];

  const loading = overviewQuery.isLoading || runsQuery.isLoading || modelsQuery.isLoading;
  const loadError = overviewQuery.error ?? runsQuery.error ?? modelsQuery.error;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
            <BrainCircuit className="h-6 w-6 text-primary" strokeWidth={2} aria-hidden="true" /> Model Maintenance
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            The agent retrains the qualification model on real outcomes and proposes it here. Nothing goes live until an admin approves it, and the rules engine stays as the fallback.
          </p>
        </div>
        <AdminSession
          session={session}
          onChanged={() => {
            setHasToken(Boolean(getToken()));
            queryClient.invalidateQueries({ queryKey: ['ml-admin-session'] });
          }}
        />
      </div>

      {loading && (
        <Card className="flex items-center gap-3 p-8 text-sm text-ink-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" /> Loading model registry…
        </Card>
      )}

      {!loading && loadError && (
        <Card className="grid justify-items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm font-semibold text-danger">Couldn&apos;t load the model registry</p>
          <p className="max-w-sm text-xs text-ink-muted">{errorMessage(loadError)}</p>
          <Button type="button" variant="secondary" onClick={refreshAll}>Retry</Button>
        </Card>
      )}

      {!loading && !loadError && overviewQuery.data && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <ScoringPathCard overview={overviewQuery.data} />
            <LabelsCard labels={overviewQuery.data.labels} crmFeed={overviewQuery.data.crmFeed} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <RunsPanel
              runs={runs}
              selectedRunId={selectedRun?.id ?? null}
              onSelect={(id) => setSearchParams({ run: String(id) })}
              segmentOptions={segmentOptions}
              isAdmin={isAdmin}
              onTrained={(run) => {
                refreshAll();
                setSearchParams({ run: String(run.id) });
              }}
            />
            {selectedRun ? (
              <RunDetail key={selectedRun.id} run={selectedRun} models={models} isAdmin={isAdmin} onChanged={refreshAll} />
            ) : (
              <Card className="grid justify-items-center gap-2 p-10 text-center text-sm text-ink-muted">
                Run retraining to train a first candidate. It will be compared against the rules engine on held-out leads.
              </Card>
            )}
          </div>

          <RegistryCard models={models} isAdmin={isAdmin} onChanged={refreshAll} />
        </>
      )}
    </div>
  );
}

export default ModelMaintenance;
