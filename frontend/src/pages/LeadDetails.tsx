import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ExternalLink,
  FileSignature,
  FileText,
  HeartPulse,
  Inbox,
  Loader2,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  Workflow,
  XCircle,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import DecisionTrail from '../components/leads/DecisionTrail';
import { fetchTenderById, fetchCustomerCheck, fetchHealthCheck, fetchProposals, createProposal, approveProposal } from '../services/tendersApi';
import { formatDate, tenderTitleFrom, tenderLocation, tenderStatus } from '../utils/tenderFormatters';

// Real GET /api/tenders/:tenderId/customer-check response shape (verified live —
// see src/controllers/tenderController.js's customerCheck handler). matchedCustomer
// is null whenever isExistingCustomer is false; every field on it below is a
// real column on existing_customers, not invented.
interface CustomerCheckResult {
  tenderId: string;
  companyChecked: string | null;
  isExistingCustomer: boolean;
  matchedCustomer: {
    customer_name: string;
    cin: string | null;
    segment: string | null;
    relationship_manager: string | null;
    customer_since: string | null;
  } | null;
}

// Real GET /api/tenders/:tenderId/health-check response shape (verified
// live — see src/services/healthCheckService.js's runHealthCheck() and
// src/services/leadAnalysisService.js's generateLeadAnalysis()).
// companyProfile is null whenever the winning company has no Probe42-demo
// match; recommendedProducts is commonly an empty array. Only fields
// actually present in a live response are typed here.
interface HealthCheckResult {
  tenderId: string;
  companyProfile: {
    annual_revenue: string | null;
    net_profit: string | null;
    credit_rating: string | null;
    compliance_status: string | null;
    director_count: number | null;
    incorporation_date: string | null;
    cin: string | null;
  } | null;
  leadAnalysis: {
    company: { name: string | null };
    intelligence: {
      signals: string[];
      confidence: { score: number; level: string };
    };
    score: { score: number; grade: string };
    recommendations: {
      recommendedProducts: Array<{ product: string; reason?: string; confidence?: number }>;
    };
  } | null;
}

const GRADE_TONE: Record<string, StatusTone> = {
  HOT: 'success',
  WARM: 'warning',
  QUALIFIED: 'info',
  'LOW PRIORITY': 'neutral',
};

// Real `tenders` row shape, limited to the fields this page reads. Every
// field below is a real column on GET /api/tenders/:tenderId — none of it
// is invented. Fields this endpoint doesn't return yet (e.g. a company
// address, an activity/timeline list) are intentionally left as "not
// returned by backend" below rather than guessed at.
interface Tender {
  tender_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  location: string | null;
  tender_city: string | null;
  tender_state: string | null;
  amount: string | null;
  contract_date: string | null;
  closing_date: string | null;
  url: string | null;
  source: string | null;
  created_at: string | null;
  winning_company_name: string | null;
  winning_bid_amount: string | null;
  company_name: string | null;
  company_website: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  gst: string | null;
  cin: string | null;
  buyer_department: string | null;
}

interface TenderResponse {
  tender: Tender;
}

// Real `tender_proposals` row shape (verified live — see
// src/repositories/tenderProposalRepository.js). There is no structured
// "recommended banking products" or "relationship strategy" field on this
// table — those sections render "Awaiting backend integration." rather than
// reusing the Health Check card's separate recommendation data, since this
// phase is scoped to the proposal endpoint specifically.
interface Proposal {
  id: number;
  tender_id: string;
  winning_company_name: string | null;
  proposal_summary: string | null;
  email_draft: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProposalsListResponse {
  proposals: Proposal[];
}

interface ProposalResponse {
  message: string;
  proposal: Proposal;
}

const STATUS_TONE: Record<string, StatusTone> = { Awarded: 'success', Open: 'info', Closed: 'neutral' };

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="text-sm font-medium text-ink">{value ?? '—'}</p>
    </div>
  );
}

