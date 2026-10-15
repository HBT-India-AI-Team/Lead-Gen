import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  Loader2,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import { ScoreBreakdownToggle, ScoreBreakdownPanel } from '../components/leads/ScoreBreakdown';
import type { QualificationFactors } from '../components/leads/ScoreBreakdown';
import { fetchLeads, fetchLeadProposal, reviewLeadProposal } from '../services/leadsApi';
import { formatDate, tenderTitleFrom, tenderLocation } from '../utils/tenderFormatters';

// Real `tenders` row shape as returned by GET /api/leads — every field here
// is a real column (see src/repositories/tenderRepository.js); the
// qualification_* columns only ever get set by the real PHASE 1 pipeline
// (src/services/leadQualificationPipelineService.js), never invented here.
interface Lead {
  tender_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  location: string | null;
  tender_city: string | null;
  tender_state: string | null;
  amount: string | null;
  contract_date: string | null;
  winning_company_name: string | null;
  winning_bid_amount: string | null;
  pipeline_status: string;
  lead_status: string;
  qualification_score: number | null;
  // Real per-tender proposal funnel state, already computed server-side by
  // GET /api/leads (leadController.list -> getProposalStateByTenderIds) —
  // not a new field, just newly read here. This is what lets the sidebar
  // tell "genuinely pending" apart from "already decided" without touching
  // pipeline_status (see the QueueList/isDecided note below for why that
  // distinction can't come from pipeline_status itself).
  proposal_status: string | null;
  // factors is the same real per-tender breakdown qualificationScoringService.js
  // computes and tenderRepository already persists into this exact column
  // (see leadQualificationPipelineService.js's saveQualificationResult call) —
  // GET /api/leads already returns it on every row today, this just types the
  // fields the sidebar's compact grid reads (probe42Availability/creditRating/
  // revenueStrength/netProfitStrength/complianceStatus), no new backend work.
  // Real per-lead facts, distinct from the four admin-set Settings score
  // cutoffs (Financial Health/Credit Rating/Compliance/Business Vintage) —
  // those are category-wide thresholds, checked live per-company only in
  // Settings' own "Check a Company" lookup panel, not surfaced per-lead
  // here.
  qualification_reason: {
    aiAnalysis?: {
      status: string;
      score?: number;
      classification?: string;
      confidence?: number;
      reasoning?: string;
      positiveSignals?: string[];
      riskFactors?: string[];
    };
    factors?: QualificationFactors;
  } | null;
}

interface LeadsResponse {
  tenders: Lead[];
  pagination: { total: number };
}

