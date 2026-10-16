# Pre-Submission Audit

What is built, what only looks built, and what is worth adding before the AI Builder Cup submission.

Audited against the deployed app (Cloud Run + Cloud SQL, 22,953 tenders imported) and the rules at https://aibuildercup.com/themes.html — Technical Merit & Gen AI 40% · Problem Alignment & Impact 25% · Innovation & Creativity 25% · UX & Solution Design 10%.

---

## 1. Model Maintenance — built, but it cannot currently demonstrate

**The code is complete and correctly wired.** `ModelMaintenance.tsx` → `mlApi.js` (6 functions) → `mlController.js` (7 handlers) → `modelRegistryService` / `retrainingService`. Promote and retire are admin-gated; reads are open. The registry fallback chain (sector+region → sector → pooled → rules) is implemented as specified. Nothing here is fake.

**The problem is data, not code.** Labels come from `reviewDecisionLabelSource.js`: a proposal in Expert Review marked APPROVED scores 1, REJECTED scores 0. The imported database has **4 leads in Expert Review**, of which roughly 2 were approved. `TRAINING_MINIMUMS` in `mlConfig.js` requires **30 rows with at least 8 of each outcome**.

So pressing "Start training run" today returns "not enough labelled data". The feature that carries the Innovation 25% shows an empty state.

**Why the data is thin:** proposals are only generated for `QUALIFIED_GOOD` leads, and the rules engine caps at 55/100 without a Probe42 profile for the tender's winner, so almost nothing reaches GOOD naturally. The four that did are the marked `demoOverride` rows.

**The honest fix, in order of preference:**

1. **Widen the existing demo override** to the leads the AI already rated GOOD or HITL ≥ 75 (the sandbox notes list RVNL and RailTel/Prasar Bharati as undecided candidates), generate proposals for them, then review them in the UI. Every label is then a real human decision on a real AI-drafted proposal. Needs roughly 30 proposals and someone clicking through them — an hour of work, and it makes the live demo real.
2. **Import Probe42 profiles for the actual winners.** This is the root cause: 45 of the 100 points need a financial profile for the winning company, and the four profiles we have belong to companies that won nothing in our data. Fixing even five of the ten winners would let leads qualify GOOD on merit rather than by override, which is a much better story on slide 7.
3. Do **not** lower `TRAINING_MINIMUMS` to force a run. A model trained on 6 examples is not a model, and a judge who reads `mlConfig.js` will see the threshold was moved for the demo.

**If none of that happens:** say plainly on the slide and in the demo that the loop is built and tested, and begins training at 30 reviewer decisions. That is defensible. An empty state with no explanation is not.

---

## 2. "Today's AI Brief" — a placeholder on the first screen a judge sees

`Dashboard.tsx:909-922` is a hardcoded empty state with a "Not connected" badge. There is no endpoint behind it and nothing to connect. `Analytics.tsx:256` carries the same badge.

This is the highest-priority build in this document. The judge lands on the Dashboard first, and the only card labelled *AI* says it is not connected — on a submission where Gen AI implementation is 40% of the score. It reads as "the AI isn't finished".

**Build it.** A `/api/ai-brief` endpoint that passes the pipeline summary (already computed by `pipelineSummaryService`) plus the top few leads by score to Gemini, and asks for three or four bullets: what changed, what to act on today, what is stuck. Cache per day so it is one Gemini call, not one per page load. Frontend swaps the placeholder for the fetched text with a real status badge.

Roughly an hour. It converts the weakest screen in the app into a live Gemini demo in the place where attention is highest.

---

## 3. Settings says things that are no longer true

`Settings.tsx:697-698` shows **Connection: Unavailable** and **Model: Awaiting backend integration**. Both are static text written before the Gemini layer existed. The service is running `gemini-3.5-flash-lite` with `LLM_PROVIDER=gemini` and the key in Secret Manager.

A judge who opens Settings sees the app claiming it has no model wired up, which directly contradicts slide 6. Fix it to report the live provider and model — the backend already knows both, it just needs exposing on a health endpoint.

**Related:** `backend/src/routes/settings.js` exists but is **not mounted** in `server.js`. Every preference on the Settings page persists to `localStorage` only (see the comments in `constants/settingsPreferences.ts` and `constants/leadCategorySettings.ts`). Mounting that route would make settings actually persist. Lower priority than the model label, but it is the difference between a settings page and a settings mock.

---

## 4. Lead Details has two empty sections that Gemini could already fill

`LeadDetails.tsx:490` and `:495` render "Awaiting backend integration." for **Recommended Banking Products** and **Relationship Strategy**.

These are worth fixing because the app *already generates exactly this content elsewhere* — `emailGenerator.js` maps sector and signal to specific banking products (bank guarantee, cash credit, supply-chain finance, letter of credit), and the proposal pipeline produces relationship context. The data exists; these two panels were just never wired to it.

This is the panel a judge reads when they click into a lead, and "Recommended Banking Products" is the single most on-theme phrase in the whole BFSI submission. Leaving it blank is a waste.

