import { useState } from 'react';
import {
  LayoutGrid,
  Users,
  ClipboardCheck,
  Mail,
  BarChart3,
  Settings,
  MapPin,
  Building2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

type Stage = 'Identifying' | 'Qualifying' | 'Financial Check' | 'Human Review' | 'Won' | 'Lost';

interface Lead {
  id: string;
  company: string;
  buyer: string;
  category: string;
  location: string;
  tenderValue: string;
  winningBid: string | null;
  stage: Stage;
  qualificationScore: number | null;
  leadStatus: 'QUALIFIED_GOOD' | 'QUALIFIED_HITL' | 'QUALIFIED_BAD' | 'IDENTIFYING';
  healthScore: number | null;
  aiConfidence: number | null;
  advisory: {
    classification: string;
    reasoning: string;
    positiveSignals: string[];
    riskFactors: string[];
  } | null;
  recommendedProduct: { name: string; reason: string } | null;
  nextBestAction: string | null;
  financials: {
    revenue: string;
    netProfit: string;
    netProfitPositive: boolean;
    creditRating: string;
    compliance: string;
    incorporated: string;
  } | null;
}

const LEADS: Lead[] = [
  {
    id: 'TR5dhTJ-849455',
    company: 'Mallcom (India) Ltd',
    buyer: 'South Western Railway',
    category: 'Tender',
    location: 'Mysore, Karnataka',
    tenderValue: '₹3.51 Lac',
    winningBid: '₹3,51,050',
    stage: 'Won',
    qualificationScore: 85,
    leadStatus: 'QUALIFIED_GOOD',
    healthScore: 82,
    aiConfidence: 95,
    advisory: {
      classification: 'QUALIFIED_GOOD',
      reasoning:
        'Large-scale industrial player with an A credit rating, confirmed as the winning bidder for the South Western Railway safety-glove tender. Direct product and business fit for working capital support.',
      positiveSignals: [
        'Awarded winner, bid ₹3,51,050',
        'Annual revenue ₹470.9 Cr',
        'Credit rating A',
        'Employee growth 247 → 317',
      ],
      riskFactors: ['One GST filing marked late (West Bengal)'],
    },
    recommendedProduct: {
      name: 'Working Capital Finance',
      reason: 'Cash-flow support for the fulfilment cycle on a confirmed government supply contract.',
    },
    nextBestAction: 'Route to Relationship Manager for proposal outreach — evidence is complete.',
    financials: {
      revenue: '₹470.94 Cr',
      netProfit: '₹58.65 Cr',
      netProfitPositive: true,
      creditRating: 'A',
      compliance: 'Active Compliant',
      incorporated: '12 Dec 1983',
    },
  },
  {
    id: 'TRGHane-959080',
    company: 'Healthium Medtech Ltd',
    buyer: 'Maharashtra Medical Goods Procurement Authority',
    category: 'GST Registration',
    location: 'Bengaluru, Karnataka',
    tenderValue: '₹35.70 Lac',
    winningBid: '₹35,70,000',
    stage: 'Human Review',
    qualificationScore: 84,
    leadStatus: 'QUALIFIED_GOOD',
    healthScore: 68,
    aiConfidence: 91,
    advisory: {
      classification: 'QUALIFIED_GOOD',
      reasoning:
        'High revenue scale and an AA- credit rating outweigh a reported net loss. Fourteen active GST registrations show a wide, genuine operating footprint.',
      positiveSignals: ['Revenue ₹54.78 Cr', 'Credit rating AA-', '14 active GST registrations across states'],
      riskFactors: ['Reported net loss of ₹97.2 Cr — flagged for review', 'Funding requirement not yet confirmed'],
    },
    recommendedProduct: {
      name: 'Working Capital Finance',
      reason: 'Scale and multi-state footprint support a facility, pending financial review of the reported loss.',
    },
    nextBestAction: 'Hold for Relationship Manager sign-off on the net-loss finding before proposal.',
    financials: {
      revenue: '₹54.78 Cr',
      netProfit: '−₹97.2 Cr',
      netProfitPositive: false,
      creditRating: 'AA-',
      compliance: 'Active Compliant',
      incorporated: '27 Dec 1992',
    },
  },
  {
    id: 'TRBPxjC-175970',
    company: 'Japtech Engicorp Pvt Ltd',
    buyer: 'South Central Railway',
    category: 'Company Expansion',
    location: 'Pune, Maharashtra',
    tenderValue: '₹9.40 Lac',
    winningBid: '₹9,38,600',
    stage: 'Financial Check',
    qualificationScore: 67,
    leadStatus: 'QUALIFIED_HITL',
    healthScore: 54,
    aiConfidence: 78,
    advisory: {
      classification: 'QUALIFIED_HITL',
      reasoning:
        'Recently incorporated with modest disclosed revenue. No credit rating on file yet — score sits in the human-review band rather than an automatic pass.',
      positiveSignals: ['Awarded winner on a real government tender', 'Established establishment expansion evidence'],
      riskFactors: ['No credit rating available', 'Compliance status undisclosed'],
    },
    recommendedProduct: null,
    nextBestAction: 'Route to underwriter for a manual credit assessment before any proposal.',
    financials: {
      revenue: '₹65.79 Cr',
      netProfit: '₹35.0 Lac',
      netProfitPositive: true,
      creditRating: 'Not rated',
      compliance: 'Not disclosed',
      incorporated: '10 Aug 2023',
    },
  },
  {
    id: 'TRpO46G-182009',
    company: 'M/s. Deep Engineers',
    buyer: 'Integral Coach Factory',
    category: 'Tender',
    location: 'Chennai, Tamil Nadu',
    tenderValue: '₹24.69 Lac',
    winningBid: '₹24,68,938',
    stage: 'Identifying',
    qualificationScore: null,
    leadStatus: 'IDENTIFYING',
    healthScore: null,
    aiConfidence: null,
    advisory: null,
    recommendedProduct: null,
    nextBestAction: null,
    financials: null,
  },
];

const STAGES: Stage[] = ['Identifying', 'Qualifying', 'Financial Check', 'Human Review', 'Won'];

const STATUS_STYLES: Record<Lead['leadStatus'], { label: string; fg: string; bg: string; border: string }> = {
  QUALIFIED_GOOD: { label: 'Won', fg: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
  QUALIFIED_HITL: { label: 'Review', fg: '#8A5A00', bg: '#FFF6E5', border: '#F9A825' },
  QUALIFIED_BAD: { label: 'Lost', fg: '#C62828', bg: '#FDECEA', border: '#EF9A9A' },
  IDENTIFYING: { label: 'Identifying', fg: '#1976D2', bg: '#E9F2FC', border: '#7BAEE8' },
};

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutGrid },
  { label: 'Leads', icon: Users },
  { label: 'Human Review', icon: ClipboardCheck },
  { label: 'Communication', icon: Mail },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'Settings', icon: Settings },
];

