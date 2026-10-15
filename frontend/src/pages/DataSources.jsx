import { memo } from 'react';
import { DATA_SOURCES } from '../constants/dashboard';
import { useDashboardData } from '../hooks/useDashboardData';
import SourceCard from '../components/SourceCard';
import Badge from '../components/ui/Badge';

function DataSources() {
  const { research } = useDashboardData();

  return (
    <div className="grid w-full min-w-0 justify-items-stretch gap-6">
      <section className="w-full rounded-2xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-blue-700">Data Sources</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Connected Intelligence Sources</h2>
          </div>
          <div className="flex justify-start lg:justify-end">
            <Badge tone="success">{research.activeSourceIds.length || DATA_SOURCES.length} Monitoring</Badge>
          </div>
        </div>
      </section>

      <section className="grid w-full min-w-0 gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DATA_SOURCES.map((source) => <SourceCard key={source.id} source={source} />)}
      </section>
    </div>
  );
}

export default memo(DataSources);