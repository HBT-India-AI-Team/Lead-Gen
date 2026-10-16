import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Construction, Loader2, SearchX } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import SearchBox from '../ui/SearchBox';
import StatusBadge from '../ui/StatusBadge';
import DualRangeSlider from '../ui/DualRangeSlider';
import ScoreThresholdSlider, { bandForValue } from '../ui/ScoreThresholdSlider';
import { fetchTenders, fetchHealthCheck } from '../../services/tendersApi';
import { fetchLeadCategorySettings, saveLeadCategorySettings } from '../../services/settingsApi';
import { formatInrCompact, formatDate, tenderTitleFrom } from '../../utils/tenderFormatters';
import { cn } from '../../utils/formatters';
import { useDebounce } from '../../hooks/useDebounce';
import type { LeadCategoryOption } from '../../constants/settingsPreferences';
import {
  SCORE_DEFINITIONS,
  TENDER_VALUE_MIN,
  TENDER_VALUE_MAX,
  TENDER_VALUE_STEP,
  DEFAULT_CATEGORY_SETTINGS,
  DEFAULT_SCORE_THRESHOLDS,
  isWipCategory,
  readLeadCategorySettings,
  writeLeadCategorySettings,
} from '../../constants/leadCategorySettings';
import type { AllCategorySettings, CategorySettings } from '../../constants/leadCategorySettings';

// A lead_category_settings row as GET /api/settings/lead-categories returns it.
interface ServerCategoryRow {
  category_key: string;
  tender_value_min: number | string;
  tender_value_max: number | string;
  decision_window_days: number;
  score_thresholds: Partial<CategorySettings['scoreThresholds']> | null;
}

/** Overlays saved server rows onto the local/default settings, per category. */
function mergeServerRows(base: AllCategorySettings, rows: ServerCategoryRow[]): AllCategorySettings {
  const next = { ...base };
  for (const row of rows) {
    next[row.category_key] = {
      ...DEFAULT_CATEGORY_SETTINGS,
      tenderValueMin: Number(row.tender_value_min),
      tenderValueMax: Number(row.tender_value_max),
      decisionWindowDays: Number(row.decision_window_days),
      scoreThresholds: { ...DEFAULT_SCORE_THRESHOLDS, ...(row.score_thresholds ?? {}) },
    };
  }
  return next;
}

// Looked up by key (not array index) so the live-check panel's band colors
// stay correct even if SCORE_DEFINITIONS' order ever changes.
const FINANCIAL_HEALTH_DEF = SCORE_DEFINITIONS.find((def) => def.key === 'financialHealth')!;
const BUSINESS_VINTAGE_DEF = SCORE_DEFINITIONS.find((def) => def.key === 'businessVintage')!;
const CREDIT_RATING_DEF = SCORE_DEFINITIONS.find((def) => def.key === 'cibil')!;
const COMPLIANCE_DEF = SCORE_DEFINITIONS.find((def) => def.key === 'gstCompliance')!;

// Real GET /api/tenders search-result row shape, limited to what the
// company picker below reads (see TenderLeads.tsx for the same fields used
// more fully elsewhere).
interface TenderSearchResult {
  tender_id: string;
  title: string | null;
  company_name: string | null;
  description: string | null;
  winning_company_name: string | null;
}
interface TenderSearchResponse {
  tenders: TenderSearchResult[];
}

// Real GET /api/tenders/:id/health-check response shape (see
// src/services/healthCheckService.js's runHealthCheck()) — companyProfile is
// the exact raw probe42_demo_profiles row (or null if no match), same shape
// LeadDetails.tsx's own HealthCheckResult already types. The four *Score
// fields are the deterministic scores computed by
// src/services/scoring/companyProfileScoringService.js from that same
// profile — each null whenever companyProfile itself is null, or the
// specific source field it needs isn't on file / isn't a recognized value.
// Only the fields the live-check readout below actually reads are declared.
interface HealthCheckResult {
  companyProfile: {
    annual_revenue: string | null;
    net_profit: string | null;
    credit_rating: string | null;
    compliance_status: string | null;
    incorporation_date: string | null;
  } | null;
  financialHealthScore: { score: number; revenuePoints: number; netProfitPoints: number } | null;
  businessVintageScore: { score: number; yearsInOperation: number } | null;
  creditRatingScore: { score: number; rating: string } | null;
  complianceScore: { score: number; status: string } | null;
}