function stageIndex(stage: Stage) {
  if (stage === 'Lost') return STAGES.indexOf('Financial Check');
  return STAGES.indexOf(stage);
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="grid gap-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">{label}</p>
      <p className="text-sm font-medium text-[#0F1B2D] tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

function ScoreDial({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="rounded-lg border border-[#E3E8EF] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">{label}</p>
      <p className="mt-1.5 text-3xl font-bold tabular-nums text-[#005BAC]">
        {value === null ? '—' : value}
        {value !== null && suffix && <span className="ml-0.5 text-base font-semibold text-[#8996A6]">{suffix}</span>}
      </p>
    </div>
  );
}

export default function LeadsMasterDetail() {
  const [selectedId, setSelectedId] = useState(LEADS[0].id);
  const [activeTab, setActiveTab] = useState<'Overview' | 'AI Analysis' | 'Financial Health'>('Overview');

  const lead = LEADS.find((item) => item.id === selectedId) ?? LEADS[0];
  const status = STATUS_STYLES[lead.leadStatus];
  const currentStageIndex = stageIndex(lead.stage);
  const isLost = lead.stage === 'Lost';

  function selectLead(id: string) {
    setSelectedId(id);
    setActiveTab('Overview');
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F5F7FA] font-sans text-[#0F1B2D]" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-[#E3E8EF] bg-white">
        <div className="flex items-center gap-2 border-b border-[#E3E8EF] px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-[#005BAC] text-sm font-bold text-white">S</div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-[#0F1B2D]">LeadGen AI</p>
            <p className="text-[11px] text-[#8996A6]">Relationship Banking</p>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {NAV_ITEMS.map(({ label, icon: Icon }) => {
            const active = label === 'Leads';
            return (
              <button
                key={label}
                type="button"
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active ? 'bg-[#E6F0FA] text-[#005BAC]' : 'text-[#48576B] hover:bg-[#F8FAFC]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="flex w-[320px] shrink-0 flex-col border-r border-[#E3E8EF] bg-white">
        <div className="border-b border-[#E3E8EF] px-4 py-4">
          <h1 className="text-base font-bold text-[#0F1B2D]">Leads</h1>
          <p className="mt-0.5 text-[13px] text-[#8996A6]">{LEADS.length} tender-backed leads</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {LEADS.map((item) => {
            const itemStatus = STATUS_STYLES[item.leadStatus];
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectLead(item.id)}
                className={`block w-full border-b border-[#F1F4F9] px-4 py-3 text-left transition-colors ${
                  selected ? 'bg-[#E6F0FA]' : 'hover:bg-[#F8FAFC]'
                }`}
                style={selected ? { boxShadow: 'inset 3px 0 0 #005BAC' } : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[13.5px] font-semibold text-[#0F1B2D]">{item.company}</p>
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                    style={{ color: itemStatus.fg, backgroundColor: itemStatus.bg, borderColor: itemStatus.border }}
                  >
                    {itemStatus.label}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12px] text-[#8996A6]">{item.category}</p>
                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className="font-semibold tabular-nums text-[#005BAC]">
                    {item.qualificationScore === null ? 'Not scored' : `Score ${item.qualificationScore}`}
                  </span>
                  <span className="font-medium tabular-nums text-[#48576B]">{item.tenderValue}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[#E3E8EF] bg-white px-8 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#8996A6]" strokeWidth={2} />
                <h2 className="text-xl font-bold text-[#0F1B2D]">{lead.company}</h2>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#48576B]">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                {lead.location} · {lead.buyer}
              </p>
            </div>
            <div className="flex gap-8">
              <Field label="Tender Value" value={lead.tenderValue} />
              <Field label="Winning Bid" value={lead.winningBid} />
              <Field label="Category" value={lead.category} />
            </div>
          </div>

          <div className="mt-6 flex items-center">
            {STAGES.map((stageName, index) => {
              const done = index < currentStageIndex || (index === currentStageIndex && !isLost);
              const isCurrent = index === currentStageIndex;
              const finalLabel = index === STAGES.length - 1 ? (isLost ? 'Lost' : 'Won') : stageName;
              return (
                <div key={stageName} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`grid h-6 w-6 place-items-center rounded-full border-2 text-[11px] font-bold ${
                        isCurrent
                          ? isLost
                            ? 'border-[#C62828] bg-[#C62828] text-white'
                            : 'border-[#005BAC] bg-[#005BAC] text-white'
                          : done
                            ? 'border-[#005BAC] bg-white text-[#005BAC]'
                            : 'border-[#D3DBE4] bg-white text-[#8996A6]'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={`whitespace-nowrap text-[11px] font-semibold ${
                        isCurrent ? (isLost ? 'text-[#C62828]' : 'text-[#005BAC]') : 'text-[#8996A6]'
                      }`}
                    >
                      {finalLabel}
                    </span>
                  </div>
                  {index < STAGES.length - 1 && (
                    <div className={`mx-2 h-[2px] flex-1 ${index < currentStageIndex ? 'bg-[#005BAC]' : 'bg-[#E3E8EF]'}`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex gap-6">
            {(['Overview', 'AI Analysis', 'Financial Health'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 pb-3 text-[13.5px] font-semibold transition-colors ${
                  activeTab === tab ? 'border-[#005BAC] text-[#005BAC]' : 'border-transparent text-[#8996A6] hover:text-[#48576B]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {activeTab === 'Overview' && (
            <div className="grid gap-6">
              <div className="rounded-lg border border-[#E3E8EF] bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#48576B]">Executive Summary</h3>
                <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <ScoreDial label="Qualification Score" value={lead.qualificationScore} />
                  <div className="rounded-lg border border-[#E3E8EF] bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">Lead Status</p>
                    <span
                      className="mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                      style={{ color: status.fg, backgroundColor: status.bg, borderColor: status.border }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <ScoreDial label="Health Check Score" value={lead.healthScore} />
                  <ScoreDial label="AI Confidence" value={lead.aiConfidence} suffix="%" />
                </div>
              </div>
              {!lead.advisory && (
                <div className="rounded-lg border border-dashed border-[#D3DBE4] bg-white p-5 text-center text-sm text-[#8996A6]">
                  This lead hasn't been through qualification yet.
                </div>
              )}
            </div>
          )}

          {activeTab === 'AI Analysis' && (
            <div className="grid gap-6">
              <div className="rounded-lg border border-[#E3E8EF] bg-white p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#005BAC]" strokeWidth={2} />
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[#48576B]">Qualification AI Advisory</h3>
                </div>
                {lead.advisory ? (
                  <div className="mt-4 grid gap-4">
                    <p className="text-[13.5px] leading-6 text-[#0F1B2D]">{lead.advisory.reasoning}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">Positive Signals</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {lead.advisory.positiveSignals.map((signal) => (
                            <span key={signal} className="rounded-full border border-[#A5D6A7] bg-[#E8F5E9] px-2.5 py-1 text-[11.5px] font-medium text-[#2E7D32]">
                              {signal}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">Risk Factors</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {lead.advisory.riskFactors.map((risk) => (
                            <span key={risk} className="rounded-full border border-[#EF9A9A] bg-[#FDECEA] px-2.5 py-1 text-[11.5px] font-medium text-[#C62828]">
                              {risk}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#8996A6]">Not available — qualification hasn't run for this lead.</p>
                )}
              </div>

              <div className="rounded-lg border border-[#E3E8EF] bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#48576B]">AI Recommendations</h3>
                <div className="mt-4 grid gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">Recommended Product</p>
                    {lead.recommendedProduct ? (
                      <div className="mt-2 rounded-lg border border-[#CCE1F5] bg-[#E6F0FA] p-3.5">
                        <p className="text-sm font-semibold text-[#0F1B2D]">{lead.recommendedProduct.name}</p>
                        <p className="mt-0.5 text-[12.5px] text-[#48576B]">{lead.recommendedProduct.reason}</p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-[#8996A6]">Not confidently identified yet.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">Next Best Action</p>
                    <p className="mt-1 text-[13.5px] text-[#0F1B2D]">{lead.nextBestAction ?? 'Awaiting qualification.'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Financial Health' && (
            <div className="rounded-lg border border-[#E3E8EF] bg-white p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#005BAC]" strokeWidth={2} />
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#48576B]">Financial Health (Probe42)</h3>
              </div>
              {lead.financials ? (
                <div className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-3">
                  <Field label="Revenue" value={lead.financials.revenue} />
                  <div className="grid gap-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8996A6]">Net Profit</p>
                    <p className={`text-sm font-medium tabular-nums ${lead.financials.netProfitPositive ? 'text-[#0F1B2D]' : 'text-[#C62828]'}`}>
                      {lead.financials.netProfit}
                    </p>
                  </div>
                  <Field label="Credit Rating" value={lead.financials.creditRating} />
                  <Field label="Compliance Status" value={lead.financials.compliance} />
                  <Field label="Incorporated" value={lead.financials.incorporated} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#8996A6]">No Probe42 company profile available for this winning company.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
