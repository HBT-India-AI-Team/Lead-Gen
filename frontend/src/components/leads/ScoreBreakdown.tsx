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
  tenderValue?: QualificationFactor;
  governmentRelevance?: QualificationFactor;
  businessFit?: QualificationFactor;
  dataCompleteness?: QualificationFactor;
  winningCompanyAvailability?: QualificationFactor;
  probe42Availability?: QualificationFactor;
  creditRating?: QualificationFactor;
  revenueStrength?: QualificationFactor;
  netProfitStrength?: QualificationFactor;
  complianceStatus?: QualificationFactor;
}

type FactorKey = keyof QualificationFactors;

// `tenders.qualification_reason.scoring` — which scorer produced the
// authoritative score (backend/src/services/ml/mlScoringService.js): an
// admin-approved model for the lead's segment, or the rules engine.
export interface QualificationScoring {
  source: 'model' | 'rules';
  score: number;
  probability?: number | null;
  modelVersion?: number | null;
  segmentKey?: string | null;
  resolvedVia?: string;
  label?: string;
  fallbackReason?: string | null;
  deterministicScore?: number;
  contributions?: { feature: string; label: string; value: number; contribution: number }[];
  outOfDistribution?: string[];
}

// Max points per factor — mirrors backend/src/services/scoring/
// qualificationRules.js (the ten weights sum to exactly 100). Kept here
// only so each row can show "earned / possible"; the earned points always
// come from the persisted factor, never recomputed.
const FACTOR_GROUPS: { source: string; rows: { key: FactorKey; label: string; max: number }[] }[] = [
  {
    source: 'Tender record',
    rows: [
      { key: 'tenderValue', label: 'Tender Value', max: 15 },
      { key: 'governmentRelevance', label: 'Government Buyer', max: 10 },
      { key: 'businessFit', label: 'Business Fit', max: 10 },
      { key: 'dataCompleteness', label: 'Data Completeness', max: 10 },
      { key: 'winningCompanyAvailability', label: 'Winning Company', max: 10 },
    ],
  },
  {
    source: 'Company registry (Probe42)',
    rows: [
      { key: 'probe42Availability', label: 'Probe42 Profile', max: 10 },
      { key: 'revenueStrength', label: 'Revenue', max: 12 },
      { key: 'netProfitStrength', label: 'Net Profit', max: 12 },
      { key: 'creditRating', label: 'Credit Rating', max: 6 },
      { key: 'complianceStatus', label: 'Compliance', max: 5 },
    ],
  },
];

// Fixed business thresholds — mirrors qualificationRules.js
// (QUALIFIED_BAD_MAX / QUALIFIED_HITL_MIN / QUALIFIED_GOOD_MIN).
const BANDS = [
  { label: 'Bad', range: '0–59', from: 0, to: 60, className: 'bg-danger-bg text-danger' },
  { label: 'Human review', range: '60–79', from: 60, to: 80, className: 'bg-warning-bg text-warning' },
  { label: 'Good', range: '80–100', from: 80, to: 100, className: 'bg-success-bg text-success' },
];

/**
 * "Why this score?" trigger meant to sit inline right beside the score
 * number. Purely presentational: expand/collapse state lives in the parent
 * page, since the icon and the panel it reveals sit in two different spots
 * in the layout. 24px hit area for the 16px icon.
 */