---

## 5. Analytics has two sections marked unavailable

`Analytics.tsx:637-644`: **Lead Quality Distribution** and **Proposal Pipeline**, both honest empty states explaining that the endpoints only support per-tender lookups rather than aggregates.

Lower priority than items 2–4 — Analytics is not on the walkthrough path. But if there is time, both are straightforward `GROUP BY` queries over tables that already hold the data, and a populated Analytics page is cheap evidence of scalability.

---

## 5b. Resolved since this audit: the MariaDB JSON column bug

Expert Review rendered a blank page after the data import. Root cause: **MariaDB has no native JSON type** — it stores JSON as `longtext` with a `CHECK (json_valid(...))`. The sandbox dump carried that definition into Cloud SQL, so nine columns arrived as `longtext`. `mysql2` parses real `JSON` columns into objects but hands back `longtext` as a string, so the API returned `qualification_reason` as text, the page called `.factors` on a string, and React crashed.

Affected columns: `tenders.qualification_reason`; `tender_proposals.recommended_product`, `.estimated_funding_requirement`, `.rationale`, `.missing_information`, `.raw_ai_response`; `lead_signals.raw_data`; `lead_profiles.raw_llm_response`; `lead_category_settings.score_thresholds`.

Fixed in code rather than only in the database, because the same thing affects anyone developing against the MariaDB sandbox and any future re-import: `src/utils/jsonColumns.js` parses these on read, best-effort, and `tenderRepository` / `tenderProposalRepository` apply it at every read path. Verified on the deployed API.

Converting the columns to real `JSON` in Cloud SQL (`fix_json_columns.sh`) is now optional cleanup rather than a blocker.

**Lesson worth keeping:** the pages that broke were the ones reading these columns, and they broke silently as a blank screen. Click through every page after any data import, not just the Dashboard.

---

## 6. Things worth adding that are not fixes

**Cost and latency telemetry.** The deck claims low cost per lead and automatic scaling. Logging Gemini token usage and response time per call (the client already receives usage metadata — `chatWithMeta` returns it) turns those claims into measured numbers. Technical Merit rewards exactly this, and it costs almost nothing to add.

**A Responsible AI / data provenance section.** Public sources only, no personal data sent to the model, secrets in Secret Manager, no automated decisioning without human approval, credit signals can only lower a score. In BFSI a judge will ask where the data comes from and whether you may use it. You already behave well here — the gap is that nothing says so.

**Make the "why not just ChatGPT" answer explicit.** Innovation is 25% and nothing currently states the differentiator outright. The answer is strong: a deterministic 100-point score the model cannot override, evidence attached to every point, and a human approval gate before anything is sent. An LLM wrapper cannot produce an auditable score. Say it on a slide rather than leaving it implied.

**Accessibility pass.** 10% of the score, and currently unaddressed. Focus states, colour contrast on the muted grey placeholder text, keyboard navigation through the Expert Review actions, and alt text. A day's work at most, and it is the only criterion where a small effort moves a whole band.

**Re-qualify the demo leads through Gemini.** The imported rows' `aiAnalysis` was produced by the sandbox's Ollama `gemma4:12b`, not Gemini. If a judge asks whether the analysis on screen came from Gemini, the honest answer today is no. Re-running `leadQualification.js` on at least the four Expert Review leads makes the demo consistent with the deck.

---

## 7. Suggested order

| Priority | Item | Why |
|---|---|---|
| 1 | AI Brief endpoint + card | Highest visibility, 40% criterion, ~1 hour |
| 2 | Settings model/provider status | Actively contradicts the deck |
| 3 | Re-qualify demo leads on Gemini | Makes the demo match the claim |
| 4 | Lead Details product + strategy panels | Most on-theme panel in the app, data already exists |
| 5 | Widen override → 30 reviewed proposals | Unlocks a live training run (Innovation 25%) |
| 6 | Probe42 profiles for real winners | Fixes the root cause behind the score cap |
| 7 | Cost/latency telemetry | Turns deck claims into measurements |
| 8 | Accessibility pass | 10% criterion, currently zero |
| 9 | Mount settings route | Settings page becomes real |
| 10 | Analytics aggregate endpoints | Nice to have, off the walkthrough path |

Items 1–4 are each small and independent. Items 5 and 6 are the ones that change what the demo can show, and they need deciding early because they involve data work, not code.

---

## 8. What is already solid — do not spend time here

- Gemini integration across all four AI jobs through one client with retry, timeouts and JSON-schema enforcement
- The deterministic 10-factor score, with missing data scoring 0 and credit signals only ever lowering a score
- Human approval gates on proposals and communications
- The decision trail, with derived-state honesty when audit rows predate the feature
- Cloud Run + Cloud SQL + Cloud Run Jobs deployment, secrets in Secret Manager
- The ML module's architecture, including the propose/approve gate and the out-of-distribution guard
- De-branding: `grep -rn "SBI"` returns nothing across the repo and the database