// Real PHASE 3 GET /api/leads/:id/proposal response shape (see
// proposalPipelineService.toProposalReviewShape()) — only fields actually
// persisted on `tender_proposals` are ever present; a proposal not yet
// reviewed genuinely has reviewComment/reviewedBy/reviewedAt all null.
interface ProposalReview {
  tenderId: string;
  proposalStatus: string;
  recommendedProduct: { name: string; reason: string } | null;
  estimatedFundingRequirement: { amount: number | null; currency: string; basis: string } | null;
  proposalScore: number | null;
  rationale: string[];
  missingInformation: string[];
  emailDraft: { subject: string | null; body: string | null };
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

const REVIEW_DECISIONS = [
  { value: 'APPROVED', label: 'Approve', icon: CheckCircle2, variant: 'primary' as const, confirm: false },
  { value: 'CHANGES_REQUESTED', label: 'Request Changes', icon: ClipboardCheck, variant: 'secondary' as const, confirm: false },
  { value: 'REJECTED', label: 'Reject', icon: XCircle, variant: 'danger' as const, confirm: true },
  { value: 'ON_HOLD', label: 'Put On Hold', icon: PauseCircle, variant: 'secondary' as const, confirm: false },
] as const;

const PROPOSAL_STATUS_TONE: Record<string, StatusTone> = {
  READY_FOR_REVIEW: 'info',
  NEEDS_HUMAN_REVIEW: 'warning',
  APPROVED: 'success',
  CHANGES_REQUESTED: 'warning',
  REJECTED: 'danger',
  ON_HOLD: 'neutral',
};

const QUALIFICATION_TONE: Record<string, StatusTone> = {
  QUALIFIED_GOOD: 'success',
  QUALIFIED_HITL: 'warning',
  QUALIFIED_BAD: 'danger',
};

// Short chip text for the sidebar grid — real enum values, not the spec's
// "Good/Bad/On Hold" wording: QUALIFIED_HITL means "needs human/expert
// review" (why the lead is in this queue at all), not "on hold", so the
// real label is kept rather than substituting an inaccurate one.
const QUALIFICATION_SHORT_LABEL: Record<string, string> = {
  QUALIFIED_GOOD: 'GOOD',
  QUALIFIED_HITL: 'HITL',
  QUALIFIED_BAD: 'BAD',
};

const TERMINAL_STATUSES = ['APPROVED', 'REJECTED'];

// Compact credit-rating readout for the sidebar grid — qualificationScoringService.js's
// scoreCreditRating() already returns just the raw agency letter grade (e.g.
// "AA-") as label, so this only needs to pick it off the factor. Returns null
// when no Probe42 profile matched this lead's winning company at all — shown
// as "—" by the caller, never a guessed rating.
function creditRatingShort(lead: Lead): string | null {
  const factor = lead.qualification_reason?.factors?.creditRating;
  if (!factor?.matched) return null;
  return factor.label;
}

// KNOWN BACKEND GAP (not fixed here — UI-only change): this queue is fetched
// with pipeline_status=AWAITING_PROPOSAL_REVIEW (see HumanReview()'s
// queueQuery below), and nothing in proposalPipelineService.reviewProposal /
// tenderProposalRepository.recordProposalReview ever advances
// tenders.pipeline_status once a decision is recorded — only
// tender_proposals.status changes. So a decided lead never actually leaves
// this query's result set; pipeline_status alone cannot tell "genuinely
// pending" apart from "already decided". proposal_status (real, already
// returned per-row by GET /api/leads) is used below purely to *display* that
// distinction correctly given the data as it exists today. The real fix is a
// pipeline_status transition on review, out of scope for this change.
function isDecided(lead: Lead) {
  return TERMINAL_STATUSES.includes(lead.proposal_status ?? '');
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-sm font-medium text-ink">{value ?? <span className="text-ink-muted">—</span>}</p>
    </div>
  );
}

