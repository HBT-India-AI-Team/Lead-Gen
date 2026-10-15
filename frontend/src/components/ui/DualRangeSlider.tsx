import { useCallback } from 'react';
import { cn } from '../../utils/formatters';

// Reusable two-thumb (min/max) range slider. No slider library exists in the
// dependency tree (verified: only native <input type="range"> is used
// elsewhere), so this is built on two stacked native range inputs — which
// gives arrow-key operability and screen-reader semantics for free — with a
// tinted "selected" band drawn between the thumbs. Both thumbs share one
// track; pointer-events are toggled so the topmost thumb under the cursor is
// the one that grabs (native dual-range has no built-in way to do this).

export interface DualRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChange: (next: { min: number; max: number }) => void;
  /** Accessible label prefix, e.g. "Tender value" -> "Tender value minimum". */
  ariaLabel: string;
  /** Optional formatter for the aria-valuetext (e.g. ₹ compact), display only. */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  id?: string;
}

function DualRangeSlider({
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChange,
  ariaLabel,
  formatValue,
  disabled,
  id,
}: DualRangeSliderProps) {
  const range = max - min || 1;
  const lowPct = ((valueMin - min) / range) * 100;
  const highPct = ((valueMax - min) / range) * 100;

  const handleLow = useCallback(
    (raw: number) => {
      // Clamp so the low thumb can never cross above the high thumb.
      const next = Math.min(raw, valueMax);
      onChange({ min: next, max: valueMax });
    },
    [valueMax, onChange]
  );

  const handleHigh = useCallback(
    (raw: number) => {
      const next = Math.max(raw, valueMin);
      onChange({ min: valueMin, max: next });
    },
    [valueMin, onChange]
  );

  const textOf = (value: number) => (formatValue ? formatValue(value) : String(value));

  return (
    <div className={cn('relative h-9 select-none', disabled && 'opacity-50')}>
      {/* Base track */}
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-hairline-strong" />
      {/* Selected band */}
      <div
        className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
        style={{ left: `${lowPct}%`, width: `${Math.max(highPct - lowPct, 0)}%` }}
      />
      {/* Low thumb */}
      <input
        id={id ? `${id}-min` : undefined}
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueMin}
        disabled={disabled}
        onChange={(event) => handleLow(Number(event.target.value))}
        aria-label={`${ariaLabel} minimum`}
        aria-valuetext={textOf(valueMin)}
        className="dual-range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        style={{ zIndex: valueMin > max - (max - min) / 2 ? 5 : 3 }}
      />
      {/* High thumb */}
      <input
        id={id ? `${id}-max` : undefined}
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueMax}
        disabled={disabled}
        onChange={(event) => handleHigh(Number(event.target.value))}
        aria-label={`${ariaLabel} maximum`}
        aria-valuetext={textOf(valueMax)}
        className="dual-range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        style={{ zIndex: 4 }}
      />
    </div>
  );
}

export default DualRangeSlider;
