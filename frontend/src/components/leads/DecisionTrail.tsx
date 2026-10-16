import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bot, BrainCircuit, Loader2, Scale, Settings2, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Card from '../ui/Card';
import StatusBadge from '../ui/StatusBadge';
import type { StatusTone } from '../ui/StatusBadge';
import { fetchLeadDecisionTrail } from '../../services/leadsApi';

// Timeline of every decision taken on one lead — rules engine, AI and
// human reviewers — from GET /api/leads/:id/decision-trail
// (backend/src/services/decisionTrailService.js). Shows who decided what,
// when, and why, so the human-in-the-loop handoffs are visible rather than
// collapsed into a single latest status.

interface DecisionEvent {
  id: number | string;
  eventType: string;
  actorType: 'RULES' | 'MODEL' | 'AI' | 'HUMAN' | 'SYSTEM';
  actor: string | null;
  decision: string | null;
  comment: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  derived: boolean;
}

interface DecisionTrailResponse {
  tenderId: string;
  events: DecisionEvent[];
  hasDerivedEvents: boolean;
}

const EVENT_TITLE: Record<string, string> = {
  QUALIFIED: 'Scored by rules engine',
  QUALIFICATION_FAILED: 'Qualification failed',
  AI_ADVISORY: 'AI advisory analysis',
  PROPOSAL_GENERATED: 'Proposal drafted by AI',
  PROPOSAL_REVIEWED: 'Proposal reviewed',
  COMMUNICATION_PREPARED: 'Outreach draft prepared',
  COMMUNICATION_REVIEWED: 'Outreach reviewed',
};

const ACTOR: Record<DecisionEvent['actorType'], { icon: LucideIcon; label: string; className: string }> = {
  RULES: { icon: Scale, label: 'Rules engine', className: 'bg-primary-tint text-primary' },
  MODEL: { icon: BrainCircuit, label: 'Qualification model', className: 'bg-primary text-ink-inverse' },
  AI: { icon: Bot, label: 'AI', className: 'bg-accent-soft text-ink' },
  HUMAN: { icon: UserCheck, label: 'Human reviewer', className: 'bg-success-bg text-success' },
  SYSTEM: { icon: Settings2, label: 'System', className: 'bg-surface-sunken text-ink-soft' },
};

const DECISION_TONE: Record<string, StatusTone> = {
  QUALIFIED_GOOD: 'success',
  QUALIFIED_HITL: 'warning',
  QUALIFIED_BAD: 'danger',
  APPROVED: 'success',
  APPROVE: 'success',
  AWAITING_SEND_APPROVAL: 'success',
  CHANGES_REQUESTED: 'warning',
  NEEDS_HUMAN_REVIEW: 'warning',
  ON_HOLD: 'neutral',
  REJECTED: 'danger',
  REJECT: 'danger',
  UNAVAILABLE: 'neutral',
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** One-line summary of the numeric details worth showing inline. */
function detailSummary(event: DecisionEvent): string | null {
  const d = event.details ?? {};
  const parts: string[] = [];
  if (typeof d.score === 'number') parts.push(`score ${d.score}`);
  if (d.scoreSource === 'model' && typeof d.deterministicScore === 'number') parts.push(`rules engine ${d.deterministicScore}`);
  if (typeof d.previousScore === 'number' && d.previousScore !== d.score) {
    parts.push(`was ${d.previousScore}${typeof d.previousScoredBy === 'string' ? ` by ${d.previousScoredBy}` : ''}`);
  }
  // Only worth showing when a model existed but wasn't used for this lead.
  if (d.scoreSource === 'rules' && typeof d.fallbackReason === 'string' && !d.fallbackReason.startsWith('No active model')) {
    parts.push(d.fallbackReason);
  }
  if (typeof d.confidence === 'number') parts.push(`confidence ${d.confidence}`);
  if (typeof d.proposalScore === 'number') parts.push(`proposal score ${d.proposalScore}`);
  if (typeof d.recommendedProduct === 'string') parts.push(d.recommendedProduct);
  if (typeof d.recommendedNextAction === 'string') parts.push(`next: ${d.recommendedNextAction}`);
  if (typeof d.error === 'string') parts.push(d.error);
  return parts.length ? parts.join(' · ') : null;
}

export default function DecisionTrail({ tenderId, className }: { tenderId: string; className?: string }) {
  const query = useQuery({
    queryKey: ['lead-decision-trail', tenderId],
    queryFn: () => fetchLeadDecisionTrail(tenderId) as Promise<DecisionTrailResponse>,
  });

  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Decision Trail</h3>
      <p className="mt-1 text-xs text-ink-muted">Every decision on this lead, by the rules engine, the AI and human reviewers.</p>

      {query.isLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2} aria-hidden="true" />
          Loading decision trail…
        </p>
      )}

      {query.isError && (
        <p className="mt-4 flex items-center gap-2 text-sm text-danger" role="alert">
          <AlertTriangle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Couldn&apos;t load the decision trail.
        </p>
      )}

      {query.isSuccess && query.data.events.length === 0 && (
        <p className="mt-4 text-sm text-ink-muted">No decisions recorded yet — this lead hasn&apos;t been qualified.</p>
      )}

      {query.isSuccess && query.data.events.length > 0 && (
        <>
          <ol className="mt-4 grid gap-0">
            {query.data.events.map((event, index) => {
              const actor = ACTOR[event.actorType] ?? ACTOR.SYSTEM;
              const Icon = actor.icon;
              const isLast = index === query.data.events.length - 1;
              const summary = detailSummary(event);
              return (
                <li key={event.id} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-4">
                  {!isLast && <span className="absolute left-4 top-8 bottom-0 w-px bg-hairline-strong" aria-hidden="true" />}
                  <span className={`relative grid h-8 w-8 place-items-center rounded-full ${actor.className}`}>
                    <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    <span className="sr-only">{actor.label}</span>
                  </span>
                  <div className="min-w-0 pt-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-ink">{event.eventType === 'QUALIFIED' && event.actorType === 'MODEL' ? 'Scored by qualification model' : EVENT_TITLE[event.eventType] ?? event.eventType}</p>
                      {event.decision && <StatusBadge tone={DECISION_TONE[event.decision] ?? 'info'}>{event.decision}</StatusBadge>}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {event.actor || actor.label} · <time dateTime={event.createdAt}>{formatTimestamp(event.createdAt)}</time>
                      {event.derived && ' · reconstructed'}
                    </p>
                    {summary && <p className="mt-1 text-xs text-ink-soft">{summary}</p>}
                    {event.comment && (
                      <blockquote className="mt-1.5 border-l-2 border-hairline-strong pl-2 text-xs italic text-ink-soft">“{event.comment}”</blockquote>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {query.data.hasDerivedEvents && (
            <p className="text-[11px] text-ink-muted">
              Steps marked “reconstructed” happened before full audit logging was enabled and are rebuilt from the lead&apos;s latest saved state, so earlier intermediate decisions may be missing.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
