import { useId } from 'react';
import { cn } from '../../utils/formatters';

// Reusable score-threshold control. ONE component, reused for all four score
// types (Financial Health, Credit Rating, Compliance, Business Vintage) —
// pass label/min/max/bands/threshold. This sets the ADMIN cutoff
// the backend scoring logic would use ("minimum acceptable score"); it is NOT
// a per-lead readout, so it never displays a specific lead's computed score.
//
// Rendered as a segmented band bar (Poor / Fair / Good / Excellent) with a
// single draggable marker (native <input type="range"> -> arrow-key operable)
// and a live numeric + band readout of where the cutoff currently sits.

export interface ScoreBand {
  label: string;
  /** Inclusive lower bound of this band, in the same units as min/max. */
  from: number;
  /** Hex colour for this band segment. */
  color: string;
}

export interface ScoreThresholdSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  /** Current admin cutoff ("minimum acceptable score"). */
  threshold: number;
  onChange: (next: number) => void;
  /** Ordered low->high; the last band whose `from` <= value wins. */
  bands: ScoreBand[];
  /** Optional short helper under the label (e.g. "typical range 300–900"). */
  hint?: string;
  disabled?: boolean;
}

export function bandForValue(bands: ScoreBand[], value: number): ScoreBand {
  let current = bands[0];
  for (const band of bands) {
    if (value >= band.from) current = band;
  }
  return current;
}

function ScoreThresholdSlider({
  label,
  min,
  max,
  step = 1,
  threshold,
  onChange,
  bands,
  hint,
  disabled,
}: ScoreThresholdSliderProps) {
  const inputId = useId();
  const range = max - min || 1;
  const markerPct = ((threshold - min) / range) * 100;
  const activeBand = bandForValue(bands, threshold);

  return (
    <div className={cn('grid gap-1.5', disabled && 'opacity-60')}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {label}
          </label>
          {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
        </div>
        <div className="flex items-baseline gap-1.5 text-right">
          <span className="text-lg font-bold text-ink tabular-nums">{threshold}</span>
          {/* Deliberately NOT a rounded pill — this is the admin's chosen cutoff
              tier, not a computed lead score, and real scores render as pill
              badges (StatusBadge) elsewhere in the app. Plain colored text
              keeps the two visually distinct at a glance. */}
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: activeBand.color }}>
            cutoff: {activeBand.label}
          </span>
        </div>
      </div>

      {/* Segmented band bar + draggable marker */}
      <div className="relative h-6 select-none">
        {/* Band segments */}
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 flex h-2.5 -translate-y-1/2 overflow-hidden rounded-full">
          {bands.map((band, index) => {
            const next = bands[index + 1];
            const segFrom = band.from;
            const segTo = next ? next.from : max;
            const widthPct = ((segTo - segFrom) / range) * 100;
            return (
              <div
                key={band.label}
                style={{ width: `${widthPct}%`, backgroundColor: band.color }}
                className="h-full"
              />
            );
          })}
        </div>
        {/* Cutoff marker line */}
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-ink"
          style={{ left: `${markerPct}%` }}
        />
        {/* Native range input drives the marker; thumb coloured to the band */}
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={threshold}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={`${label} — minimum acceptable score`}
          aria-valuetext={`${threshold}, ${activeBand.label}`}
          className="score-threshold-thumb absolute inset-0 w-full appearance-none bg-transparent"
          style={{ ['--thumb-color' as string]: activeBand.color }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        <span>{min}</span>
        <span>Minimum acceptable score</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default ScoreThresholdSlider;
