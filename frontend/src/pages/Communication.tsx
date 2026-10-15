import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import { ScoreBreakdownToggle, ScoreBreakdownPanel } from '../components/leads/ScoreBreakdown';
import type { QualificationFactors } from '../components/leads/ScoreBreakdown';
import { fetchLeadById, fetchLeadCommunication, fetchLeads, prepareLeadCommunication, reviewLeadCommunication } from '../services/leadsApi';
import { formatDate, tenderTitleFrom, tenderLocation } from '../utils/tenderFormatters';

// Real `tenders` row shape as returned by GET /api/leads/:id — same
// qualification_* columns HumanReview.tsx already reads; never invented
// here.
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
  lead_status: string;
  qualification_score: number | null;
  qualification_reason: {
    aiAnalysis?: {
      status: string;
      score?: number;
      classification?: string;
      confidence?: number;
      reasoning?: string;
    };
    factors?: QualificationFactors;
  } | null;
}

interface LeadResponse {
  lead: Lead;
}

// Real GET /api/leads list-row shape (see leadController.list) — every
// tender row returned there is already enriched with `proposal_status`/
// `communication_status` from the same real tender_proposals lookup
// (tenderProposalRepository.getProposalStateByTenderIds()) that backs
// Analytics' AI/Human column. Reused as-is to find leads whose proposal was
// actually approved through Human Review — no second/duplicate query.
interface ApprovedLeadSummary {
  tender_id: string;
  title: string | null;
  category: string | null;
  tender_city: string | null;
  tender_state: string | null;
  location: string | null;
  amount: string | null;
  winning_company_name: string | null;
  proposal_status: string | null;
  communication_status: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface LeadsResponse {
  tenders: ApprovedLeadSummary[];
  pagination: Pagination;
}

const LIMIT = 10;

// Real PHASE 4 GET /api/leads/:id/communication response shape (see
// communicationPreparationService.toCommunicationShape()) — subject/body
// are the approved proposal's own email fields, reused unchanged;
// contactEmail/contactName/phone are always null (no schema field
// represents the winning company's real contact channel — see that
// service's resolveContactInfo() doc).
interface Communication {
  tenderId: string;
  proposalStatus: string;
  communicationStatus: string | null;
  recommendedProduct: { name: string; reason: string } | null;
  proposalScore: number | null;
  rationale: string[];
  missingInformation: string[];
  contactEmail: string | null;
  contactName: string | null;
  phone: string | null;
  subject: string | null;
  body: string | null;
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

const COMMUNICATION_DECISIONS = [
  { value: 'APPROVE', label: 'Approve for Communication', icon: CheckCircle2, variant: 'primary' as const, confirm: false },
  { value: 'ON_HOLD', label: 'Put On Hold', icon: PauseCircle, variant: 'secondary' as const, confirm: false },
  { value: 'REJECT', label: 'Reject', icon: XCircle, variant: 'danger' as const, confirm: true },
] as const;

const COMMUNICATION_STATUS_TONE: Record<string, StatusTone> = {
  DRAFT_READY: 'info',
  AWAITING_SEND_APPROVAL: 'success',
  ON_HOLD: 'neutral',
  REJECTED: 'danger',
};

const QUALIFICATION_TONE: Record<string, StatusTone> = {
  QUALIFIED_GOOD: 'success',
  QUALIFIED_HITL: 'warning',
  QUALIFIED_BAD: 'danger',
};

const TERMINAL_COMMUNICATION_STATUSES = ['AWAITING_SEND_APPROVAL', 'REJECTED'];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-sm font-medium text-ink">{value ?? <span className="text-ink-muted">—</span>}</p>
    </div>
  );
}

// Static workflow chrome — no proposal/customer data, just the fixed funnel
// this page is the last step of (matches the app's real pipeline: Phase 1
// qualification -> Phase 2 proposal generation -> Phase 3 Human Review of
// the proposal -> approval -> this page). Purely explanatory, never a data
// source.
const WORKFLOW_STEPS = ['Lead', 'Qualification', 'Proposal', 'Expert Review', 'Approved Proposal', 'Communication'];

