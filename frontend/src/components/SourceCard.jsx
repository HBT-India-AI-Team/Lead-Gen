import { memo } from 'react';
import Badge from './ui/Badge';
import Card from './ui/Card';

function SourceCard({ source }) {
  const Icon = source.icon;
  return (
    <Card interactive className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
          <Icon className="h-6 w-6" />
        </div>
        <Badge tone={source.status === 'Limited' ? 'warning' : 'success'}>{source.connection}</Badge>
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-950">{source.name}</h3>
      <p className="mt-2 text-sm text-slate-500">{source.type}</p>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Last Sync</span><span className="font-semibold text-slate-800">{source.lastUpdated}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Latency</span><span className="font-semibold text-emerald-700">{source.latency || '120ms'}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Health</span><span className="font-semibold text-blue-700">{source.health || 'Healthy'}</span></div>
      </div>
    </Card>
  );
}

export default memo(SourceCard);
