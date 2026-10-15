import React, { useState } from 'react';
import {
  LayoutDashboard,
  Layers,
  BarChart3,
  Settings,
  Search,
  Building2,
  MapPin,
  Tag,
  Award,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  ChevronRight,
  Sparkles,
  DollarSign,
  FileText,
  Mail,
  UserCheck,
  AlertTriangle,
  Check,
  ExternalLink,
  Copy,
  Send,
  Download,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';

// Types
type NavItem = 'dashboard' | 'leads' | 'analytics' | 'settings';
type WorkspaceTab = 'overview' | 'ai-analysis' | 'financial-health' | 'human-review' | 'communication';

interface PipelineStage {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'upcoming';
  date?: string;
}

interface LeadData {
  id: string;
  companyName: string;
  cin: string;
  tenderValue: string;
  winningBid: string;
  location: string;
  category: string;
  qualificationScore: number;
  qualificationStatus: 'QUALIFIED_GOOD' | 'HITL_REVIEW' | 'QUALIFIED_LOW';
  healthCheckScore: number;
  healthCheckStatus: 'HOT' | 'WARM' | 'LOW PRIORITY';
  currentStage: string;
  sbiCustomerStatus: boolean;
  cifNumber?: string;
  issuingAuthority: string;
  contractDate: string;
  closingDate: string;
}

// Sample B2B Lead Context
const MOCK_LEAD: LeadData = {
  id: 'TND-2026-8849',
  companyName: 'Larsen & Toubro Solar Infrastructure Ltd',
  cin: 'L40100MH2010PLC204918',
  tenderValue: '₹450.0 Cr',
  winningBid: '₹428.5 Cr',
  location: 'Mumbai, Maharashtra',
  category: 'Renewable Energy & EPC',
  qualificationScore: 94,
  qualificationStatus: 'QUALIFIED_GOOD',
  healthCheckScore: 88,
  healthCheckStatus: 'HOT',
  currentStage: 'Financial Check',
  sbiCustomerStatus: true,
  cifNumber: '884029104',
  issuingAuthority: 'NTPC Limited (Corporate Office, New Delhi)',
  contractDate: '2026-07-15',
  closingDate: '2026-08-30',
};

const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'identifying', label: 'Identifying', status: 'completed', date: 'Jul 16' },
  { id: 'qualifying', label: 'Qualifying', status: 'completed', date: 'Jul 18' },
  { id: 'financial_check', label: 'Financial Check', status: 'current', date: 'In Progress' },
  { id: 'human_review', label: 'Human Review', status: 'upcoming' },
  { id: 'won_lost', label: 'Won / Lost', status: 'upcoming' },
];

