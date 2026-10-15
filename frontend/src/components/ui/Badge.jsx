import { memo } from 'react';
import { cn } from '../../utils/formatters';

const tones = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  neutral: 'border-slate-200 bg-slate-100 text-slate-600',
};

function Badge({ children, tone = 'neutral', className = '' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-normal', tones[tone], className)}>
      {children}
    </span>
  );
}

export default memo(Badge);