export function ScoreBreakdownToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Why this score?"
      aria-expanded={expanded}
      title="Why this score?"
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${expanded ? 'text-primary' : ''}`}
    >
      <Info className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function ScoreBands({ score }: { score: number }) {
  return (
    <div>
      <div className="relative flex h-6 overflow-hidden rounded-md text-[10px] font-semibold" aria-hidden="true">
        {BANDS.map((band) => (
          <div key={band.label} className={`flex items-center justify-center ${band.className}`} style={{ width: `${band.to - band.from}%` }}>
            {band.label} {band.range}
          </div>
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `clamp(0%, ${score}%, calc(100% - 2px))` }} />
      </div>
      <p className="sr-only">
        Score {score} of 100. Bands: 0 to 59 bad, 60 to 79 human review, 80 to 100 good.
      </p>
    </div>
  );
}

/** The model's strongest drivers for this one lead (weight × standardized value, on the log-odds scale). */
function ModelContribution({ scoring }: { scoring: QualificationScoring }) {
  const contributions = scoring.contributions ?? [];
  const max = Math.max(0, ...contributions.map(({ contribution }) => Math.abs(contribution)));
  return (
    <section aria-label="Model score">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Scored by {scoring.label}</h4>
      <p className="mt-1 text-xs text-ink-soft">
        {scoring.probability != null && <>Approval probability {Math.round(scoring.probability * 100)}% → score {scoring.score}. </>}
        {scoring.deterministicScore != null && <>The rules engine would give {scoring.deterministicScore}.</>}
      </p>
      {contributions.length > 0 && (
        <ul className="mt-2 grid gap-1.5">
          {contributions.map(({ feature, label, contribution }) => {
            const width = max > 0 ? Math.min(50, (Math.abs(contribution) / max) * 50) : 0;
            return (
              <li key={feature} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                <span className="truncate text-ink-soft" title={label}>{label}</span>
                <span className="relative block h-1.5 rounded-full bg-surface-sunken" aria-hidden="true">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-hairline-strong" />
                  <span
                    className={`absolute inset-y-0 rounded-full ${contribution >= 0 ? 'bg-success' : 'bg-danger'}`}
                    style={contribution >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
                  />
                </span>
                <span className="tabular w-12 text-right text-ink">
                  {contribution >= 0 ? '+' : ''}
                  {contribution.toFixed(2)}
                  <span className="sr-only">{contribution >= 0 ? ' toward proceed' : ' toward reject'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The real per-factor breakdown behind a qualification score: all ten
 * factors, grouped by where the data came from, each with the points it
 * actually earned out of its maximum. A factor missing from `factors`
 * reads as "Not available" with 0 points, same as one the scorer marked
 * unmatched. When a model produced the score (`scoring.source === 'model'`)
 * its drivers lead and the rules factors follow as the reference.
 * Visibility is controlled by the parent.
 */
export function ScoreBreakdownPanel({
  factors,
  score,
  scoring,
}: {
  factors: QualificationFactors | null | undefined;
  score?: number | null;
  scoring?: QualificationScoring | null;
}) {
  const modelScoring = scoring?.source === 'model' ? scoring : null;
  const outOfDistribution = scoring?.source === 'rules' ? scoring.outOfDistribution ?? [] : [];
  return (
    <div className="grid gap-4 rounded-lg border border-hairline bg-surface-muted p-3">
      {score != null && <ScoreBands score={score} />}

      {modelScoring && <ModelContribution scoring={modelScoring} />}

      {outOfDistribution.length > 0 && (
        <div className="rounded-md border border-dashed border-hairline-strong p-2.5 text-xs text-ink-soft">
          <p className="font-semibold text-ink">Rules engine used: {scoring?.fallbackReason}</p>
          <ul className="mt-1 list-disc pl-4 text-ink-muted">
            {outOfDistribution.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      )}

      {modelScoring && (
        <p className="-mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Rules engine factors (reference){modelScoring.deterministicScore != null ? ` — ${modelScoring.deterministicScore}/100` : ''}
        </p>
      )}

      {FACTOR_GROUPS.map((group) => (
        <section key={group.source} aria-label={`${group.source} factors`}>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Source: {group.source}</h4>
          <dl className="mt-1.5 grid gap-1.5">
            {group.rows.map(({ key, label, max }) => {
              const factor = factors?.[key];
              const points = factor?.points ?? 0;
              return (
                <div key={key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                  <dt className="truncate font-semibold text-ink-soft">{label}</dt>
                  <dd className={`truncate ${factor?.matched ? 'text-ink' : 'text-ink-muted'}`} title={factor?.label ?? 'Not available'}>
                    {factor?.label ?? 'Not available'}
                  </dd>
                  <dd className="flex items-center gap-2">
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(points / max) * 100}%` }} />
                    </span>
                    <span className="tabular w-10 text-right font-semibold text-ink">
                      {points}<span className="font-normal text-ink-muted">/{max}</span>
                      <span className="sr-only"> points</span>
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
