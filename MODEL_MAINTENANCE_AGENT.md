# Model Maintenance Agent — Build Spec

What we are building next: the Qualification stage stops being a fixed rulebook and becomes a **learning** system. A conventional ML model produces the financial health / fitness score, historical CRM outcomes supply the labels, and four supporting pillars keep the model honest over time — registry, retraining, correction loop, monitoring.

This document is the build plan for that slide, written against the code that already exists in this repo.

---

## 1. Where this plugs into what we already have

Today's qualification path is two scorers side by side:

- `backend/src/services/scoring/qualificationScoringService.js` — deterministic, pure-function scoring. Fixed point weights live in `qualificationRules.js` (tender value, government relevance, revenue strength, credit rating, compliance, …).
- `backend/src/services/leadQualificationService.js` — the LLM pass, now running on Gemini through `services/llm/llmClient.js`, returning a structured judgment (`riskLevel`, `confidenceScore`, `recommendation`).

The new ML model is a **third scorer**, not a replacement for either. It consumes the same tender + Probe42 features, and it outputs the financial health / fitness score that drives Proceed vs Reject / on-hold.

Keeping all three matters: the deterministic scorer is the fallback when no model is trained for a segment, and it is what we can explain to a judge or a reviewer when the model is wrong.

**The important constraint:** everything the agent does to a model must be visible in the decision trail we already built (`services/decisionTrailService.js`, `lead_decision_events`). A score that changed because a model was retrained is a decision, and it should appear in the trail alongside the human and AI ones.

---

## 2. Labels — the part that actually gates this

The slide says labelled data comes from the Business NXT CRM API. That is the whole foundation, so resolve it first.

We need, per historical lead: the company, what we scored it, and **what actually happened** — converted / rejected / went bad. Without that outcome column there is no supervised model, and nothing else in this document can be built.

Open questions to answer before any modelling work starts:

- Does the Business NXT API expose a final outcome per lead, or only current pipeline state?
- How many historical records can we actually pull? A few hundred is enough for logistic regression; it is not enough for anything deeper.
- How far back do they go, and has the business definition of "good lead" changed across that window?
- What is the class balance? If 95% of records are one outcome, accuracy is a meaningless metric and we need precision/recall from the start.

**Cold-start plan if the API is not available in time:** train on labels derived from our own `lead_decision_events` plus reviewer approve/reject actions in Human Review. It is a smaller, noisier dataset, but it keeps the pipeline real rather than mocked, and the swap to CRM labels later is a data-source change, not a rebuild.

---

## 3. Data model

Five new tables. Follow the existing migration pattern — one file in `backend/src/db/migrations/`, idempotent `CREATE TABLE IF NOT EXISTS`, registered in `server.js` boot like `ensureCustomerCheckSchema()`.

**`ml_models`** — the registry. One row per trained artifact.

```
id, segment_key, model_type, version, artifact_uri, feature_schema JSON,
hyperparams JSON, metrics JSON, trained_at, trained_by,
status ('candidate' | 'active' | 'retired'), promoted_at, notes
```

`segment_key` is how the slide's "segments by sector, region, language" is expressed — e.g. `sector=construction|region=south`. A reserved `__pooled__` segment is the fallback chain's last link.

**`ml_training_runs`** — one row per retraining attempt, successful or not.

```
id, segment_key, trigger ('schedule' | 'event' | 'manual'), status,
started_at, finished_at, row_count, label_window_start, label_window_end,
candidate_model_id, incumbent_model_id, comparison JSON,
approved_by, approved_at, error_text
```

**`ml_predictions`** — every score the model produced, so monitoring has something to measure and corrections have something to point at.

```
id, tender_id, model_id, score, predicted_class, feature_vector JSON, created_at
```

**`ml_corrections`** — the correction loop's record.

```
id, tender_id, prediction_id, corrected_by, original_score, corrected_label,
reason_text, source ('chat' | 'review_ui'), weight, consumed_by_run_id, created_at
```

`consumed_by_run_id` is what enforces "weighted into next retrain, not instant" — a correction is pending until a training run claims it.

**`ml_monitoring_metrics`** — drift and calibration over time.

```
id, model_id, metric_name, metric_value, window_start, window_end,
computed_at, breach BOOLEAN
```

---

## 4. The four pillars

### 01 · Model Registry

`services/ml/modelRegistryService.js`

- Register, list, promote, retire models; exactly one `active` per `segment_key`.
- `resolveModelForLead(lead)` implements the **fallback chain**: exact segment → broader segment (sector only) → `__pooled__` → *no model, use the deterministic scorer*. That last fallback is not a failure case, it is the designed floor, and it must be recorded on the prediction so we always know which path produced a score.
- Configurable data sources and schedules per segment, as the slide calls for, stored on the registry row rather than in code.

### 02 · Retraining Pipeline

`services/ml/retrainingService.js`