function WorkflowTrail() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {WORKFLOW_STEPS.map((step, index) => (
        <span key={step} className="flex items-center gap-1.5">
          <span
            className={
              step === 'Communication'
                ? 'rounded-full bg-primary-tint px-2.5 py-1 text-xs font-semibold text-primary'
                : 'text-xs font-medium text-ink-muted'
            }
          >
            {step}
          </span>
          {index < WORKFLOW_STEPS.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-hairline-strong" strokeWidth={2} />}
        </span>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="grid justify-items-center gap-3 p-12 text-center">
      <Inbox className="h-8 w-8 text-ink-muted" strokeWidth={2} />
      <p className="text-sm font-semibold text-ink">No approved proposals are currently ready for communication.</p>
      <p className="max-w-md text-xs text-ink-muted">
        Once a proposal is approved through Expert Review, it will appear here for final customer communication review.
      </p>
      <Link to="/human-review" className="no-underline">
        <Button type="button" variant="secondary">Go to Expert Review</Button>
      </Link>
    </Card>
  );
}

// Approval Status is always "APPROVED" for every row here (this list is
// already filtered to that real proposal_status), but the badge still
// reuses the same tone map every other page uses for that value.
const PROPOSAL_STATUS_TONE: Record<string, StatusTone> = { APPROVED: 'success' };

/**
 * Real approved proposals, ready for the final customer-communication step.
 * Only fields already present on the GET /api/leads row are shown — Proposal
 * ID/Proposal Value/Approved By/Approved Date aren't part of that response
 * (see ApprovedLeadSummary above) and are intentionally left for the
 * CommunicationPanel drill-down rather than fabricated or fetched
 * per-row here.
 */
function ApprovedProposalsList({
  leads,
  pagination,
  page,
  onPageChange,
  isLoading,
}: {
  leads: ApprovedLeadSummary[];
  pagination: Pagination;
  page: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}) {
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-hairline px-5 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <Mail className="h-4 w-4" strokeWidth={2} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Approved Proposals Ready for Communication ({pagination.total})
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-5 py-3">#</th>
              <th className="px-5 py-3">Lead / Tender</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3 text-right">Tender Value</th>
              <th className="px-5 py-3">Approval Status</th>
              <th className="px-5 py-3">Communication Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, index) => {
              const rowNumber = (pagination.page - 1) * pagination.limit + index + 1;
              return (
              <tr key={lead.tender_id} className="border-b border-hairline align-top transition-colors hover:bg-primary-tint/40">
                <td className="tabular px-5 py-4 text-ink-muted">{rowNumber}</td>
                <td className="max-w-xs px-5 py-4">
                  <p className="truncate font-semibold text-ink">{tenderTitleFrom(lead)}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">{lead.tender_id}</p>
                </td>
                <td className="px-5 py-4 text-ink-soft">{lead.winning_company_name || <span className="text-ink-muted">—</span>}</td>
                <td className="px-5 py-4 text-ink-soft">{lead.category || <span className="text-ink-muted">—</span>}</td>
                <td className="tabular px-5 py-4 text-right font-semibold text-ink">{lead.amount || <span className="text-ink-muted">—</span>}</td>
                <td className="px-5 py-4">
                  <StatusBadge tone={PROPOSAL_STATUS_TONE[lead.proposal_status ?? ''] ?? 'neutral'}>{lead.proposal_status}</StatusBadge>
                </td>
                <td className="px-5 py-4">
                  {lead.communication_status ? (
                    <StatusBadge tone={COMMUNICATION_STATUS_TONE[lead.communication_status] ?? 'neutral'}>{lead.communication_status}</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Not Prepared</StatusBadge>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  <Button type="button" variant="secondary" onClick={() => navigate(`/communication?tenderId=${encodeURIComponent(lead.tender_id)}`)}>
                    Open Communication
                  </Button>
                </td>
              </tr>
              );
            })}
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
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= pagination.total_pages || isLoading}
            onClick={() => onPageChange(Math.min(pagination.total_pages, page + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CommunicationPanel({ tenderId }: { tenderId: string }) {
  const queryClient = useQueryClient();
  const [reviewComment, setReviewComment] = useState('');
  const [pendingDecision, setPendingDecision] = useState<string | null>(null);
  const [scoreBreakdownExpanded, setScoreBreakdownExpanded] = useState(false);

  // Editable working copy of the recipient/subject/message. Seeded from the
  // real proposal-derived data (communication.contactEmail/subject/body)
  // below — never a blank field pretending to hold real data. There is no
  // PATCH endpoint on GET /api/leads/:id/communication that accepts edited
  // content (prepare only sets communication_status; review only accepts
  // decision + reviewComment — see communicationPreparationService.js), so
  // these edits are a local working draft only, not persisted by the
  // backend. Made explicit in the UI rather than silently discarded.
  const [recipientDraft, setRecipientDraft] = useState('');
  const [subjectDraft, setSubjectDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');

  const leadQuery = useQuery({
    queryKey: ['lead', tenderId],
    queryFn: () => fetchLeadById(tenderId) as Promise<LeadResponse>,
  });

  const communicationQuery = useQuery({
    queryKey: ['lead-communication', tenderId],
    queryFn: () => fetchLeadCommunication(tenderId) as Promise<Communication>,
  });

  // Re-seeds the editable draft whenever the real underlying data actually
  // changes (a fresh tender, or communication_status advancing after
  // Prepare/Approve/Hold/Reject) — not on every re-render/background
  // refetch, so in-progress typing isn't clobbered.
  useEffect(() => {
    const communication = communicationQuery.data;
    if (!communication) return;
    setRecipientDraft(communication.contactEmail ?? '');
    setSubjectDraft(communication.subject ?? '');
    setBodyDraft(communication.body ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId, communicationQuery.data?.communicationStatus]);

  const prepareMutation = useMutation({
    mutationFn: () => prepareLeadCommunication(tenderId) as Promise<Communication>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-communication', tenderId] }),
  });

  const reviewMutation = useMutation({
    mutationFn: (decision: string) =>
      reviewLeadCommunication(tenderId, { decision, reviewComment: reviewComment.trim() || undefined }) as Promise<Communication>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-communication', tenderId] });
      setPendingDecision(null);
      setReviewComment('');
    },
  });

  if (leadQuery.isLoading || communicationQuery.isLoading) {
    return (
      <Card className="flex items-center gap-3 p-8 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        Loading communication…
      </Card>
    );
  }

  if (communicationQuery.isError || leadQuery.isError) {
    const error = communicationQuery.error ?? leadQuery.error;
    const status = (error as { status?: number })?.status;

    if (status === 404) return <EmptyState />;

    return (
      <Card className="grid justify-items-center gap-3 p-10 text-center">
        <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
        <p className="text-sm font-semibold text-danger">
          {status === 409 ? 'This proposal is not approved yet — communication is not available.' : "Couldn't load this communication"}
        </p>
        <p className="max-w-sm text-xs text-ink-muted">
          {error instanceof Error ? error.message : 'An unexpected error occurred.'}
        </p>
        <Button type="button" variant="secondary" onClick={() => { leadQuery.refetch(); communicationQuery.refetch(); }}>Retry</Button>
      </Card>
    );
  }

  const lead = leadQuery.data!.lead;
  const communication = communicationQuery.data!;
  const aiAnalysis = lead.qualification_reason?.aiAnalysis;
  const isFinal = communication.communicationStatus ? TERMINAL_COMMUNICATION_STATUSES.includes(communication.communicationStatus) : false;

  return (
    <div className="grid gap-6">
      {/* Company / Tender / Qualification / Approved Proposal — reference
          context a reviewer might check, not the point of this page.
          Deliberately lower visual weight than the Communication section
          below: compact padding, a muted section label instead of a bold
          card heading, and a plain surface-muted wash rather than the
          elevated card treatment — same "secondary tier" language already
          used for Dashboard's demoted stat row. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Company</p>
          <div className="mt-3 grid gap-3">
            <Field label="Company Name" value={lead.winning_company_name} />
            <Field label="Location" value={tenderLocation(lead) === '—' ? null : tenderLocation(lead)} />
          </div>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Tender</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tender Title" value={tenderTitleFrom(lead)} />
            <Field label="Category" value={lead.category} />
            <Field label="Tender Value" value={lead.amount} />
            <Field label="Winning Bid" value={lead.winning_bid_amount} />
            <Field label="Winning Company" value={lead.winning_company_name} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Qualification */}
        <div className="rounded-xl border border-hairline bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Qualification (Deterministic — Authoritative)</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Qualification Score</p>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="text-sm font-medium text-ink">{lead.qualification_score ?? <span className="text-ink-muted">—</span>}</p>
                {lead.qualification_score != null && (
                  <ScoreBreakdownToggle expanded={scoreBreakdownExpanded} onToggle={() => setScoreBreakdownExpanded((value) => !value)} />
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Lead Status</p>
              <StatusBadge tone={QUALIFICATION_TONE[lead.lead_status] ?? 'neutral'} className="mt-1">{lead.lead_status}</StatusBadge>
            </div>
          </div>
          {lead.qualification_score != null && scoreBreakdownExpanded && (
            <div className="mt-3">
              <ScoreBreakdownPanel factors={lead.qualification_reason?.factors} />
            </div>
          )}
          {aiAnalysis && aiAnalysis.status === 'AVAILABLE' && (
            <div className="mt-3 rounded-lg border border-hairline bg-surface p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">AI Advisory Analysis (Ollama — not the authoritative score)</p>
              <p className="mt-1.5 text-xs text-ink-soft">Advisory score {aiAnalysis.score} · {aiAnalysis.classification}</p>
            </div>
          )}
        </div>

        {/* Approved Proposal */}
        <div className="rounded-xl border border-hairline bg-surface-muted p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Approved Proposal</p>
            <StatusBadge tone="success">{communication.proposalStatus}</StatusBadge>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Recommended Product" value={communication.recommendedProduct?.name ?? 'Not confidently identified'} />
            <Field label="Proposal Score" value={communication.proposalScore} />
          </div>
          {communication.rationale.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Rationale</p>
              <ul className="mt-1.5 grid gap-1 text-xs text-ink-soft">
                {communication.rationale.map((item) => (
                  <li key={item} className="flex gap-2"><span className="text-ink-muted">•</span> {item}</li>
                ))}
              </ul>
            </div>
          )}
          {communication.missingInformation.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Missing Information</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {communication.missingInformation.map((item) => (
                  <StatusBadge key={item} tone="neutral">{item}</StatusBadge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Communication — the actual point of this page, given the primary
          visual weight: full Card elevation, the ledger accent, a larger
          heading, and generous padding, in contrast to the compact
          reference panels above. */}
      <Card accent className="p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
            <Mail className="h-5 w-5" strokeWidth={2} />
          </div>
          <h3 className="text-base font-bold text-ink">Communication</h3>
          {communication.communicationStatus && (
            <StatusBadge tone={COMMUNICATION_STATUS_TONE[communication.communicationStatus] ?? 'neutral'} className="ml-auto">
              {communication.communicationStatus}
            </StatusBadge>
          )}
        </div>

        <div className="mt-5">
          <label htmlFor="comm-recipient" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Recipient
          </label>
          {!communication.contactEmail && (
            <p className="mt-1 text-xs font-medium text-warning">
              No verified customer email on file for this lead — enter one manually below before sending outside the app.
            </p>
          )}
          <input
            id="comm-recipient"
            type="email"
            className="mt-1.5 h-10 w-full rounded-lg border border-hairline-strong bg-white px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted"
            placeholder="customer@example.com"
            value={recipientDraft}
            onChange={(event) => setRecipientDraft(event.target.value)}
            disabled={isFinal}
          />
        </div>

        <div className="mt-5">
          <label htmlFor="comm-subject" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Subject
          </label>
          <input
            id="comm-subject"
            type="text"
            className="mt-1.5 h-10 w-full rounded-lg border border-hairline-strong bg-white px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted"
            placeholder="Subject line"
            value={subjectDraft}
            onChange={(event) => setSubjectDraft(event.target.value)}
            disabled={isFinal}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="comm-body" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Message
          </label>
          <textarea
            id="comm-body"
            className="mt-1.5 h-48 min-h-0 w-full resize-y rounded-lg border border-hairline-strong bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted"
            placeholder="Customer-facing message body"
            value={bodyDraft}
            onChange={(event) => setBodyDraft(event.target.value)}
            disabled={isFinal}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Seeded from the approved proposal&apos;s own email content — no AI drafting tool is connected for this step,
            so it&apos;s never auto-regenerated. Edits above are a working draft only: the backend doesn&apos;t persist
            edited email text, only the Prepare/Review workflow status below.
          </p>
        </div>

        {!communication.communicationStatus ? (
          <div className="mt-5">
            {prepareMutation.isError && (
              <p className="mb-2 text-xs font-semibold text-danger">
                {prepareMutation.error instanceof Error ? prepareMutation.error.message : "Couldn't prepare the communication."}
              </p>
            )}
            <Button type="button" onClick={() => prepareMutation.mutate()} disabled={prepareMutation.isPending}>
              <Mail className="h-4 w-4" /> {prepareMutation.isPending ? 'Preparing…' : 'Prepare Communication'}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Expert Communication Review</h4>

              {isFinal ? (
                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Reviewed By" value={communication.reviewedBy} />
                    <Field label="Review Date" value={communication.reviewedAt ? formatDate(communication.reviewedAt.slice(0, 10)) : null} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Review Comment</p>
                    <p className="mt-1 text-sm text-ink">{communication.reviewComment || <span className="text-ink-muted">No comment left.</span>}</p>
                  </div>
                  {communication.communicationStatus === 'AWAITING_SEND_APPROVAL' && (
                    <p className="text-xs font-semibold text-success">Ready to send — actual sending is not part of this phase.</p>
                  )}
                </div>
              ) : (
                <div className="mt-3 grid gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Review Comment</label>
                    <textarea
                      className="mt-1.5 h-24 min-h-0 w-full resize-none rounded-lg border border-hairline-strong bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
                      placeholder="Optional — e.g. &quot;Approved for customer communication.&quot;"
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
                      <p className="text-sm font-semibold text-danger">Reject this communication? This will be recorded as the final decision.</p>
                      <div className="ml-auto flex gap-2">
                        <Button type="button" variant="secondary" onClick={() => setPendingDecision(null)}>Cancel</Button>
                        <Button type="button" variant="danger" onClick={() => reviewMutation.mutate('REJECT')} disabled={reviewMutation.isPending}>
                          {reviewMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {COMMUNICATION_DECISIONS.map((decision) => (
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
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Communication() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tenderId = searchParams.get('tenderId');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

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

  // Same real GET /api/leads endpoint (and pipeline_status filter)
  // HumanReview.tsx's own queue already uses — a generated proposal always
  // leaves its tender at pipeline_status = AWAITING_PROPOSAL_REVIEW
  // (proposalPipelineService.reviewProposal() never advances pipeline_status
  // any further), so this is the same real population Human Review draws
  // from, narrowed server-side (proposal_status=APPROVED, see
  // tenderRepository.listTenders()) so pagination.total/total_pages count
  // the same approved-only universe the list actually renders. Skipped
  // entirely while viewing one specific communication (tenderId present) —
  // that view doesn't need the list.
  const approvedQuery = useQuery({
    queryKey: ['communication-approved-queue', page],
    queryFn: () =>
      fetchLeads({
        pipeline_status: 'AWAITING_PROPOSAL_REVIEW',
        proposal_status: 'APPROVED',
        page,
        limit: LIMIT,
      }) as Promise<LeadsResponse>,
    enabled: !tenderId,
  });

  const approvedLeads = approvedQuery.data?.tenders ?? [];
  const approvedPagination = approvedQuery.data?.pagination ?? { page: 1, limit: LIMIT, total: 0, total_pages: 1 };

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">Communication</h2>
        <p className="mt-1 text-sm text-ink-soft">Prepare and review the customer-facing communication draft for an approved proposal, before it&apos;s ready to send.</p>
      </div>

      <WorkflowTrail />

      {tenderId ? (
        <>
          <Link to="/communication" className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary no-underline hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> All Approved Proposals
          </Link>
          <CommunicationPanel tenderId={tenderId} />
        </>
      ) : approvedQuery.isLoading ? (
        <Card className="flex items-center gap-3 p-8 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          Loading approved proposals…
        </Card>
      ) : approvedQuery.isError ? (
        <Card className="grid justify-items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={2} />
          <p className="text-sm font-semibold text-danger">Couldn&apos;t load approved proposals</p>
          <p className="max-w-sm text-xs text-ink-muted">
            {approvedQuery.error instanceof Error ? approvedQuery.error.message : 'An unexpected error occurred.'}
          </p>
          <Button type="button" variant="secondary" onClick={() => approvedQuery.refetch()}>Retry</Button>
        </Card>
      ) : approvedPagination.total === 0 ? (
        <EmptyState />
      ) : (
        <ApprovedProposalsList
          leads={approvedLeads}
          pagination={approvedPagination}
          page={page}
          onPageChange={setPage}
          isLoading={approvedQuery.isFetching}
        />
      )}
    </div>
  );
}

export default Communication;