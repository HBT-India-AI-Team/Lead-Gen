import { memo, useMemo, useState } from 'react';
import { SECTORS, SECTOR_PROFILES } from '../constants/dashboard';
import { buildSectorResearch } from '../utils/research';
import { useDashboardData } from '../hooks/useDashboardData';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ProgressBar from '../components/ui/ProgressBar';
import SectorResearchGrid from '../components/dashboard/SectorResearchGrid';

function SectorResearch() {
  const { research, companies } = useDashboardData();
  const [sector, setSector] = useState('SaaS');
  const summary = useMemo(() => buildSectorResearch(sector), [sector]);
  const sectorCompanies = useMemo(() => companies.filter((company) => company.sector === sector), [companies, sector]);
  const profile = SECTOR_PROFILES[sector];

  return (
    <div className="grid gap-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">Sector Research</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Analyze one industry</h2>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="grid gap-2 text-xs font-semibold uppercase text-slate-500">
              Sector
              <select className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm normal-case text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" value={sector} onChange={(event) => setSector(event.target.value)}>
                {SECTORS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <Button type="button" disabled={research.isResearching} onClick={() => research.analyzeSector(sector)}>
              {research.activeKey === `sector:${sector}` ? 'Analyzing' : 'Analyze'}
            </Button>
          </div>
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase text-blue-700">Sector Summary</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">{sector}</h3>
          <p className="mt-2 text-sm text-slate-500">{profile.focus}</p>
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-sm font-semibold text-slate-600">
              <span>Growth Trend</span><span>{profile.score}</span>
            </div>
            <ProgressBar value={profile.score} />
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase text-blue-700">Companies Found</p>
          <p className="mt-2 text-4xl font-bold text-slate-950">{sectorCompanies.length}</p>
          <p className="mt-2 text-sm text-slate-500">Generated and discovered leads</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase text-blue-700">Opportunity Distribution</p>
          <div className="mt-4 grid gap-4">
            {sectorCompanies.slice(0, 4).map((company) => (
              <div key={company.id}>
                <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                  <span>{company.name}</span><span>{company.opportunity_score}</span>
                </div>
                <ProgressBar value={company.opportunity_score} />
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase text-blue-700">Market Signals</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {['Recent Funding', 'Government Schemes', 'Recent Tenders', 'Hiring Trend', 'Growth Trend', 'Top Credit Needs'].map((label, index) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">{label}</p>
                <p className="mt-2 text-sm text-slate-500">{summary.signals[index % summary.signals.length]}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase text-blue-700">Generated Leads</p>
          <div className="mt-4 grid gap-4">
            {summary.generatedLeads.map((lead) => (
              <div key={lead.name} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="font-bold text-slate-950">{lead.name}</p>
                  <p className="text-sm text-slate-500">{lead.tags}</p>
                </div>
                <Badge tone="info">{lead.opportunity_score}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <SectorResearchGrid activeKey={research.activeKey} disabled={research.isResearching} onAnalyze={research.analyzeSector} />
    </div>
  );
}

export default memo(SectorResearch);