function CustomerCheckCard({ tenderId }: { tenderId: string }) {
  const mutation = useMutation({
    mutationFn: () => fetchCustomerCheck(tenderId) as Promise<CustomerCheckResult>,
  });

  const result = mutation.data;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <ShieldCheck className="h-4 w-4" strokeWidth={2} />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Existing Customer Check</h3>
      </div>

      <div className="mt-4">
        {!result && !mutation.isPending && !mutation.isError && (
          <Button type="button" onClick={() => mutation.mutate()}>
            <ShieldCheck className="h-4 w-4" /> Run Existing Customer Check
          </Button>
        )}

        {mutation.isPending && (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Checking existing customer records…
          </div>
        )}

        {mutation.isError && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
              <p className="text-sm font-semibold text-danger">Couldn&apos;t run the customer check</p>
            </div>
            <p className="text-xs text-ink-muted">
              {mutation.error instanceof Error ? mutation.error.message : 'An unexpected error occurred.'}
            </p>
            <Button type="button" variant="secondary" className="w-fit" onClick={() => mutation.mutate()}>
              Retry
            </Button>
          </div>
        )}

        {result?.isExistingCustomer && result.matchedCustomer && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone="success">Existing Customer</StatusBadge>
              {result.companyChecked && <span className="text-xs text-ink-muted">Checked: {result.companyChecked}</span>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Company Name" value={result.matchedCustomer.customer_name} />
              <Field label="Customer Status" value={result.matchedCustomer.segment} />
              {(result.matchedCustomer.relationship_manager || result.matchedCustomer.customer_since) && (
                <div className="grid gap-1 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Relationship Information</p>
                  <p className="text-sm font-medium text-ink">
                    {result.matchedCustomer.relationship_manager && (
                      <>Relationship Manager: {result.matchedCustomer.relationship_manager}</>
                    )}
                    {result.matchedCustomer.relationship_manager && result.matchedCustomer.customer_since && ' · '}
                    {result.matchedCustomer.customer_since && (
                      <>Customer Since: {formatDate(result.matchedCustomer.customer_since.slice(0, 10))}</>
                    )}
                  </p>
                </div>
              )}
            </div>

            <Button type="button" className="w-fit">
              <FileText className="h-4 w-4" /> Generate Proposal
            </Button>
          </div>
        )}

        {result && !result.isExistingCustomer && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone="info">Not an Existing Customer</StatusBadge>
              {result.companyChecked && <span className="text-xs text-ink-muted">Checked: {result.companyChecked}</span>}
            </div>

            <p className="text-sm text-ink-soft">Company is not an existing customer.</p>

            <Button type="button" className="w-fit">
              <HeartPulse className="h-4 w-4" /> Run Health Check
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function HealthCheckCard({ tenderId }: { tenderId: string }) {
  const mutation = useMutation({
    mutationFn: () => fetchHealthCheck(tenderId) as Promise<HealthCheckResult>,
  });

  const result = mutation.data;
  const analysis = result?.leadAnalysis;
  const profile = result?.companyProfile;
  const products = analysis?.recommendations.recommendedProducts ?? [];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <HeartPulse className="h-4 w-4" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Probe42 Health Check</h3>
          {!result && !mutation.isPending && !mutation.isError && (
            <p className="mt-0.5 text-xs text-ink-muted">Run a financial health assessment for the winning company.</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        {!result && !mutation.isPending && !mutation.isError && (
          <Button type="button" onClick={() => mutation.mutate()}>
            <HeartPulse className="h-4 w-4" /> Run Health Check
          </Button>
        )}

        {mutation.isPending && (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Running financial health assessment…
          </div>
        )}

        {mutation.isError && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
              <p className="text-sm font-semibold text-danger">Couldn&apos;t run the health check</p>
            </div>
            <p className="text-xs text-ink-muted">
              {mutation.error instanceof Error ? mutation.error.message : 'An unexpected error occurred.'}
            </p>
            <Button type="button" variant="secondary" className="w-fit" onClick={() => mutation.mutate()}>
              Retry
            </Button>
          </div>
        )}

        {mutation.isSuccess && !analysis && (
          <div className="grid gap-3">
            <p className="text-sm font-medium text-ink-muted">No health information available.</p>
            <Button type="button" variant="secondary" className="w-fit" onClick={() => mutation.mutate()}>
              Retry
            </Button>
          </div>
        )}

        {analysis && (
          <div className="grid gap-5">
            {/* Company Name, Health Score, Risk Grade, Confidence Score */}
            <div className="flex flex-wrap items-end gap-6">
              {analysis.company.name && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Company Name</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{analysis.company.name}</p>
                </div>
              )}

              {typeof analysis.score.score === 'number' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Health Score</p>
                  <p className="mt-1 text-3xl font-bold text-primary">{analysis.score.score}</p>
                </div>
              )}

              {analysis.score.grade && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Risk Grade</p>
                  <StatusBadge tone={GRADE_TONE[analysis.score.grade] ?? 'neutral'} className="mt-1">
                    {analysis.score.grade}
                  </StatusBadge>
                </div>
              )}

              {typeof analysis.intelligence.confidence?.score === 'number' && (
                <div className="min-w-[140px]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Confidence Score</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(100, analysis.intelligence.confidence.score))}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-ink">{analysis.intelligence.confidence.score}%</span>
                  </div>
                  {analysis.intelligence.confidence.level && (
                    <p className="mt-1 text-xs text-ink-muted">{analysis.intelligence.confidence.level} confidence</p>
                  )}
                </div>
              )}
            </div>

            {/* Financial Summary — only when Probe42 has a match for this company */}
            {profile && (
              <div className="rounded-xl border border-hairline bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Financial Summary</p>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {profile.annual_revenue && (
                    <Field label="Annual Revenue" value={`₹${Number(profile.annual_revenue).toLocaleString('en-IN')}`} />
                  )}
                  {profile.net_profit && (
                    <Field label="Net Profit" value={`₹${Number(profile.net_profit).toLocaleString('en-IN')}`} />
                  )}
                  {profile.credit_rating && <Field label="Credit Rating" value={profile.credit_rating} />}
                  {profile.compliance_status && <Field label="Compliance Status" value={profile.compliance_status} />}
                  {profile.director_count != null && <Field label="Director Count" value={profile.director_count} />}
                  {profile.incorporation_date && (
                    <Field label="Incorporation Date" value={formatDate(profile.incorporation_date.slice(0, 10))} />
                  )}
                  {profile.cin && <Field label="CIN" value={profile.cin} />}
                </div>
              </div>
            )}

            {/* Signals */}
            {analysis.intelligence.signals.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Signals</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.intelligence.signals.map((signal) => (
                    <StatusBadge key={signal} tone="neutral">{signal}</StatusBadge>
                  ))}
                </div>
              </div>
            )}

            {/* Business Recommendation — only when the engine actually produced one */}
            {products.length > 0 && (
              <div className="rounded-xl border border-primary-tint-2 bg-primary-tint p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Business Recommendation</p>
                <div className="mt-3 grid gap-3">
                  {products.map((item) => (
                    <div key={item.product}>
                      <p className="text-sm font-semibold text-ink">{item.product}</p>
                      {item.reason && <p className="mt-0.5 text-xs text-ink-soft">{item.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="button">
                <FileText className="h-4 w-4" /> Generate Proposal
              </Button>
              <Button type="button" variant="secondary" onClick={() => mutation.mutate()}>
                <RefreshCw className="h-4 w-4" /> Run Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ProposalCard({ tender }: { tender: Tender }) {
  const queryClient = useQueryClient();
  const queryKey = ['tender-proposals', tender.tender_id];

  const listQuery = useQuery({
    queryKey,
    queryFn: () => fetchProposals(tender.tender_id) as Promise<ProposalsListResponse>,
  });

  const generateMutation = useMutation({
    mutationFn: () => createProposal(tender.tender_id) as Promise<ProposalResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveProposal(id) as Promise<ProposalResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const proposals = listQuery.data?.proposals ?? [];
  const latest = proposals[0];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <FileSignature className="h-4 w-4" strokeWidth={2} />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Proposal</h3>
      </div>

      {/* Company / Tender / Tender Value / Winning Company — the tender this proposal is for, already loaded on this page */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Company" value={tender.company_name || tender.title} />
        <Field label="Tender" value={tenderTitleFrom(tender)} />
        <Field label="Tender Value" value={tender.amount} />
        <Field label="Winning Company" value={tender.winning_company_name} />
      </div>

      <div className="mt-5 grid gap-5">
        {listQuery.isLoading && (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Loading proposal…
          </div>
        )}

        {listQuery.isError && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
              <p className="text-sm font-semibold text-danger">Couldn&apos;t load the proposal</p>
            </div>
            <p className="text-xs text-ink-muted">
              {listQuery.error instanceof Error ? listQuery.error.message : 'An unexpected error occurred.'}
            </p>
            <Button type="button" variant="secondary" className="w-fit" onClick={() => listQuery.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {listQuery.isSuccess && (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recommended Banking Products</p>
              <p className="mt-1 text-sm text-ink-muted">Awaiting backend integration.</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Relationship Strategy</p>
              <p className="mt-1 text-sm text-ink-muted">Awaiting backend integration.</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Proposal Summary</p>
              {latest?.proposal_summary ? (
                <p className="mt-2 rounded-xl border border-hairline bg-surface-muted p-4 text-sm leading-6 text-ink">
                  {latest.proposal_summary}
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">Awaiting proposal generation.</p>
              )}
            </div>

            {generateMutation.isError && (
              <p className="text-xs font-semibold text-danger">
                {generateMutation.error instanceof Error ? generateMutation.error.message : 'Couldn’t generate the proposal.'}
              </p>
            )}
            {approveMutation.isError && (
              <p className="text-xs font-semibold text-danger">
                {approveMutation.error instanceof Error ? approveMutation.error.message : 'Couldn’t approve the proposal.'}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {!latest && (
                <Button type="button" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                  <FileSignature className="h-4 w-4" />
                  {generateMutation.isPending ? 'Generating…' : 'Generate Proposal'}
                </Button>
              )}

              {latest && latest.status !== 'Approved' && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => approveMutation.mutate(latest.id)}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {approveMutation.isPending ? 'Approving…' : 'Approve Proposal'}
                </Button>
              )}

              {latest?.status === 'Approved' && <StatusBadge tone="success">Approved</StatusBadge>}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

const PROPOSAL_STATUS_TONE: Record<string, StatusTone> = { Draft: 'warning', Approved: 'success' };

function HumanReviewCard({ tender }: { tender: Tender }) {
  const queryClient = useQueryClient();
  const queryKey = ['tender-proposals', tender.tender_id];

  // Reads the same real GET /api/tender-proposals?tenderId= endpoint the
  // Proposal card above already uses (same queryKey — React Query shares
  // the cache/request, this doesn't add a second network call) rather than
  // a new "human review" endpoint, since none exists on the backend.
  const listQuery = useQuery({
    queryKey,
    queryFn: () => fetchProposals(tender.tender_id) as Promise<ProposalsListResponse>,
  });

  // Only "Approve" has a real backend mutation (PUT /api/tender-proposals/:id/approve,
  // already used by the Proposal card). Reject/Hold have no backing endpoint,
  // so those buttons stay inert per this phase's explicit instruction.
  const approveMutation = useMutation({
    mutationFn: (id: number) => approveProposal(id) as Promise<ProposalResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const proposals = listQuery.data?.proposals ?? [];
  const latest = proposals[0];
  const isApproved = latest?.status === 'Approved';

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <ClipboardCheck className="h-4 w-4" strokeWidth={2} />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Expert Review</h3>
      </div>

      <div className="mt-4">
        {listQuery.isLoading && (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Loading review status…
          </div>
        )}

        {listQuery.isError && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
              <p className="text-sm font-semibold text-danger">Couldn&apos;t load the review status</p>
            </div>
            <p className="text-xs text-ink-muted">
              {listQuery.error instanceof Error ? listQuery.error.message : 'An unexpected error occurred.'}
            </p>
            <Button type="button" variant="secondary" className="w-fit" onClick={() => listQuery.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {listQuery.isSuccess && !latest && (
          <p className="text-sm text-ink-muted">No proposal to review yet — generate one above first.</p>
        )}

        {listQuery.isSuccess && latest && (
          <div className="grid gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Current Proposal Status</p>
                <StatusBadge tone={PROPOSAL_STATUS_TONE[latest.status] ?? 'neutral'} className="mt-1">
                  {latest.status}
                </StatusBadge>
              </div>
              <Field label="Proposal Generated Date" value={formatDate(latest.created_at.slice(0, 10))} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Proposal Approval Status</p>
                <StatusBadge tone={isApproved ? 'success' : 'neutral'} className="mt-1">
                  {isApproved ? 'Approved' : 'Pending Approval'}
                </StatusBadge>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reviewer Notes</p>
              <p className="mt-2 rounded-xl border border-hairline bg-surface-muted p-4 text-sm text-ink-muted">
                No review notes available.
              </p>
            </div>

            {approveMutation.isError && (
              <p className="text-xs font-semibold text-danger">
                {approveMutation.error instanceof Error ? approveMutation.error.message : 'Couldn’t approve the proposal.'}
              </p>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Decision</p>
              {isApproved ? (
                <StatusBadge tone="success" className="mt-2">Approved</StatusBadge>
              ) : (
                <div className="mt-2 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => approveMutation.mutate(latest.id)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {approveMutation.isPending ? 'Approving…' : 'Approve'}
                  </Button>
                  <Button type="button" variant="secondary">
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button type="button" variant="secondary">
                    <PauseCircle className="h-4 w-4" /> Hold
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Seven stages, matching this phase's spec exactly. This is the page's one
// and only workflow indicator — an earlier, hardcoded-to-step-0
// WorkflowTracker component that duplicated (and contradicted) this real,
// data-driven view was removed rather than kept as dead UI.
const PIPELINE_STAGES = [
  'Tender Selected',
  'Existing Customer Check',
  'Health Check',
  'Proposal Generated',
  'Expert Review',
  'Approved',
  'Completed',
] as const;

/**
 * Infers the furthest real, evidenced stage from the same proposal data the
 * Proposal/Human Review cards already fetch. Existing Customer Check and Health
 * Check have no persisted backend record (both endpoints are stateless,
 * computed on demand — nothing is stored) so their completion can only be
 * inferred once something downstream of them (a persisted proposal) exists,
 * exactly as this phase's own "Proposal exists -> Proposal Generated
 * complete" example specifies. "Completed" (index 6) is never returned
 * here under any real state — there is no backend signal for it, and
 * inventing one is explicitly disallowed.
 */
function inferPipelineState(latest: Proposal | undefined) {
  if (!latest) {
    return { currentStepIndex: 0, currentStage: 'Tender Selected', nextAction: 'Generate Proposal' };
  }
  if (latest.status === 'Approved') {
    return { currentStepIndex: 5, currentStage: 'Approved', nextAction: 'Move to Pipeline' };
  }
  return { currentStepIndex: 3, currentStage: 'Proposal Generated', nextAction: 'Review Proposal' };
}

function PipelineCard({ tender }: { tender: Tender }) {
  const queryKey = ['tender-proposals', tender.tender_id];

  // Same real GET /api/tender-proposals?tenderId= query already used by the
  // Proposal and Human Review cards above (shared cache via queryKey).
  const listQuery = useQuery({
    queryKey,
    queryFn: () => fetchProposals(tender.tender_id) as Promise<ProposalsListResponse>,
  });

  const latest = listQuery.data?.proposals?.[0];
  const { currentStepIndex, currentStage, nextAction } = inferPipelineState(latest);

  // Only these two stages have a real backing timestamp anywhere in the
  // data this page has access to — every other stage hides its timestamp
  // rather than showing a misleading or fabricated one.
  const stageTimestamp = (index: number): string | null => {
    if (index === 3 && latest?.created_at) return formatDate(latest.created_at.slice(0, 10));
    if (index === 5 && latest?.status === 'Approved' && latest.updated_at) return formatDate(latest.updated_at.slice(0, 10));
    return null;
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
          <Workflow className="h-4 w-4" strokeWidth={2} />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Lead Pipeline</h3>
      </div>

      <div className="mt-4">
        {listQuery.isLoading && (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Loading pipeline status…
          </div>
        )}

        {listQuery.isError && (
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
              <p className="text-sm font-semibold text-danger">Couldn&apos;t load the pipeline status</p>
            </div>
            <p className="text-xs text-ink-muted">
              {listQuery.error instanceof Error ? listQuery.error.message : 'An unexpected error occurred.'}
            </p>
            <Button type="button" variant="secondary" className="w-fit" onClick={() => listQuery.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {listQuery.isSuccess && (
          <div className="grid gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              {PIPELINE_STAGES.map((stage, index) => {
                const isDone = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isFuture = index > currentStepIndex;
                const timestamp = stageTimestamp(index);

                return (
                  <div key={stage} className="flex flex-1 items-center gap-3 md:flex-col md:items-stretch md:gap-2">
                    <div className="flex items-center gap-3 md:flex-col md:gap-2">
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
                      ) : (
                        <Circle
                          className={`h-5 w-5 shrink-0 ${isCurrent ? 'text-primary' : 'text-hairline-strong'}`}
                          strokeWidth={2}
                          fill={isCurrent ? '#F0F5FE' : 'none'}
                        />
                      )}
                      <div className="md:text-center">
                        <p
                          className={`text-xs font-semibold ${
                            isFuture ? 'text-hairline-strong' : isCurrent ? 'text-primary' : 'text-ink'
                          }`}
                        >
                          {stage}
                        </p>
                        {timestamp && <p className="mt-0.5 text-[11px] text-ink-muted">{timestamp}</p>}
                      </div>
                    </div>
                    {index < PIPELINE_STAGES.length - 1 && (
                      <div className={`h-px flex-1 md:h-px md:w-full ${isDone ? 'bg-primary' : 'bg-hairline'}`} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-4 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Current Stage</p>
                <StatusBadge tone="info" className="mt-1">{currentStage}</StatusBadge>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted sm:text-right">Next Recommended Action</p>
                <p className="mt-1 text-sm font-semibold text-ink sm:text-right">{nextAction}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{title}</h3>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-6 animate-pulse">
      <Card className="h-28 p-5" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-64 p-5" />
        <Card className="h-64 p-5" />
      </div>
      <Card className="h-32 p-5" />
      <Card className="h-24 p-5" />
      <Card className="h-40 p-5" />
    </div>
  );
}

function NoTenderSelected() {
  return (
    <Card className="grid justify-items-center gap-3 p-12 text-center">
      <Inbox className="h-8 w-8 text-ink-muted" strokeWidth={2} />
      <p className="text-sm font-semibold text-ink">No tender selected</p>
      <p className="max-w-sm text-xs text-ink-muted">Choose a tender from Tender Leads to view its details here.</p>
      <Link to="/tender-leads" className="no-underline">
        <Button type="button" variant="secondary">
          <ArrowLeft className="h-4 w-4" /> Back to Tender Leads
        </Button>
      </Link>
    </Card>
  );
}

function NotFoundState() {
  return (
    <Card className="grid justify-items-center gap-3 p-12 text-center">
      <AlertTriangle className="h-8 w-8 text-ink-muted" strokeWidth={2} />
      <p className="text-sm font-semibold text-ink">Lead not found</p>
      <p className="max-w-sm text-xs text-ink-muted">This tender could not be found in the database. It may have been removed.</p>
      <Link to="/tender-leads" className="no-underline">
        <Button type="button" variant="secondary">
          <ArrowLeft className="h-4 w-4" /> Back to Tender Leads
        </Button>
      </Link>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="grid justify-items-center gap-3 p-12 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={2} />
      <p className="text-sm font-semibold text-danger">Couldn&apos;t load this lead</p>
      <p className="max-w-sm text-xs text-ink-muted">{message}</p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
        <Link to="/tender-leads" className="no-underline">
          <Button type="button" variant="ghost">Back to Tender Leads</Button>
        </Link>
      </div>
    </Card>
  );
}

function LeadDetails() {
  const [searchParams] = useSearchParams();
  const tenderId = searchParams.get('tenderId');

  const tenderQuery = useQuery({
    queryKey: ['tender', tenderId],
    queryFn: () => fetchTenderById(tenderId as string) as Promise<TenderResponse>,
    enabled: Boolean(tenderId),
    retry: (failureCount, error) => (error as { status?: number })?.status !== 404 && failureCount < 1,
  });

  if (!tenderId) {
    return (
      <div className="grid gap-2">
        <PageHeading />
        <div className="mt-4">
          <NoTenderSelected />
        </div>
      </div>
    );
  }

  if (tenderQuery.isLoading) {
    return (
      <div className="grid gap-2">
        <PageHeading />
        <div className="mt-4">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (tenderQuery.isError) {
    const status = (tenderQuery.error as { status?: number })?.status;
    return (
      <div className="grid gap-2">
        <PageHeading />
        <div className="mt-4">
          {status === 404 ? (
            <NotFoundState />
          ) : (
            <ErrorState
              message={tenderQuery.error instanceof Error ? tenderQuery.error.message : 'An unexpected error occurred.'}
              onRetry={() => tenderQuery.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const tender = tenderQuery.data!.tender;
  const status = tenderStatus(tender);
  const location = tenderLocation(tender);
  const contractDate = formatDate(tender.contract_date);
  const closingDate = formatDate(tender.closing_date);
  const contactLines = [tender.phone, tender.email].filter(Boolean);

  return (
    <div className="grid gap-6">
      <PageHeading />

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <Link to="/tender-leads" className="text-ink-muted no-underline hover:text-primary hover:no-underline">
                Tender Leads
              </Link>
              <span>/</span>
              <span className="truncate font-semibold text-ink">{tender.tender_id}</span>
            </nav>

            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">{tenderTitleFrom(tender)}</h2>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              <span>{tender.winning_company_name || 'Winning company not yet identified'}</span>
              <StatusBadge tone={STATUS_TONE[status.label] ?? 'neutral'}>{status.label}</StatusBadge>
            </div>
          </div>

          {tender.url && (
            <a href={tender.url} target="_blank" rel="noreferrer" className="shrink-0 no-underline">
              <Button type="button" variant="secondary">
                View on TenderBook <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Tender Information">
          <Field label="Tender ID" value={tender.tender_id} />
          <Field label="Tender Title" value={tenderTitleFrom(tender)} />
          <Field label="Winning Company" value={tender.winning_company_name} />
          <Field label="Winning Bid Amount" value={tender.winning_bid_amount} />
          <Field label="Tender Value" value={tender.amount} />
          <Field label="Buyer Department" value={tender.buyer_department} />
          <Field label="Category" value={tender.category} />
          <Field label="Location" value={location === '—' ? null : location} />
          <Field label="Contract Date" value={contractDate === '—' ? null : contractDate} />
          <Field label="Closing Date" value={closingDate === '—' ? null : closingDate} />
          <Field label="Source" value={tender.source} />
        </SectionCard>

        <SectionCard title="Company Information">
          <Field label="Company Name" value={tender.company_name} />
          {/* Backend has no company-address field yet — left ready to
              display once one exists, rather than reusing the unrelated
              buyer_address (the tender-issuing office, not this company). */}
          <Field label="Address" value={null} />
          <Field
            label="Contact"
            value={
              tender.contact_person || contactLines.length > 0 ? (
                <span className="grid gap-0.5">
                  {tender.contact_person && <span>{tender.contact_person}</span>}
                  {contactLines.map((line) => (
                    <span key={line} className="text-xs font-normal text-ink-muted">{line}</span>
                  ))}
                </span>
              ) : null
            }
          />
          <Field label="Website" value={tender.company_website} />
          <Field label="CIN" value={tender.cin} />
          <Field label="GST" value={tender.gst} />
        </SectionCard>
      </div>

      <CustomerCheckCard tenderId={tender.tender_id} />

      <HealthCheckCard tenderId={tender.tender_id} />

      <ProposalCard tender={tender} />

      <HumanReviewCard tender={tender} />

      <PipelineCard tender={tender} />

      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Quick Actions</h3>
        <p className="mt-1 text-xs text-ink-muted">This step isn&apos;t wired up yet — button is a placeholder for the upcoming workflow phase.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary">
            <FileText className="h-4 w-4" /> Generate Proposal
          </Button>
        </div>
      </Card>

      <DecisionTrail tenderId={tender.tender_id} />
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-ink">Lead Details</h2>
      <p className="mt-1 text-sm text-ink-soft">Review company information, contract history, and banking opportunity signals for a selected lead.</p>
    </div>
  );
}

export default LeadDetails;