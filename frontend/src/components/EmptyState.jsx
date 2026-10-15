import { memo } from 'react';
import { Link } from 'react-router-dom';
import Button from './ui/Button';
import { cn } from '../utils/formatters';

function EmptyState({ icon: Icon, title, message, actionLabel, onAction, actionTo, compact = false }) {
  const actionClasses = 'mt-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5';

  return (
    <div
      className={cn(
        'group relative isolate flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-blue-200/80 bg-gradient-to-br from-white via-blue-50/40 to-slate-50 p-8 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl',
        compact ? 'min-h-48 p-6' : 'min-h-64'
      )}
    >
      <div className="absolute inset-x-10 top-0 h-20 rounded-full bg-blue-200/25 blur-3xl transition duration-300 group-hover:bg-blue-300/30" />
      <div className="relative flex max-w-sm flex-col items-center">
        {Icon && (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-white text-blue-700 shadow-lg shadow-blue-900/10 transition duration-300 group-hover:scale-105 group-hover:bg-blue-700 group-hover:text-white">
            <Icon className="h-7 w-7" />
          </div>
        )}
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        {actionLabel && actionTo && (
          <Link
            className={cn('inline-flex items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white no-underline shadow-lg shadow-blue-900/15 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-800 hover:no-underline', actionClasses)}
            to={actionTo}
          >
            {actionLabel}
          </Link>
        )}
        {actionLabel && !actionTo && onAction && (
          <Button
            className={actionClasses}
            type="button"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export default memo(EmptyState);