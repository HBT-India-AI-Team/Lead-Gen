import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Inbox, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import type { StatusTone } from '../components/ui/StatusBadge';
import { fetchHealthCheck } from '../services/tendersApi';
import { fetchLeadById } from '../services/leadsApi';
import { fetchLeadAnalysisWithAi } from '../services/leadAnalysisApi';
import { formatDate, tenderTitleFrom, tenderLocation } from '../utils/tenderFormatters';

// PHASE 11 — this page now combines THREE real, already-existing backend
// sources for one tenderId, none of them new:
//
// 1. GET /api/leads/:id (leadsApi.fetchLeadById) — the real, PERSISTED PHASE 1
//    qualification result (tenders.lead_status/qualification_score/
//    qualification_reason.aiAnalysis — see leadQualificationPipelineService.js).
//    This is the "Deterministic Qualification — Authoritative" score used
//    everywhere else in the app (HumanReview.tsx, Communication.tsx) — never
//    recomputed or renamed here.
// 2. GET /api/tenders/:tenderId/health-check (tendersApi.fetchHealthCheck) —
//    the separate, pre-existing Health Check scoring system
//    (companyIntelligenceService -> leadScoringService -> recommendationService,
//    see healthCheckService.js) plus the real Probe42 companyProfile. This is
//    a DIFFERENT real score (HOT/WARM/QUALIFIED/LOW PRIORITY) from #1's
//    QUALIFIED_GOOD/HITL/BAD — shown separately, never merged into one number,
//    per "do not create a new scoring system".
// 3. POST /api/lead-analysis/ai (leadAnalysisApi.fetchLeadAnalysisWithAi) —
//    the existing OllamaAnalysisService narrative (executiveSummary/
//    businessOpportunity/riskAnalysis/talkingPoints/engagementStrategy/
//    nextBestAction — see ollamaAnalysisService.js). This endpoint takes a
//    tender record in the request body (it has no tenderId lookup of its
//    own), so buildAnalysisInput() below reshapes the real lead into that
//    body using the EXACT SAME company/department remapping
//    healthCheckService.js already documents and performs server-side
//    (winning company, not the tender-issuing buyer) — no new business rule,
//    just replaying an existing documented convention client-side since no
//    single existing endpoint returns both the Health Check data and this
//    narrative together.
//
// Nothing here recomputes a score, calls a second Ollama agent, or touches
// Probe42/qualification logic — every field is read-only, straight from one
// of these three real responses.

interface QualificationAiAnalysis {
  status: string;
  score?: number;
  classification?: string;
  confidence?: number;
  reasoning?: string;
  positiveSignals?: string[];
  riskFactors?: string[];
  missingEvidence?: string[];
  recommendedNextAction?: string;
}

// Real `tenders` row shape as returned by GET /api/leads/:id (same shape
// HumanReview.tsx/Communication.tsx already read) — every field here is a
// real column; qualification_* only ever gets set by the real PHASE 1
// pipeline.
interface Lead {
  tender_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  location: string | null;
  tender_city: string | null;
  tender_state: string | null;
  company_name: string | null;
  buyer_department: string | null;
  amount: string | null;
  contract_date: string | null;
  closing_date: string | null;
  winning_company_name: string | null;
  winning_bid_amount: string | null;
  pipeline_status: string;
  lead_status: string;
  qualification_score: number | null;
  qualification_reason: { aiAnalysis?: QualificationAiAnalysis } | null;
}

interface LeadResponse {
  lead: Lead;
}

// Real GET /api/tenders/:tenderId/health-check response shape (see
// src/services/healthCheckService.js / src/services/leadAnalysisService.js).
interface HealthCheckResult {
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
      recommendedProducts: Array<{ product: string; reason?: string }>;
    };
  } | null;
}

// Real POST /api/lead-analysis/ai response shape (see
// ollamaAnalysisService.js's EXPECTED_FIELDS / ollamaPromptBuilder.js's
// RESPONSE_SHAPE_INSTRUCTIONS — exactly these six keys, nothing else).
interface LeadAnalysisAiResponse {
  aiAnalysis: {
    executiveSummary: string;
    businessOpportunity: string;
    riskAnalysis: string;
    talkingPoints: string[];
    engagementStrategy: string;
    nextBestAction: string;
  };
}

