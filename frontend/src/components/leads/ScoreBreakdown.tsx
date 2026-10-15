import { Info } from 'lucide-react';

// Shape of one entry in `tenders.qualification_reason.factors`, as computed
// by src/services/scoring/qualificationScoringService.js and returned
// verbatim by GET /api/leads and GET /api/leads/:id. Reused as-is here —
// never re-derived — so this breakdown can't drift out of sync with the
// score it explains.
interface QualificationFactor {
  matched: boolean;
  label: string;
  points: number;
}

export interface QualificationFactors {
  probe42Availability?: QualificationFactor;
  creditRating?: QualificationFactor;
  revenueStrength?: QualificationFactor;
  netProfitStrength?: QualificationFactor;
  complianceStatus?: QualificationFactor;
}

// Plain relationship-manager-facing labels for the 5 Probe42-informed
// factors, in the order a reviewer would want to scan them — not the
// internal factor keys (revenueStrength, complianceStatus, ...).
const FACTOR_ROWS: { key: keyof QualificationFactors; label: string }[] = [
  { key: 'revenueStrength', label: 'Revenue' },
  { key: 'netProfitStrength', label: 'Net Profit' },
  { key: 'creditRating', label: 'Credit Rating' },
  { key: 'complianceStatus', label: 'Compliance' },
  { key: 'probe42Availability', label: 'Probe42 Profile' },
];

/**
 * Small "i" trigger meant to sit inline right beside the score number itself
 * — not a full-width banner. Purely presentational: expand/collapse state
 * lives in the parent page, since the icon (beside the score) and the panel
 * it reveals (below the score/status row) sit in two different spots in the
 * layout and need to stay in sync without owning a DOM position of their
 * own.
 */
export function ScoreBreakdownToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Why this score?"
      aria-expanded={expanded}
      title="Why this score?"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-primary ${expanded ? 'text-primary' : ''}`}
    >
      <Info className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

/**
 * The real per-factor breakdown behind a qualification score — same
 * content/layout as before this became icon-triggered. A factor missing
 * from `factors` entirely reads as "Not available", same as a factor the
 * scorer itself marked unmatched (its own label already says e.g. "Revenue
 * not disclosed" / "Credit rating unavailable"). Visibility is controlled
 * entirely by the parent (conditional render) — this component has no
 * expand/collapse state of its own.
 */
export function ScoreBreakdownPanel({ factors }: { factors: QualificationFactors | null | undefined }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-hairline bg-surface-muted p-3 sm:grid-cols-2">
      {FACTOR_ROWS.map(({ key, label }) => {
        const factor = factors?.[key];
        return (
          <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="shrink-0 font-semibold text-ink-muted">{label}</span>
            <span className={`truncate text-right ${factor?.matched ? 'text-ink' : 'text-ink-muted'}`}>
              {factor?.label ?? 'Not available'}
            </span>
          </div>
        );
      })}
    </div>
  );
}