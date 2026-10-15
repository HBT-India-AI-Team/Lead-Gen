import { memo } from 'react';
import { ClockIcon, QueueListIcon } from '@heroicons/react/24/outline';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import { formatDateTime } from '../../utils/formatters';

function ResearchHistory({ items }) {
  if (!items.length) return null;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-700">History</p>
          <h2 className="text-lg font-bold text-slate-950">Research Timeline</h2>
        </div>
        <QueueListIcon className="h-5 w-5 text-slate-400" />
      </div>
      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.id} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-blue-700" />
                <p className="text-sm font-bold text-slate-900">{item.sector}</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{formatDateTime(item.timestamp)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="info">{item.source}</Badge>
              <Badge tone="success">{item.companiesFound} companies</Badge>
              <Badge tone={item.status === 'Failed' ? 'danger' : 'success'}>{item.status}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.creditNeeds?.slice(0, 4).map((need) => <Badge key={need}>{need}</Badge>)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default memo(ResearchHistory);