const GRADE_TONE: Record<string, StatusTone> = {
  HOT: 'success',
  WARM: 'warning',
  QUALIFIED: 'info',
  'LOW PRIORITY': 'neutral',
};

const QUALIFICATION_TONE: Record<string, StatusTone> = {
  QUALIFIED_GOOD: 'success',
  QUALIFIED_HITL: 'warning',
  QUALIFIED_BAD: 'danger',
};

// Mirrors healthCheckService.js's runHealthCheck() field remapping exactly
// (see that file's own comment for why): the entity being analyzed is the
// WINNING company, not the tender-issuing buyer that `company_name` holds
// on a raw `tenders` row.
function buildAnalysisInput(lead: Lead) {
  const companyChecked = lead.winning_company_name || lead.company_name;
  return {
    ...lead,
    company: companyChecked,
    company_name: companyChecked,
    department: lead.buyer_department,
  };
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="text-sm font-medium text-ink">{value ?? '—'}</p>
    </div>
  );
}

function SectionLoading() {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-muted">
      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
      Loading…
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-danger" strokeWidth={2} />
      <p className="text-sm text-danger">{message}</p>
      <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-ink">AI Executive Analysis</h2>
      <p className="mt-1 text-sm text-ink-soft">AI-generated insights and recommendations for engaging a prospective banking client.</p>
    </div>
  );
}