Triggers: schedule (Cloud Scheduler → Cloud Run Job), event (correction volume crosses a threshold; drift breach), or manual from the admin UI.

Flow: pull labels → build features → train candidate → **evaluate against the incumbent on a held-out set** → write `ml_training_runs.comparison` → propose.

**A candidate is never auto-promoted.** The agent proposes, an admin approves. This is the single most important behaviour in the whole feature: it is what makes the thing an assistant rather than an unsupervised model silently rewriting our lead scoring. It also gives the demo its best moment — a human in the loop, on screen.

Promotion gate: candidate must beat incumbent on the primary metric by a margin we set up front, and must not regress on any segment below a floor.

### 03 · Correction Loop

`services/ml/correctionService.js`

An expert flags a wrong call — from chat, or from the Human Review screen. We capture it as a labelled correction record with the reason text and the feature vector as it was at prediction time.

Corrections are **weighted into the next retrain, never applied instantly**. Nothing about the live model changes when someone disagrees with it. This prevents a single loud reviewer from steering the model, keeps scores reproducible between retrains, and makes every change traceable to an approved training run.

Write a `lead_decision_events` row for each correction so it shows up in the existing decision trail UI.

### 04 · Monitoring Suite

`services/ml/monitoringService.js`

- **Drift** — population stability index on the feature distribution, current window vs training window.
- **Calibration** — do leads scored 0.8 convert ~80% of the time? Reliability buckets.
- **Synthetic stress testing** — generated edge-case records (missing Probe42 data, extreme revenue, unseen sector) run through the model to check it degrades sanely rather than producing confident nonsense.
- **Feature-importance audits** — per model version, with a diff against the previous version. A sudden change in what the model leans on is the earliest warning that the data source shifted.

A breach raises a monitoring alert and can fire the retraining trigger.

---

## 5. Where the model actually runs

The backend is Node; the modelling ecosystem is Python. Three options:

| Option | Fit |
|---|---|
| **Vertex AI** (training + endpoint) | Strongest hackathon story — it is Google Cloud, which the rules reward, and we get versioning for free. Heaviest setup. |
| **Python service as a second Cloud Run service** | Most control, familiar tooling (scikit-learn), one more thing to deploy and keep alive. |
| **Pure JS logistic regression in-process** | No new infrastructure, trains in milliseconds on our data volume, trivially explainable coefficients. Weakest "real ML" impression. |

**Recommendation: start on the JS implementation, and design every interface so the model sits behind `modelRegistryService.resolveModelForLead()`.** Then the engine swap is one adapter, not a rewrite. If there is time before submission, move training to Vertex AI and keep the same registry rows. Logistic regression on a few hundred rows is also, genuinely, the correct model choice for this data size — and its coefficients give us feature importances for free, which Pillar 04 needs.

---

## 6. API surface

```
GET  /api/ml/models                     list registry, filter by segment/status
POST /api/ml/models/:id/promote         admin approves a candidate
POST /api/ml/models/:id/retire
GET  /api/ml/training-runs              history, with comparison payloads
POST /api/ml/training-runs              manual trigger
POST /api/ml/corrections                log an expert correction
GET  /api/ml/monitoring/:modelId        drift, calibration, feature importance
```

Follow the existing route → controller → service → repository layering. Admin-only actions go behind the existing auth middleware.

---

## 7. Frontend

- **Model Registry page** — segments, active version per segment, metrics, fallback chain made visible.
- **Retraining review** — the candidate-vs-incumbent comparison with an Approve / Reject action. This is the screen to demo.
- **Correction entry** — extend the existing Human Review flow rather than building a separate surface; the reviewer is already there making exactly this judgment.
- **Monitoring dashboard** — drift and calibration over time, feature-importance diff between versions.

Reuse `components/leads/DecisionTrail.tsx` and `ScoreBreakdown.tsx` where they fit — a model's contribution to a score belongs in the same breakdown the rules already appear in.

---

## 8. Build order

1. Confirm the CRM label feed. Everything downstream depends on it.
2. Migration + repositories for the five tables.
3. Feature extraction, reusing the inputs `qualificationScoringService.js` already assembles.
4. Registry + fallback chain, serving the deterministic scorer as the `__pooled__` floor. **At this point nothing has changed behaviourally — that is the point. Ship it and verify.**
5. Training + evaluation + the propose/approve flow.
6. Correction loop.
7. Monitoring.
8. Frontend screens.

Steps 2–4 are safe and independent. Step 5 is where the feature becomes real.

---

## 9. Scope warning

This is a substantial system — realistically the largest single feature in the project. If it is being built for the hackathon submission rather than after it, build **1, 2, 3, 4, 5 and the retraining-review screen**, and present 6–8 as designed-and-specified. A working propose/approve loop over a real model demonstrates the whole idea. Four half-built pillars demonstrate none of it.