function QueueList({
  leads,
  selectedTenderId,
  onSelect,
}: {
  leads: Lead[];
  selectedTenderId: string | null;
  onSelect: (tenderId: string) => void;
}) {
  const pendingCount = leads.filter((lead) => !isDecided(lead)).length;
  const decidedCount = leads.length - pendingCount;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <ClipboardCheck className="h-4 w-4" strokeWidth={2} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Awaiting Review ({pendingCount} pending{decidedCount > 0 ? ` · ${decidedCount} decided` : ''})
        </p>
      </div>
      <ul className="max-h-[560px] divide-y divide-hairline overflow-y-auto">
        {leads.map((lead) => {
          const isSelected = lead.tender_id === selectedTenderId;
          const decided = isDecided(lead);
          return (
            <li key={lead.tender_id}>
              {/* Selected queue item carries the ledger accent bar — same
                  signature as the active Sidebar nav item and headline stat
                  cards, so "this is the one you're on" reads consistently
                  across the whole app. Decided items are dimmed and labeled
                  so they read as "kept for reference", not "still pending". */}
              <button
                type="button"
                onClick={() => onSelect(lead.tender_id)}
                className={`ledger block w-full px-4 py-3 pl-[19px] text-left transition-colors ${isSelected ? 'bg-primary-tint' : 'ledger-muted hover:bg-primary-tint/40'} ${decided ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">
                    {lead.winning_company_name || tenderTitleFrom(lead)}
                  </p>
                  {decided && (
                    <StatusBadge tone={PROPOSAL_STATUS_TONE[lead.proposal_status ?? ''] ?? 'neutral'} className="shrink-0">
                      {lead.proposal_status}
                    </StatusBadge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{lead.tender_id}</p>
                {lead.qualification_score != null && (
                  // Compact 3-column glance grid: real Qualification Score +
                  // real Probe42 credit rating (when a profile matched this
                  // lead's winning company) + a status chip — not the four
                  // Settings score cutoffs (Financial Health/Credit Rating/
                  // Compliance/Business Vintage), which are a single
                  // category-wide admin setting, so showing them here would
                  // repeat the same cutoff number on every card rather than
                  // this lead's own data.
                  <div className="mt-2 grid grid-cols-[auto_auto_1fr] items-center gap-x-3 rounded-lg border border-hairline bg-surface-muted px-2.5 py-1.5">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-ink-muted">Score</p>
                      <p className="tabular text-sm font-bold leading-none text-ink">{lead.qualification_score}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-ink-muted">Probe42</p>
                      <p className="tabular text-sm font-bold leading-none text-ink">{creditRatingShort(lead) ?? '—'}</p>
                    </div>
                    <StatusBadge tone={QUALIFICATION_TONE[lead.lead_status] ?? 'neutral'} className="justify-self-end">
                      {QUALIFICATION_SHORT_LABEL[lead.lead_status] ?? lead.lead_status}
                    </StatusBadge>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ProposalReviewPanel({ lead, tenderId }: { lead: Lead; tenderId: string }) {
  const queryClient = useQueryClient();
  const [reviewComment, setReviewComment] = useState('');
  const [pendingDecision, setPendingDecision] = useState<string | null>(null);
  const [scoreBreakdownExpanded, setScoreBreakdownExpanded] = useState(false);

  const proposalQuery = useQuery({
    queryKey: ['lead-proposal', tenderId],
    queryFn: () => fetchLeadProposal(tenderId) as Promise<ProposalReview>,
  });

  const reviewMutation = useMutation({
    mutationFn: (decision: string) => reviewLeadProposal(tenderId, { decision, reviewComment: reviewComment.trim() || undefined }) as Promise<ProposalReview>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-proposal', tenderId] });
      queryClient.invalidateQueries({ queryKey: ['human-review-queue'] });
      setPendingDecision(null);
      setReviewComment('');
    },
  });

  const aiAnalysis = lead.qualification_reason?.aiAnalysis;

  if (proposalQuery.isLoading) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          Loading proposal…
        </div>
      </Card>
    );
  }

  if (proposalQuery.isError) {
    const status = (proposalQuery.error as { status?: number })?.status;
    return (
      <Card className="grid justify-items-center gap-3 p-10 text-center">
        <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
        <p className="text-sm font-semibold text-danger">
          {status === 404 ? 'No generated proposal found for this lead.' : "Couldn't load this proposal"}
        </p>
        <p className="max-w-sm text-xs text-ink-muted">
          {proposalQuery.error instanceof Error ? proposalQuery.error.message : 'An unexpected error occurred.'}
        </p>
        <Button type="button" variant="secondary" onClick={() => proposalQuery.refetch()}>Retry</Button>
      </Card>
    );
  }

  const proposal = proposalQuery.data!;
  const isFinal = TERMINAL_STATUSES.includes(proposal.proposalStatus);

  return (
    <div className="grid gap-6">
      {/* Qualification vs. AI Advisory — this comparison IS the reviewer's
          decision, so it leads the page and carries the strongest visual
          weight on screen (accent bar + larger score), not just another
          card in the stack. The authority gap between the two scores is
          reinforced structurally: the deterministic score sits in the
          card's main body, the advisory score is boxed and indented inside
          it as a subordinate annotation — never a sibling card of equal
          weight. Both honesty labels are preserved verbatim. */}
      <Card accent className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Qualification (Deterministic — Authoritative)</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Qualification Score</p>
            <div className="mt-1 flex items-center gap-1.5">
              <p className="tabular text-2xl font-bold text-ink">
                {lead.qualification_score ?? <span className="text-base font-medium text-ink-muted">—</span>}
              </p>
              {lead.qualification_score != null && (
                <ScoreBreakdownToggle expanded={scoreBreakdownExpanded} onToggle={() => setScoreBreakdownExpanded((value) => !value)} />
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Lead Status</p>
            <StatusBadge tone={QUALIFICATION_TONE[lead.lead_status] ?? 'neutral'} className="mt-1.5">{lead.lead_status}</StatusBadge>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pipeline Status</p>
            <StatusBadge tone="info" className="mt-1.5">{lead.pipeline_status}</StatusBadge>
          </div>
        </div>

        {lead.qualification_score != null && scoreBreakdownExpanded && (
          <div className="mt-3">
            <ScoreBreakdownPanel factors={lead.qualification_reason?.factors} />
          </div>
        )}

        {aiAnalysis && (
          <div className="mt-4 ml-1 rounded-xl border border-dashed border-hairline-strong bg-surface-muted p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
              AI Advisory Analysis
            </p>
            {aiAnalysis.status === 'AVAILABLE' ? (
              <div className="mt-2 grid gap-2">
                <p className="text-xs text-ink-soft">
                  Advisory score {aiAnalysis.score} · {aiAnalysis.classification} · confidence {aiAnalysis.confidence}
                </p>
                {aiAnalysis.reasoning && <p className="text-sm text-ink-soft">{aiAnalysis.reasoning}</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">AI advisory analysis unavailable for this lead.</p>
            )}
          </div>
        )}
      </Card>

      {/* Company / Tender — supporting metadata for the decision above, not
          part of it; visually secondary (no accent, plain cards) and placed
          after the qualification comparison rather than before it. No
          "Industry" field is shown since none is persisted anywhere this
          screen can read (the evidence bundle that had one was never
          stored, only used to build the Ollama prompt). */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Company</h3>
          <div className="mt-4 grid gap-4">
            <Field label="Company Name" value={lead.winning_company_name} />
            <Field label="Location" value={tenderLocation(lead) === '—' ? null : tenderLocation(lead)} />
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Tender</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tender Title" value={tenderTitleFrom(lead)} />
            <Field label="Tender Value" value={lead.amount} />
            <Field label="Winning Company" value={lead.winning_company_name} />
            <Field label="Winning Bid" value={lead.winning_bid_amount} />
            <Field label="Category" value={lead.category} />
            <Field label="Tender Date" value={lead.contract_date ? formatDate(lead.contract_date.slice(0, 10)) : null} />
          </div>
        </Card>
      </div>

      {/* Proposal */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Proposal</h3>
          <StatusBadge tone={PROPOSAL_STATUS_TONE[proposal.proposalStatus] ?? 'neutral'}>{proposal.proposalStatus}</StatusBadge>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Recommended Product"
            value={proposal.recommendedProduct ? proposal.recommendedProduct.name : 'Not confidently identified'}
          />
          <Field label="Proposal Score" value={proposal.proposalScore} />
        </div>
        {proposal.recommendedProduct?.reason && (
          <p className="mt-2 text-sm text-ink-soft">{proposal.recommendedProduct.reason}</p>
        )}

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Estimated Funding Requirement</p>
          <p className="tabular mt-1 text-sm font-medium text-ink">
            {proposal.estimatedFundingRequirement?.amount != null
              ? `₹${proposal.estimatedFundingRequirement.amount.toLocaleString('en-IN')}`
              : 'Not estimated'}
          </p>
          {proposal.estimatedFundingRequirement?.basis && (
            <p className="mt-0.5 text-xs text-ink-muted">{proposal.estimatedFundingRequirement.basis}</p>
          )}
        </div>

        {proposal.rationale.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Rationale</p>
            <ul className="mt-2 grid gap-1 text-sm text-ink">
              {proposal.rationale.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-ink-muted">•</span> {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal.missingInformation.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Missing Information</p>
            {/* Deliberately not StatusBadge (solid fill, used for states/
                actions elsewhere on this page) — a dashed outline + muted
                icon reads as "data we don't have", not a status or a
                clickable action, distinguishing it from the pipeline/
                qualification/proposal badges above. */}
            <div className="mt-2 flex flex-wrap gap-2">
              {proposal.missingInformation.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-hairline-strong bg-surface px-2.5 py-1 text-xs font-medium leading-none text-ink-muted"
                >
                  <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-hairline bg-surface-muted p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Email Draft (not sent automatically)</p>
          <p className="mt-2 text-sm font-semibold text-ink">{proposal.emailDraft.subject || '—'}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{proposal.emailDraft.body || '—'}</p>
        </div>
      </Card>

      {/* Expert decision */}
      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Expert Decision</h3>

        {isFinal ? (
          <div className="mt-4 grid gap-3">
            {/* justify-self-start: this badge is a direct child of a `grid`
                container, which stretches items to fill the row width by
                default (CSS Grid's justify-items: stretch) — without this,
                StatusBadge's own compact inline-flex sizing gets overridden
                and it renders as a full-width bar instead of a pill. */}
            <StatusBadge tone={PROPOSAL_STATUS_TONE[proposal.proposalStatus] ?? 'neutral'} className="justify-self-start">
              {proposal.proposalStatus}
            </StatusBadge>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Reviewed By" value={proposal.reviewedBy} />
              <Field label="Review Date" value={proposal.reviewedAt ? formatDate(proposal.reviewedAt.slice(0, 10)) : null} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Review Comment</p>
              <p className="mt-1 text-sm text-ink">{proposal.reviewComment || <span className="text-ink-muted">No comment left.</span>}</p>
            </div>
            {proposal.proposalStatus === 'APPROVED' && (
              <Link to={`/communication?tenderId=${encodeURIComponent(tenderId)}`} className="no-underline">
                <Button type="button" variant="secondary" className="w-fit">Go to Communication</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            {(proposal.reviewedBy || proposal.reviewComment) && (
              <div className="rounded-lg border border-hairline bg-surface-muted p-3 text-xs text-ink-soft">
                Last decision: <span className="font-semibold">{proposal.proposalStatus}</span>
                {proposal.reviewedBy && ` by ${proposal.reviewedBy}`}
                {proposal.reviewedAt && ` on ${formatDate(proposal.reviewedAt.slice(0, 10))}`}
                {proposal.reviewComment && ` — "${proposal.reviewComment}"`}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Review Comment</label>
              <textarea
                className="mt-1.5 h-24 w-full resize-none rounded-lg border border-hairline-strong bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
                placeholder="Optional — e.g. &quot;Please change the recommended product.&quot;"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
              />
            </div>

            {reviewMutation.isError && (
              <p className="text-xs font-semibold text-danger">
                {reviewMutation.error instanceof Error ? reviewMutation.error.message : "Couldn't record this decision."}
              </p>
            )}

            {pendingDecision ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-danger-border bg-danger-bg p-3">
                <p className="text-sm font-semibold text-danger">Reject this proposal? This will be recorded as the final decision.</p>
                <div className="ml-auto flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setPendingDecision(null)}>Cancel</Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => reviewMutation.mutate('REJECTED')}
                    disabled={reviewMutation.isPending}
                  >
                    {reviewMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {REVIEW_DECISIONS.map((decision) => (
                  <Button
                    key={decision.value}
                    type="button"
                    variant={decision.variant}
                    disabled={reviewMutation.isPending}
                    onClick={() => (decision.confirm ? setPendingDecision(decision.value) : reviewMutation.mutate(decision.value))}
                  >
                    <decision.icon className="h-4 w-4" strokeWidth={2} />
                    {reviewMutation.isPending && reviewMutation.variables === decision.value ? 'Saving…' : decision.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function HumanReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTenderId = searchParams.get('tenderId');

  const queueQuery = useQuery({
    queryKey: ['human-review-queue'],
    queryFn: () => fetchLeads({ pipeline_status: 'AWAITING_PROPOSAL_REVIEW', limit: 100 }) as Promise<LeadsResponse>,
  });

  const leads = queueQuery.data?.tenders ?? [];

  // Defaults to the first queue item when nothing is selected yet, without
  // an effect + setSearchParams round-trip — the URL only updates once the
  // reviewer actually clicks a different lead (see QueueList's onSelect).
  const effectiveTenderId = selectedTenderId ?? leads[0]?.tender_id ?? null;
  const selectedLead = leads.find((lead) => lead.tender_id === effectiveTenderId) ?? null;

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">Expert Review</h2>
        <p className="mt-1 text-sm text-ink-soft">Review AI-generated proposals for qualified leads before they reach a relationship manager.</p>
      </div>

      {queueQuery.isLoading && (
        <Card className="flex items-center gap-3 p-8 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          Loading review queue…
        </Card>
      )}

      {queueQuery.isError && (
        <Card className="grid justify-items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
          <p className="text-sm font-semibold text-danger">Couldn&apos;t load the review queue</p>
          <p className="max-w-sm text-xs text-ink-muted">
            {queueQuery.error instanceof Error ? queueQuery.error.message : 'An unexpected error occurred.'}
          </p>
          <Button type="button" variant="secondary" onClick={() => queueQuery.refetch()}>Retry</Button>
        </Card>
      )}

      {queueQuery.isSuccess && leads.length === 0 && (
        <Card className="grid justify-items-center gap-3 p-12 text-center">
          <Inbox className="h-8 w-8 text-ink-muted" strokeWidth={2} />
          <p className="text-sm font-semibold text-ink">No proposals awaiting review.</p>
          <p className="max-w-md text-xs text-ink-muted">
            A proposal will appear here when a real lead passes qualification and proposal generation.
          </p>
        </Card>
      )}

      {queueQuery.isSuccess && leads.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <QueueList
            leads={leads}
            selectedTenderId={effectiveTenderId}
            onSelect={(tenderId) => setSearchParams({ tenderId })}
          />
          {selectedLead ? (
            <ProposalReviewPanel lead={selectedLead} tenderId={selectedLead.tender_id} />
          ) : (
            <Card className="grid justify-items-center gap-2 p-10 text-center text-sm text-ink-muted">
              Select a lead from the queue to review its proposal.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default HumanReview;