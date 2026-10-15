import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../utils/formatters';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

// Deliberately no `w-full`: a native <select> sizes itself to its widest
// <option>, so leaving width auto is what makes labels like "All Tenders"
// or "Newest Scraped" render in full instead of being clipped by a
// container-driven width. `min-w` is only a floor for near-empty option
// lists, not the thing doing the sizing.
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, children, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="grid gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'h-10 w-auto min-w-[9rem] rounded-lg border border-hairline-strong bg-surface px-3 text-sm text-ink outline-none transition-colors',
            'focus:border-primary focus:ring-4 focus:ring-primary/10',
            'disabled:cursor-not-allowed disabled:opacity-60',
            className
          )}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
