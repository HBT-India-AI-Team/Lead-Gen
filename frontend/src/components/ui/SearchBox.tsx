import { Search } from 'lucide-react';
import { cn } from '../../utils/formatters';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  id?: string;
}

function SearchBox({ value, onChange, placeholder = 'Search', className, label, id }: SearchBoxProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  const box = (
    <div
      className={cn(
        'flex h-10 items-center gap-2 rounded-lg border border-hairline-strong bg-surface px-3 transition-colors',
        'focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10',
        className
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2} />
      <input
        type="text"
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
      />
    </div>
  );

  if (!label) return box;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </label>
      {box}
    </div>
  );
}

export default SearchBox;