function NoTenderSelected() {
  return (
    <Card className="grid justify-items-center gap-3 p-12 text-center">
      <Inbox className="h-8 w-8 text-ink-muted" strokeWidth={2} />
      <p className="text-sm font-semibold text-ink">No tender selected</p>
      <p className="max-w-sm text-xs text-ink-muted">Choose a tender from Tender Leads to view its AI executive analysis.</p>
      <Link to="/tender-leads" className="no-underline">
        <Button type="button" variant="secondary">
          <ArrowLeft className="h-4 w-4" /> Back to Tender Leads
        </Button>
      </Link>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-6 animate-pulse">
      <Card className="h-32 p-5" />
      <Card className="h-48 p-5" />
      <Card className="h-40 p-5" />
      <Card className="h-24 p-5" />
      <Card className="h-32 p-5" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="grid justify-items-center gap-3 p-12 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" strokeWidth={2} />
      <p className="text-sm font-semibold text-danger">Couldn&apos;t load the executive analysis</p>
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

function AIExecutiveAnalysis() {
  const [searchParams] = useSearchParams();
  const tenderId = searchParams.get('tenderId');

  const leadQuery = useQuery({
    queryKey: ['ai-executive-analysis-lead', tenderId],
    queryFn: () => fetchLeadById(tenderId as string) as Promise<LeadResponse>,
    enabled: Boolean(tenderId),
  });

  const healthCheckQuery = useQuery({
    queryKey: ['ai-executive-analysis-health-check', tenderId],
    queryFn: () => fetchHealthCheck(tenderId as string) as Promise<HealthCheckResult>,
    enabled: Boolean(tenderId),
  });

  const lead = leadQuery.data?.lead;

  const aiNarrativeQuery = useQuery({
    queryKey: ['ai-executive-analysis-narrative', tenderId],
    queryFn: () => fetchLeadAnalysisWithAi(buildAnalysisInput(lead as Lead)) as Promise<LeadAnalysisAiResponse>,
    enabled: Boolean(lead),
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

  if (leadQuery.isLoading) {
    return (
      <div className="grid gap-2">
        <PageHeading />
        <div className="mt-4">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (leadQuery.isError || !lead) {
    return (
      <div className="grid gap-2">
        <PageHeading />
        <div className="mt-4">
          <ErrorState
            message={leadQuery.error instanceof Error ? leadQuery.error.message : 'This lead could not be found.'}
            onRetry={() => leadQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  const healthCheck = healthCheckQuery.data;
  const healthAnalysis = healthCheck?.leadAnalysis ?? null;
  const profile = healthCheck?.companyProfile ?? null;
  const qualificationAi = lead.qualification_reason?.aiAnalysis;
  const isQualified = lead.qualification_score !== null && lead.qualification_score !== undefined;
  const narrative = aiNarrativeQuery.data?.aiAnalysis;

  return (
    <div className="grid gap-6">
      <PageHeading />

      {/* 1. Executive Summary — company + tender + both real, distinct scores */}
      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Executive Summary</h3>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company Name" value={lead.winning_company_name || lead.company_name} />
          <Field label="Tender" value={tenderTitleFrom(lead)} />
          <Field label="Location" value={tenderLocation(lead) === '—' ? null : tenderLocation(lead)} />
          <Field label="Tender Value" value={lead.amount} />
          <Field label="Winning Bid" value={lead.winning_bid_amount} />
          <Field label="Category" value={lead.category} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 border-t border-hairline pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Qualification Score</p>
            <p className="mt-1 text-2xl font-bold text-primary">{isQualified ? lead.qualification_score : '—'}</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">Deterministic — Authoritative</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Lead Status</p>
            <StatusBadge tone={QUALIFICATION_TONE[lead.lead_status] ?? 'neutral'} className="mt-1">{lead.lead_status}</StatusBadge>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Health Check Score</p>
            {healthCheckQuery.isLoading ? (
              <div className="mt-2 h-6 w-16 animate-pulse rounded bg-surface-sunken" />
            ) : healthAnalysis ? (
              <>
                <p className="mt-1 text-2xl font-bold text-primary">{healthAnalysis.score.score}</p>
                <StatusBadge tone={GRADE_TONE[healthAnalysis.score.grade] ?? 'neutral'} className="mt-1">{healthAnalysis.score.grade}</StatusBadge>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">—</p>
            )}
            <p className="mt-0.5 text-[11px] text-ink-muted">Separate Health Check system</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">AI Confidence</p>
            {qualificationAi?.status === 'AVAILABLE' && typeof qualificationAi.confidence === 'number' ? (
              <>
                <p className="mt-1 text-2xl font-bold text-primary">{Math.round(qualificationAi.confidence * 100)}%</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">Qualification AI advisory (Ollama)</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">{isQualified ? 'AI advisory unavailable for this lead.' : 'Not yet qualified.'}</p>
            )}
          </div>
        </div>
      </Card>

      {/* 2. Qualification AI Advisory — real, persisted PHASE 1 Ollama output, distinct from the Lead Analysis narrative below */}
      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Qualification AI Advisory (Ollama — not the authoritative score)</h3>
        {!isQualified ? (
          <p className="mt-3 text-sm text-ink-muted">This lead hasn&apos;t been through qualification yet.</p>
        ) : !qualificationAi ? (
          <p className="mt-3 text-sm text-ink-muted">No AI advisory analysis was recorded for this lead.</p>
        ) : qualificationAi.status !== 'AVAILABLE' ? (
          <p className="mt-3 text-sm text-ink-muted">AI advisory analysis was unavailable when this lead was qualified.</p>
        ) : (
          <div className="mt-4 grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Advisory Score" value={qualificationAi.score} />
              <Field label="Advisory Classification" value={qualificationAi.classification} />
              <Field label="Recommended Next Action" value={qualificationAi.recommendedNextAction} />
            </div>
            {qualificationAi.reasoning && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reasoning</p>
                <p className="mt-1 text-sm text-ink">{qualificationAi.reasoning}</p>
              </div>
            )}
            {(qualificationAi.positiveSignals?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Positive Signals</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {qualificationAi.positiveSignals!.map((item) => <StatusBadge key={item} tone="success">{item}</StatusBadge>)}
                </div>
              </div>
            )}
            {(qualificationAi.riskFactors?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Risk Factors</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {qualificationAi.riskFactors!.map((item) => <StatusBadge key={item} tone="danger">{item}</StatusBadge>)}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 3. Financial Health (Probe42) */}
      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Financial Health (Probe42)</h3>
        {healthCheckQuery.isLoading ? (
          <SectionLoading />
        ) : healthCheckQuery.isError ? (
          <SectionError
            message={healthCheckQuery.error instanceof Error ? healthCheckQuery.error.message : "Couldn't load Health Check data."}
            onRetry={() => healthCheckQuery.refetch()}
          />
        ) : profile ? (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Revenue" value={profile.annual_revenue ? `₹${Number(profile.annual_revenue).toLocaleString('en-IN')}` : null} />
            <Field label="Net Profit" value={profile.net_profit ? `₹${Number(profile.net_profit).toLocaleString('en-IN')}` : null} />
            <Field label="Credit Rating" value={profile.credit_rating} />
            <Field label="Compliance Status" value={profile.compliance_status} />
            <Field label="Director Count" value={profile.director_count} />
            <Field
              label="Incorporation Date"
              value={profile.incorporation_date ? formatDate(profile.incorporation_date.slice(0, 10)) : null}
            />
            <Field label="CIN" value={profile.cin} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">No Probe42 company profile available for this winning company.</p>
        )}
      </Card>

      {/* 4. AI Recommendations — real recommended products (Health Check) + real relationship strategy / next best action (Lead Analysis AI) */}
      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">AI Recommendations</h3>
        <div className="mt-4 grid gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recommended Banking Products</p>
            {healthCheckQuery.isLoading ? (
              <div className="mt-2"><SectionLoading /></div>
            ) : (healthAnalysis?.recommendations.recommendedProducts.length ?? 0) > 0 ? (
              <div className="mt-2 grid gap-3">
                {healthAnalysis!.recommendations.recommendedProducts.map((item) => (
                  <div key={item.product} className="rounded-xl border border-primary-tint-2 bg-primary-tint p-4">
                    <p className="text-sm font-semibold text-ink">{item.product}</p>
                    {item.reason && <p className="mt-0.5 text-xs text-ink-soft">{item.reason}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">No recommendations available.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Relationship Strategy</p>
            {aiNarrativeQuery.isLoading ? (
              <div className="mt-1"><SectionLoading /></div>
            ) : aiNarrativeQuery.isError ? (
              <div className="mt-1"><SectionError
                message={aiNarrativeQuery.error instanceof Error ? aiNarrativeQuery.error.message : "Couldn't reach the AI analysis service."}
                onRetry={() => aiNarrativeQuery.refetch()}
              /></div>
            ) : narrative ? (
              <p className="mt-1 text-sm text-ink">{narrative.engagementStrategy}</p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Not available.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next Best Action</p>
            {aiNarrativeQuery.isLoading ? (
              <div className="mt-1"><SectionLoading /></div>
            ) : narrative ? (
              <p className="mt-1 text-sm text-ink">{narrative.nextBestAction}</p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Not available.</p>
            )}
          </div>
        </div>
      </Card>

      {/* 5. Business Signals */}
      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Business Signals</h3>
        {healthCheckQuery.isLoading ? (
          <div className="mt-3"><SectionLoading /></div>
        ) : (healthAnalysis?.intelligence.signals.length ?? 0) > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {healthAnalysis!.intelligence.signals.map((signal) => (
              <StatusBadge key={signal} tone="neutral">{signal}</StatusBadge>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">No signals available.</p>
        )}
      </Card>

      {/* 6. AI Executive Summary — real Ollama narrative */}
      <Card className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">AI Executive Summary</h3>
        {aiNarrativeQuery.isLoading ? (
          <div className="mt-3"><SectionLoading /></div>
        ) : aiNarrativeQuery.isError ? (
          <div className="mt-3">
            <SectionError
              message={aiNarrativeQuery.error instanceof Error ? aiNarrativeQuery.error.message : "Couldn't reach the AI analysis service."}
              onRetry={() => aiNarrativeQuery.refetch()}
            />
          </div>
        ) : narrative ? (
          <div className="mt-4 grid gap-5">
            <p className="text-sm text-ink">{narrative.executiveSummary}</p>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Business Opportunity</p>
              <p className="mt-1 text-sm text-ink">{narrative.businessOpportunity}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Risk Analysis</p>
              <p className="mt-1 text-sm text-ink">{narrative.riskAnalysis}</p>
            </div>

            {narrative.talkingPoints.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Talking Points</p>
                <ul className="mt-2 grid gap-1 text-sm text-ink">
                  {narrative.talkingPoints.map((point) => (
                    <li key={point} className="flex gap-2"><span className="text-ink-muted">•</span> {point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">No AI executive summary available.</p>
        )}
      </Card>
    </div>
  );
}

export default AIExecutiveAnalysis;