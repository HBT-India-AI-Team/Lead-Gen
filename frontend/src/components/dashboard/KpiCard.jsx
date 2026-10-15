import { memo } from 'react';
import Card from '../ui/Card';
import { cn } from '../../utils/formatters';

const tones = {
  total: {
    icon: 'border-blue-100 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  averageScore: {
    icon: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  creditNeeds: {
    icon: 'border-amber-100 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  pending: {
    icon: 'border-rose-100 bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600',
    badge: 'bg-rose-50 text-rose-700 ring-rose-100',
  },
  approved: {
    icon: 'border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
};

function KpiCard({ item, value }) {
  const Icon = item.icon;
  const tone = tones[item.key] || tones.total;
  const isNegative = String(item.trend).trim().startsWith('-');

  return (
    <Card className="group flex h-full min-w-0 flex-col justify-between border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/5 transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-500">{item.label}</p>
          <p className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors duration-[250ms]', tone.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
        <span className="min-w-0 truncate text-sm font-medium text-slate-500">{item.subtitle}</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-1 text-xs font-bold ring-1 ring-inset',
            isNegative ? 'bg-rose-50 text-rose-700 ring-rose-100' : tone.badge
          )}
        >
          {item.trend}
        </span>
      </div>
    </Card>
  );
}

export default memo(KpiCard);