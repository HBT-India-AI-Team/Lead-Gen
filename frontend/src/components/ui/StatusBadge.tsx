import type { ReactNode } from 'react';
import { cn } from '../../utils/formatters';

// Existing tone names/prop contract are unchanged (every page already calls
// <StatusBadge tone="success"> etc.) — only the underlying colors were
// upgraded to the SBI/YONO banking palette. In this system's typical
// banking usage each tone reads as: success = Approved, warning = Pending,
// danger = Rejected, info = Active.
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'border-success-border bg-success-bg text-success', // Approved
  warning: 'border-warning-border bg-warning-bg text-warning', // Pending
  danger: 'border-danger-border bg-danger-bg text-danger', // Rejected
  info: 'border-info-border bg-info-bg text-info', // Active
  neutral: 'border-neutral-border bg-neutral-bg text-neutral',
};

// Standardized pill: one size, padding, and color logic used across every
// page so status pills stop reading as per-page one-offs. Height/padding are
// fixed here; callers only choose a tone.
function StatusBadge({ tone = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export default StatusBadge;