export default function B2BLeadWorkspaceDashboard() {
  const [activeNav, setActiveNav] = useState<NavItem>('leads');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('ai-analysis');
  const [inWorkspace, setInWorkspace] = useState<boolean>(true);
  const [copiedAction, setCopiedAction] = useState<boolean>(false);
  const [reviewNote, setReviewNote] = useState<string>('');

  const handleCopySummary = () => {
    setCopiedAction(true);
    setTimeout(() => setCopiedAction(false), 2000);
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] font-sans text-slate-800 antialiased">
      {/* 1. SIDEBAR: Top-level navigation only (Dashboard, Leads, Analytics, Settings) */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white">
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#005BAC] text-sm font-bold text-white shadow-xs">
            SBI
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">LeadGen AI</h1>
            <p className="text-[11px] font-medium text-slate-500">SBI Relationship Banking</p>
          </div>
        </div>

        {/* Top-Level Navigation Menu */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <button
            onClick={() => { setActiveNav('dashboard'); setInWorkspace(false); }}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
              activeNav === 'dashboard'
                ? 'bg-[#005BAC] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </button>

          <button
            onClick={() => { setActiveNav('leads'); setInWorkspace(true); }}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
              activeNav === 'leads'
                ? 'bg-[#005BAC] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            Leads
          </button>

          <button
            onClick={() => { setActiveNav('analytics'); setInWorkspace(false); }}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
              activeNav === 'analytics'
                ? 'bg-[#005BAC] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </button>

          <button
            onClick={() => { setActiveNav('settings'); setInWorkspace(false); }}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
              activeNav === 'settings'
                ? 'bg-[#005BAC] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </nav>

        {/* User Footer Profile */}
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#005BAC]/10 text-xs font-bold text-[#005BAC]">
              RM
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900">Rohan Sharma</p>
              <p className="truncate text-[10px] text-slate-500">Commercial Banking RM</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-1 flex-col pl-64">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-8 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            {inWorkspace && (
              <button
                onClick={() => setInWorkspace(false)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-[#005BAC]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Leads List
              </button>
            )}
            {inWorkspace && <span className="text-slate-300">/</span>}
            <span className="text-sm font-semibold text-slate-900">
              {inWorkspace ? `Lead Workspace — ${MOCK_LEAD.companyName}` : activeNav.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search leads, CIN, tenders..."
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:border-[#005BAC] focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                SBI Live Feed Active
              </span>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 p-8">
          {activeNav !== 'leads' && !inWorkspace ? (
            /* Standard Placeholder for Non-Leads Top-Level Views */
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <Building2 className="mb-3 h-10 w-10 text-slate-300" />
              <h3 className="text-base font-semibold text-slate-900 capitalize">{activeNav} View</h3>
              <p className="mt-1 text-xs text-slate-500">
                Select <button onClick={() => { setActiveNav('leads'); setInWorkspace(true); }} className="font-semibold text-[#005BAC] underline">Leads</button> to open the Lead Workspace journey.
              </p>
            </div>
          ) : !inWorkspace ? (
            /* Leads Table View (Click to open workspace) */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">B2B Relationship Banking Leads</h2>
                  <p className="text-xs text-slate-500">Identified corporate tenders and high-probability SBI financing leads</p>
                </div>
                <button
                  onClick={() => setInWorkspace(true)}
                  className="flex items-center gap-2 rounded-lg bg-[#005BAC] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#004b8e]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Open Lead Workspace
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Company Name</th>
                      <th className="px-6 py-3.5">Tender Value</th>
                      <th className="px-6 py-3.5">Location</th>
                      <th className="px-6 py-3.5">Pipeline Stage</th>
                      <th className="px-6 py-3.5">AI Score</th>
                      <th className="px-6 py-3.5">Health Check</th>
                      <th className="px-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr
                      onClick={() => setInWorkspace(true)}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {MOCK_LEAD.companyName}
                        <span className="block text-[10px] font-normal text-slate-500">CIN: {MOCK_LEAD.cin}</span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">{MOCK_LEAD.tenderValue}</td>
                      <td className="px-6 py-4">{MOCK_LEAD.location}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#005BAC] border border-blue-200">
                          {MOCK_LEAD.currentStage}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                          <Check className="h-3 w-3" /> {MOCK_LEAD.qualificationScore}/100
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                          {MOCK_LEAD.healthCheckStatus} ({MOCK_LEAD.healthCheckScore})
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-[#005BAC]">
                        Open Workspace →
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* 2-5. CONNECTED LEAD WORKSPACE JOURNEY */
            <div className="space-y-6">
              {/* 3. HORIZONTAL STATUS STEPPER AT THE TOP */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  {PIPELINE_STAGES.map((stage, idx) => {
                    const isCompleted = stage.status === 'completed';
                    const isCurrent = stage.status === 'current';
                    return (
                      <React.Fragment key={stage.id}>
                        <div className="flex flex-1 items-center gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                              isCompleted
                                ? 'bg-emerald-600 text-white'
                                : isCurrent
                                ? 'bg-[#005BAC] text-white ring-4 ring-blue-100'
                                : 'border border-slate-300 bg-slate-100 text-slate-400'
                            }`}
                          >
                            {isCompleted ? <Check className="h-4 w-4" /> : idx + 1}
                          </div>
                          <div>
                            <p
                              className={`text-xs font-semibold ${
                                isCurrent
                                  ? 'text-[#005BAC]'
                                  : isCompleted
                                  ? 'text-slate-900'
                                  : 'text-slate-400'
                              }`}
                            >
                              {stage.label}
                            </p>
                            {stage.date && (
                              <p className="text-[10px] text-slate-400">{stage.date}</p>
                            )}
                          </div>
                        </div>

                        {idx < PIPELINE_STAGES.length - 1 && (
                          <div
                            className={`mx-3 h-0.5 flex-1 transition-colors ${
                              isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* 4. PERSISTENT HEADER BLOCK (Across all tabs) */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-slate-900">{MOCK_LEAD.companyName}</h2>
                      {MOCK_LEAD.sbiCustomerStatus && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-[#005BAC] border border-blue-200">
                          <ShieldCheck className="h-3.5 w-3.5" /> SBI Existing CIF ({MOCK_LEAD.cifNumber})
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Tender ID: <span className="font-medium text-slate-700">{MOCK_LEAD.id}</span> • Authority:{' '}
                      <span className="font-medium text-slate-700">{MOCK_LEAD.issuingAuthority}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopySummary}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      {copiedAction ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedAction ? 'Copied Brief' : 'Share Lead'}
                    </button>
                    <button className="flex items-center gap-1.5 rounded-lg bg-[#005BAC] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#004b8e]">
                      <Send className="h-3.5 w-3.5" /> Fast-Track Sanction
                    </button>
                  </div>
                </div>

                {/* Persistent Key Metric Badges Grid */}
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[11px] font-medium text-slate-500">Tender Value</span>
                    <p className="mt-0.5 text-base font-bold text-slate-900">{MOCK_LEAD.tenderValue}</p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[11px] font-medium text-slate-500">Winning Bid (L1)</span>
                    <p className="mt-0.5 text-base font-bold text-emerald-700">{MOCK_LEAD.winningBid}</p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[11px] font-medium text-slate-500">Location</span>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-800">{MOCK_LEAD.location}</p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[11px] font-medium text-slate-500">Category</span>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-800">{MOCK_LEAD.category}</p>
                  </div>

                  <div className="rounded-lg bg-emerald-50/60 p-3 border border-emerald-100">
                    <span className="text-[11px] font-medium text-emerald-800">Qualification Score</span>
                    <p className="mt-0.5 text-base font-bold text-emerald-700">
                      {MOCK_LEAD.qualificationScore}/100 <span className="text-[10px] font-semibold text-emerald-600">({MOCK_LEAD.qualificationStatus})</span>
                    </p>
                  </div>

                  <div className="rounded-lg bg-blue-50/60 p-3 border border-blue-100">
                    <span className="text-[11px] font-medium text-blue-800">Health Check Score</span>
                    <p className="mt-0.5 text-base font-bold text-[#005BAC]">
                      {MOCK_LEAD.healthCheckScore}/100 <span className="text-[10px] font-semibold text-blue-600">({MOCK_LEAD.healthCheckStatus})</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. INTERNAL WORKSPACE TABS */}
              <div className="border-b border-slate-200">
                <nav className="flex space-x-6">
                  {[
                    { id: 'overview', label: 'Overview', icon: FileText },
                    { id: 'ai-analysis', label: 'AI Analysis', icon: Sparkles },
                    { id: 'financial-health', label: 'Financial Health', icon: TrendingUp },
                    { id: 'human-review', label: 'Human Review', icon: UserCheck },
                    { id: 'communication', label: 'Communication', icon: Mail },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as WorkspaceTab)}
                        className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
                          isActive
                            ? 'border-[#005BAC] text-[#005BAC]'
                            : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* TAB CONTENT PANELS */}
              <div className="space-y-6">
                {/* 5. TAB 1: AI ANALYSIS (Contains Qualification Advisory, Financial Health, AI Recommendations) */}
                {activeTab === 'ai-analysis' && (
                  <div className="space-y-6">
                    {/* Card 1: Qualification AI Advisory */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-[#005BAC]" />
                          <h3 className="text-base font-bold text-slate-900">Qualification AI Advisory</h3>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" /> High Conviction Match (94%)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        {/* Positive Signals */}
                        <div className="rounded-lg bg-emerald-50/40 p-4 border border-emerald-100">
                          <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Positive Signals</h4>
                          <ul className="mt-2.5 space-y-2 text-xs text-slate-700">
                            <li className="flex items-start gap-2">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>Official L1 Bidder for NTPC 500MW Solar Park Project (₹428.5 Cr).</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>Existing SBI Commercial CIF with immaculate 5-year repayment record.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>DSCR ratio of 2.1x comfortably satisfies LCH borrowing criteria.</span>
                            </li>
                          </ul>
                        </div>

                        {/* Risk Factors */}
                        <div className="rounded-lg bg-amber-50/40 p-4 border border-amber-100">
                          <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Risk Factors & Monitoring</h4>
                          <ul className="mt-2.5 space-y-2 text-xs text-slate-700">
                            <li className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                              <span>Tight execution timeline requires BG issuance within 60 days of award.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                              <span>Working capital peak expected in Q3 due to PV module procurement schedules.</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                      {/* AI Reasoning & Next Action */}
                      <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 space-y-3">
                        <div>
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">AI Strategic Reasoning</span>
                          <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                            Larsen & Toubro Solar Infrastructure Ltd is a premier EPC contractor with verified L1 status. Given their existing CIF relationship with SBI BKC Corporate Branch, SBI has an exclusive window to pre-empt private sector lenders by structuring a bundled Performance Bank Guarantee (₹85 Cr) and Cash Credit facility (₹120 Cr).
                          </p>
                        </div>
                        <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">Recommended Action:</span>
                            <span className="text-xs font-medium text-[#005BAC]">Dispatch pre-approved BG term sheet & schedule CFO call.</span>
                          </div>
                          <button className="rounded bg-[#005BAC] px-3 py-1 text-xs font-semibold text-white hover:bg-[#004b8e]">
                            Execute Action
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Financial Health (Probe42 & Corporate Intelligence) */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-[#005BAC]" />
                          <h3 className="text-base font-bold text-slate-900">Financial Health Summary (Probe42 Intelligence)</h3>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#005BAC] border border-blue-200">
                          CRISIL AA+ Rated
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium">Annual Revenue</span>
                          <p className="mt-1 text-sm font-bold text-slate-900">₹12,450 Cr</p>
                          <span className="text-[10px] text-emerald-600 font-medium">+18.4% YoY Growth</span>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium">Net Profit (PAT)</span>
                          <p className="mt-1 text-sm font-bold text-slate-900">₹840 Cr</p>
                          <span className="text-[10px] text-emerald-600 font-medium">6.7% Margin</span>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium">Compliance Status</span>
                          <p className="mt-1 text-sm font-bold text-emerald-700">Active / Compliant</p>
                          <span className="text-[10px] text-slate-500 font-medium">MCA Filings Up-to-Date</span>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                          <span className="text-[11px] text-slate-500 font-medium">Director Count</span>
                          <p className="mt-1 text-sm font-bold text-slate-900">8 Board Members</p>
                          <span className="text-[10px] text-slate-500 font-medium">CIN Verified</span>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: AI Recommendations (SBI Banking Product Matches) */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2">
                          <Award className="h-5 w-5 text-[#005BAC]" />
                          <h3 className="text-base font-bold text-slate-900">AI Product Recommendations for SBI Banking</h3>
                        </div>
                        <span className="text-xs text-slate-500">Cross-sell & financing opportunities</span>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#005BAC]">96% Match</span>
                            <span className="text-xs font-bold text-slate-900">₹85 Cr Line</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900">Performance Bank Guarantee (BG)</h4>
                          <p className="text-[11px] text-slate-600 leading-normal">
                            Required for NTPC 500MW project milestone performance security. Low risk fee income.
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">92% Match</span>
                            <span className="text-xs font-bold text-slate-900">₹120 Cr Line</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900">Fund-Based Working Capital</h4>
                          <p className="text-[11px] text-slate-600 leading-normal">
                            Cash Credit & Inland Letter of Credit for module procurement and site mobilization.
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">88% Match</span>
                            <span className="text-xs font-bold text-slate-900">YONO Integration</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900">Supply Chain Financing</h4>
                          <p className="text-[11px] text-slate-600 leading-normal">
                            Vendor invoice discounting portal for L&T sub-contractors and component suppliers.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: OVERVIEW */}
                {activeTab === 'overview' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                    <h3 className="text-base font-bold text-slate-900">Tender Context & Project Scope</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2">Project Scope Summary</h4>
                        <p className="leading-relaxed text-slate-600">
                          Engineering, Procurement, and Construction (EPC) contract for setting up 500MW Ultra Mega Solar Power Project in Pavagada Solar Park, Karnataka. Includes 25-year operation and maintenance.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2">Key Deadlines & Milestones</h4>
                        <ul className="space-y-1.5 text-slate-600">
                          <li>Contract Date: <span className="font-medium text-slate-900">{MOCK_LEAD.contractDate}</span></li>
                          <li>Tender Closing Date: <span className="font-medium text-slate-900">{MOCK_LEAD.closingDate}</span></li>
                          <li>Expected Commissioning: <span className="font-medium text-slate-900">Q3 2027</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: FINANCIAL HEALTH */}
                {activeTab === 'financial-health' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                    <h3 className="text-base font-bold text-slate-900">Detailed Financial Ratio Analysis</h3>
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <span className="text-slate-500 font-medium">Debt-to-Equity Ratio</span>
                        <p className="text-base font-bold text-slate-900 mt-1">0.65x</p>
                        <span className="text-[10px] text-emerald-600">Low Leverage</span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <span className="text-slate-500 font-medium">Current Ratio</span>
                        <p className="text-base font-bold text-slate-900 mt-1">1.45x</p>
                        <span className="text-[10px] text-emerald-600">Healthy Liquidity</span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <span className="text-slate-500 font-medium">Interest Coverage Ratio</span>
                        <p className="text-base font-bold text-slate-900 mt-1">5.8x</p>
                        <span className="text-[10px] text-emerald-600">Strong Solvency</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: HUMAN REVIEW */}
                {activeTab === 'human-review' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                    <h3 className="text-base font-bold text-slate-900">Relationship Manager Validation & Audit Sign-off</h3>
                    <div className="space-y-3 text-xs">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked className="rounded border-slate-300 text-[#005BAC]" />
                        <span>Verified L1 Bidder status from official CPPP e-Procurement portal</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked className="rounded border-slate-300 text-[#005BAC]" />
                        <span>Confirmed Probe42 compliance check (No active legal defaults)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded border-slate-300 text-[#005BAC]" />
                        <span>Obtained Credit Committee preliminary approval for ₹85 Cr Bank Guarantee limit</span>
                      </label>
                    </div>

                    <div className="pt-2">
                      <textarea
                        rows={3}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Add RM internal note or risk observation..."
                        className="w-full rounded-md border border-slate-200 p-3 text-xs focus:border-[#005BAC] focus:outline-none"
                      />
                      <button className="mt-2 rounded bg-[#005BAC] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#004b8e]">
                        Save Review Notes
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 5: COMMUNICATION */}
                {activeTab === 'communication' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-slate-900">AI-Generated Corporate Outreach Draft</h3>
                      <button className="flex items-center gap-1 text-xs font-semibold text-[#005BAC]">
                        <RefreshCw className="h-3.5 w-3.5" /> Regenerate Pitch
                      </button>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 text-xs space-y-2">
                      <p className="font-semibold text-slate-900">Subject: SBI Pre-Approved ₹85 Cr Guarantee Facility — NTPC Solar Park Tender</p>
                      <p className="text-slate-700 leading-relaxed">
                        Dear Mr. Varma,<br /><br />
                        Congratulations to Larsen & Toubro Solar Infrastructure Ltd on securing the L1 position for NTPC’s 500MW Ultra Mega Solar Power Project (Tender Value ₹450 Cr).<br /><br />
                        As your primary banking partner, State Bank of India (BKC Commercial Branch) has structured a fast-track ₹85 Cr Performance Bank Guarantee and ₹120 Cr Working Capital facility with preferential pricing.<br /><br />
                        We welcome a brief call this week with your treasury team to share the term sheet.
                      </p>
                    </div>
                    <button className="flex items-center gap-2 rounded bg-[#005BAC] px-4 py-2 text-xs font-semibold text-white hover:bg-[#004b8e]">
                      <Mail className="h-3.5 w-3.5" /> Send Outreach Email via SBI Portal
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