// One score type's live-check readout: a real found result (children — the
// caller renders the actual real values) or an honest "why not" reason.
function LiveCheckResult({
  label,
  available,
  unavailableReason,
  children,
}: {
  label: string;
  available: boolean;
  unavailableReason: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{label}</p>
        {available ? (
          <StatusBadge tone="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Checked live
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Not found</StatusBadge>
        )}
      </div>
      <div className="mt-2 grid gap-0.5 text-xs text-ink-soft">
        {available ? children : <p className="text-ink-muted">{unavailableReason}</p>}
      </div>
    </div>
  );
}

const numberInputClass =
  'tabular h-9 w-36 rounded-lg border border-hairline-strong bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10';

// Indian digit grouping (e.g. 100000000 -> "10,00,00,000") — the same
// .toLocaleString('en-IN') convention every other rupee figure in the app
// already uses (see formatInrCompact above and the Dashboard/Analytics/Leads
// pages' count formatting). Display-only: the input's onChange strips this
// back to a plain number before it ever reaches state.
function formatGrouped(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-IN') : '';
}

function parseGrouped(raw: string): number {
  const digitsOnly = raw.replace(/[^0-9]/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
}

interface Props {
  category: LeadCategoryOption;
  pushToast: (tone: 'success' | 'error' | 'info', message: string) => void;
}

// Panel content for ONE lead-category tab. Settings.tsx owns the master tab
// bar (General + every LeadCategoryOption) and passes down which category is
// active — this component only renders that category's settings, it doesn't
// manage tab selection itself.
function LeadCategorySettings({ category, pushToast }: Props) {
  const [saved, setSaved] = useState<AllCategorySettings>(() => readLeadCategorySettings());
  const [draft, setDraft] = useState<AllCategorySettings>(saved);
  const [isSaving, setIsSaving] = useState(false);
  // Server copy (GET /api/settings/lead-categories) is the source of truth;
  // the localStorage copy above is only the first paint and the fallback
  // when the API can't be reached.
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const serverSettingsQuery = useQuery({
    queryKey: ['lead-category-settings'],
    queryFn: () => fetchLeadCategorySettings() as Promise<{ settings: ServerCategoryRow[] }>,
    retry: 0,
  });
  const [hydratedFromServer, setHydratedFromServer] = useState(false);

  if (!hydratedFromServer && (serverSettingsQuery.isSuccess || serverSettingsQuery.isError)) {
    setHydratedFromServer(true);
    setServerReachable(serverSettingsQuery.isSuccess);
    if (serverSettingsQuery.isSuccess) {
      const merged = mergeServerRows(saved, serverSettingsQuery.data.settings);
      setSaved(merged);
      setDraft(merged);
    }
  }

  // ---- Live company check — all four sliders can be checked against a
  // company's actual Probe42 profile (revenue, net profit, incorporation
  // date, credit rating, compliance status) by picking a tender/winning
  // company below; reuses the existing GET /api/tenders/:id/health-check
  // endpoint (already built for the Lead Details page), no new backend
  // route needed.
  const [checkQuery, setCheckQuery] = useState('');
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);
  const [selectedTenderLabel, setSelectedTenderLabel] = useState<string | null>(null);
  const debouncedCheckQuery = useDebounce(checkQuery, 300);

  const searchResultsQuery = useQuery({
    queryKey: ['score-check-search', debouncedCheckQuery],
    queryFn: () => fetchTenders({ search: debouncedCheckQuery, limit: 5 }) as Promise<TenderSearchResponse>,
    enabled: debouncedCheckQuery.trim().length > 1 && !selectedTenderId,
  });
  const searchResults = searchResultsQuery.data?.tenders ?? [];

  const healthCheckQuery = useQuery({
    queryKey: ['score-check-health', selectedTenderId],
    queryFn: () => fetchHealthCheck(selectedTenderId as string) as Promise<HealthCheckResult>,
    enabled: Boolean(selectedTenderId),
  });
  const profile = healthCheckQuery.data?.companyProfile ?? null;
  const financialHealthScore = healthCheckQuery.data?.financialHealthScore ?? null;
  const businessVintageScore = healthCheckQuery.data?.businessVintageScore ?? null;
  const creditRatingScore = healthCheckQuery.data?.creditRatingScore ?? null;
  const complianceScore = healthCheckQuery.data?.complianceScore ?? null;

  function selectCheckTender(tender: TenderSearchResult) {
    setSelectedTenderId(tender.tender_id);
    setSelectedTenderLabel(tender.winning_company_name || tenderTitleFrom(tender));
    setCheckQuery('');
  }

  function clearCheckTender() {
    setSelectedTenderId(null);
    setSelectedTenderLabel(null);
  }

  const current: CategorySettings = draft[category] ?? DEFAULT_CATEGORY_SETTINGS;
  const dirty = JSON.stringify(saved[category]) !== JSON.stringify(draft[category]);
  const wip = isWipCategory(category);

  function updateCurrent(patch: Partial<CategorySettings>) {
    setDraft((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }));
  }

  function updateThreshold(key: keyof CategorySettings['scoreThresholds'], value: number) {
    setDraft((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        scoreThresholds: { ...prev[category].scoreThresholds, [key]: value },
      },
    }));
  }

  async function saveCurrent() {
    setIsSaving(true);
    const next = { ...saved, [category]: draft[category] };
    try {
      await saveLeadCategorySettings(category, draft[category]);
      setServerReachable(true);
      writeLeadCategorySettings(next);
      setSaved(next);
      pushToast('success', `${category} settings saved for everyone.`);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status < 500) {
        // The server rejected the values (e.g. min > max) — don't save them anywhere.
        pushToast('error', error instanceof Error ? error.message : 'Unable to save settings');
      } else {
        setServerReachable(false);
        try {
          writeLeadCategorySettings(next);
          setSaved(next);
          pushToast('info', `Server unreachable — ${category} settings saved in this browser only.`);
        } catch {
          pushToast('error', 'Unable to save settings');
        }
      }
    } finally {
      setIsSaving(false);
    }
  }

  function cancelCurrent() {
    setDraft((prev) => ({ ...prev, [category]: saved[category] }));
  }

  // Clamp typed numeric inputs to the slider bounds and keep min <= max.
  function onMinInput(raw: number) {
    const clamped = Math.min(Math.max(raw, TENDER_VALUE_MIN), current.tenderValueMax);
    updateCurrent({ tenderValueMin: Number.isFinite(clamped) ? clamped : TENDER_VALUE_MIN });
  }
  function onMaxInput(raw: number) {
    const clamped = Math.max(Math.min(raw, TENDER_VALUE_MAX), current.tenderValueMin);
    updateCurrent({ tenderValueMax: Number.isFinite(clamped) ? clamped : current.tenderValueMin });
  }

  if (wip) {
    return (
      <Card className="p-5">
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-hairline-strong bg-surface-muted px-6 py-10 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-warning-bg text-warning">
            <Construction className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink-soft">{category}</p>
            <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
              Work in Progress
            </span>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-ink-muted">
            This category&apos;s settings are coming soon — no dedicated lead data or scoring fields exist for it in
            the backend yet, so no real controls are shown here rather than fabricated ones.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      {/* Tender Value Range + Decision Window narrower left column; Score
          Thresholds (naturally taller, four sliders) fills the wider right
          column instead of every section stacking full-width — the value
          range slider no longer needs the full row now that it's paired
          with a compact numeric readout instead of a paragraph of copy. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid gap-6">
          {/* 1. Tender Value Range */}
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tender Value Range</p>
            <div className="max-w-xs">
              <DualRangeSlider
                min={TENDER_VALUE_MIN}
                max={TENDER_VALUE_MAX}
                step={TENDER_VALUE_STEP}
                valueMin={current.tenderValueMin}
                valueMax={current.tenderValueMax}
                onChange={({ min, max }) => updateCurrent({ tenderValueMin: min, tenderValueMax: max })}
                ariaLabel="Tender value"
                formatValue={formatInrCompact}
                id={`tender-value-${category}`}
              />
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Min ({formatInrCompact(current.tenderValueMin)})
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={numberInputClass}
                  value={formatGrouped(current.tenderValueMin)}
                  onChange={(event) => onMinInput(parseGrouped(event.target.value))}
                  aria-label="Tender value minimum (exact ₹)"
                />
              </label>
              <span className="pb-2 text-ink-muted">—</span>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Max ({formatInrCompact(current.tenderValueMax)})
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={numberInputClass}
                  value={formatGrouped(current.tenderValueMax)}
                  onChange={(event) => onMaxInput(parseGrouped(event.target.value))}
                  aria-label="Tender value maximum (exact ₹)"
                />
              </label>
            </div>
          </div>

          {/* 2. Decision Window (Days) */}
          <div className="grid gap-2">
            <label
              htmlFor={`decision-window-${category}`}
              className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
            >
              Decision Window (Days)
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateCurrent({ decisionWindowDays: Math.max(1, current.decisionWindowDays - 1) })}
                aria-label="Decrease decision window by one day"
                className="h-9 w-9 px-0"
              >
                −
              </Button>
              <input
                id={`decision-window-${category}`}
                type="number"
                className={cn(numberInputClass, 'w-20 text-center')}
                value={current.decisionWindowDays}
                min={1}
                max={365}
                onChange={(event) => {
                  const value = Math.min(Math.max(Number(event.target.value) || 1, 1), 365);
                  updateCurrent({ decisionWindowDays: value });
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateCurrent({ decisionWindowDays: Math.min(365, current.decisionWindowDays + 1) })}
                aria-label="Increase decision window by one day"
                className="h-9 w-9 px-0"
              >
                +
              </Button>
              <span className="text-sm text-ink-muted">days</span>
            </div>
          </div>
        </div>

        {/* 3. Score threshold panel */}
        <div className="grid gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Score Thresholds</p>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Each slider sets the <strong>minimum acceptable score</strong> the scoring logic uses as a cutoff — an
            admin setting, not a specific lead&apos;s reading. Financial Health and Business Vintage are
            deterministic scores computed per company from Probe42 data (revenue + net profit, and incorporation
            date respectively). Credit Rating and Compliance are computed from Probe42&apos;s own credit rating
            grade and compliance status — not a bureau CIBIL score or GSTN filing data, since neither is
            connected in this app. See the live check below.
          </p>
          <div className="grid gap-x-6 gap-y-4 rounded-xl border border-hairline bg-surface-muted p-3 sm:grid-cols-2">
            {SCORE_DEFINITIONS.map((def) => (
              <ScoreThresholdSlider
                key={def.key}
                label={def.label}
                min={def.min}
                max={def.max}
                step={def.step}
                threshold={current.scoreThresholds[def.key]}
                onChange={(value) => updateThreshold(def.key, value)}
                bands={def.bands}
                hint={def.hint}
              />
            ))}
          </div>

          {/* Live company check — lookup against the Probe42 profile table
              (via the existing Health Check endpoint), showing each score
              actually computed for whichever company is picked. */}
          <div className="rounded-xl border border-hairline bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Check a Company</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              Search any winning company to see its live scores.
            </p>

            {!selectedTenderId ? (
              <div className="relative mt-3">
                <SearchBox
                  value={checkQuery}
                  onChange={setCheckQuery}
                  placeholder="Search by winning company or buyer…"
                  className="max-w-sm"
                />
                {checkQuery.trim().length > 1 && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full max-w-sm overflow-y-auto rounded-lg border border-hairline bg-surface p-1 shadow-lg">
                    {searchResultsQuery.isLoading ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-xs text-ink-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Searching…
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-xs text-ink-muted">
                        <SearchX className="h-3.5 w-3.5" strokeWidth={2} /> No matching tenders found.
                      </div>
                    ) : (
                      searchResults.map((tender) => (
                        <button
                          key={tender.tender_id}
                          type="button"
                          onClick={() => selectCheckTender(tender)}
                          className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-surface-sunken"
                        >
                          <p className="font-semibold text-ink">{tender.winning_company_name || 'Winning company not yet identified'}</p>
                          <p className="mt-0.5 truncate text-ink-muted">{tenderTitleFrom(tender)}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline-strong bg-surface px-3 py-2">
                  <p className="text-xs font-semibold text-ink">Checking: {selectedTenderLabel}</p>
                  <Button type="button" variant="ghost" onClick={clearCheckTender} className="h-7 px-2 text-xs">
                    Change
                  </Button>
                </div>

                {healthCheckQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Checking Probe42 profile…
                  </div>
                ) : (
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <LiveCheckResult
                      label="Financial Health Score"
                      available={Boolean(financialHealthScore)}
                      unavailableReason="No Probe42 profile found for this company."
                    >
                      {profile && financialHealthScore && (
                        <>
                          <p>
                            Score:{' '}
                            <span
                              className="font-bold"
                              style={{ color: bandForValue(FINANCIAL_HEALTH_DEF.bands, financialHealthScore.score).color }}
                            >
                              {financialHealthScore.score} ({bandForValue(FINANCIAL_HEALTH_DEF.bands, financialHealthScore.score).label})
                            </span>
                          </p>
                          <p>Revenue: <span className="font-semibold text-ink">{formatInrCompact(Number(profile.annual_revenue))}</span></p>
                          <p>Net profit: <span className="font-semibold text-ink">{formatInrCompact(Number(profile.net_profit))}</span></p>
                        </>
                      )}
                    </LiveCheckResult>

                    <LiveCheckResult
                      label="Business Vintage / Stability Score"
                      available={Boolean(businessVintageScore)}
                      unavailableReason="No incorporation date on file for this company."
                    >
                      {profile?.incorporation_date && businessVintageScore && (
                        <>
                          <p>
                            Score:{' '}
                            <span
                              className="font-bold"
                              style={{ color: bandForValue(BUSINESS_VINTAGE_DEF.bands, businessVintageScore.score).color }}
                            >
                              {businessVintageScore.score} ({bandForValue(BUSINESS_VINTAGE_DEF.bands, businessVintageScore.score).label})
                            </span>
                          </p>
                          <p>
                            Incorporated: <span className="font-semibold text-ink">{formatDate(profile.incorporation_date.slice(0, 10))}</span>
                          </p>
                          <p>
                            Years in operation: <span className="font-semibold text-ink">{businessVintageScore.yearsInOperation}</span>
                          </p>
                        </>
                      )}
                    </LiveCheckResult>

                    <LiveCheckResult
                      label="Credit Rating Score"
                      available={Boolean(creditRatingScore)}
                      unavailableReason="No credit rating on file for this company."
                    >
                      {creditRatingScore && (
                        <>
                          <p>
                            Score:{' '}
                            <span
                              className="font-bold"
                              style={{ color: bandForValue(CREDIT_RATING_DEF.bands, creditRatingScore.score).color }}
                            >
                              {creditRatingScore.score} ({bandForValue(CREDIT_RATING_DEF.bands, creditRatingScore.score).label})
                            </span>
                          </p>
                          <p>Credit rating: <span className="font-semibold text-ink">{creditRatingScore.rating}</span></p>
                        </>
                      )}
                    </LiveCheckResult>

                    <LiveCheckResult
                      label="Compliance Score"
                      available={Boolean(complianceScore)}
                      unavailableReason="No compliance status on file for this company."
                    >
                      {complianceScore && (
                        <>
                          <p>
                            Score:{' '}
                            <span
                              className="font-bold"
                              style={{ color: bandForValue(COMPLIANCE_DEF.bands, complianceScore.score).color }}
                            >
                              {complianceScore.score} ({bandForValue(COMPLIANCE_DEF.bands, complianceScore.score).label})
                            </span>
                          </p>
                          <p>Compliance status: <span className="font-semibold text-ink">{complianceScore.status}</span></p>
                        </>
                      )}
                    </LiveCheckResult>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save / Cancel */}
      <div className="mt-6 flex items-center gap-3 border-t border-hairline pt-4">
        <Button type="button" variant="primary" onClick={saveCurrent} disabled={!dirty || isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button type="button" variant="secondary" onClick={cancelCurrent} disabled={!dirty}>
          Cancel
        </Button>
        <span className="text-xs text-ink-muted">
          {serverReachable === false ? (
            <>Server unreachable — <strong>{category}</strong> settings are kept in this browser only.</>
          ) : (
            <>Saved on the server for <strong>{category}</strong>, shared by everyone.</>
          )}
        </span>
      </div>
    </Card>
  );
}

export default LeadCategorySettings;
