import { memo } from 'react';
import Badge from './ui/Badge';
import { formatDateTime } from '../utils/formatters';

function TimelineCard({ item }) {
  return (
    <div className="relative pl-8">
      <span className="absolute left-0 top-2 h-3 w-3 rounded-full bg-blue-700 shadow-[0_0_0_5px_rgba(37,99,235,0.12)]" />
      <span className="absolute bottom-0 left-[5px] top-6 w-px bg-slate-200" />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-bold text-slate-950">{item.company || item.sector}</p>
            <p className="text-sm text-slate-500">{item.source} Â· {formatDateTime(item.timestamp)}</p>
          </div>
          <Badge tone={item.status === 'Failed' ? 'danger' : 'success'}>{item.status}</Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">{item.source}</Badge>
          <Badge>{item.companiesFound} companies</Badge>
          {item.opportunityScore && <Badge tone="success">{item.opportunityScore}</Badge>}
          {item.creditNeeds?.slice(0, 4).map((need) => <Badge key={need}>{need}</Badge>)}
        </div>
      </div>
    </div>
  );
}

export default memo(TimelineCard);
