import { memo } from 'react';
import { DATA_SOURCES } from '../../constants/dashboard';
import Badge from '../ui/Badge';
import Card from '../ui/Card';

function DataSourcesPanel({ activeSourceIds = [] }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-700">Data Sources</p>
          <h2 className="text-lg font-bold text-slate-950">Connections</h2>
        </div>
        <Badge tone="info">{activeSourceIds.length || DATA_SOURCES.length} active</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {DATA_SOURCES.map((source) => {
          const Icon = source.icon;
          const active = activeSourceIds.length === 0 || activeSourceIds.includes(source.id);
          return (
            <div key={source.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-blue-200 hover:bg-white hover:shadow-lg hover:shadow-slate-900/5">
              <div className="flex items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{source.name}</p>
                  <p className="text-xs text-slate-500">{source.type}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone={active ? 'success' : 'neutral'}>{source.connection}</Badge>
                <Badge tone={source.status === 'Limited' ? 'warning' : 'info'}>{source.lastUpdated}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default memo(DataSourcesPanel);
