# AI Builder Cup — What We Need to Change

Source: https://aibuildercup.com/themes.html

**Theme we're entering: Theme 1 — BFSI: Intelligent Risk, Fraud & Financial Experiences.**
Our tender → lead → qualification → proposal pipeline fits this track almost as-is.

Judging: Technical Merit & Gen AI 40% · Problem Alignment & Impact 25% · Innovation & Creativity 25% · UX & Solution Design 10%.

---

## 1. Swap the AI layer to Gemini / Gemma (eligibility blocker)

The rules require Gemini or Gemma. Right now we have two providers and **neither one qualifies**:

- `backend/src/jobs/aiExtraction.js`, `leadIntelligence.js`, `leadQualification.js`, `mcaProfile.js` call OpenAI `gpt-4o-mini` directly.
- `backend/src/services/ollama/*` (6 files) runs against local Ollama.

Plan: add `backend/src/services/gemini/geminiClient.js` mirroring the existing `OllamaClient` interface (same chat → parsed-JSON contract, retry, timeout, code-fence stripping), point the four jobs at it, and keep Ollama as an offline fallback running `gemma3`. Rename the `ollama/` folder to something provider-neutral so the services under it stop reading as Ollama-specific.

This is 40% of the score, so it's first.

## 2. Deploy on Google Cloud (eligibility blocker)

Required: Cloud Run or Firebase. We currently have no deployment at all.

- Backend: `Dockerfile`, listen on `PORT`, ship as a Cloud Run service.
- Frontend: Vite build → Firebase Hosting, with the API base URL coming from env instead of hardcoded `localhost:5000`.
- Secrets: move `.env` into Secret Manager.
- **Known risk:** the Playwright scrapers need the Playwright base image on Cloud Run, or they move out into a separate Cloud Run Job. This is the one genuinely uncertain piece — worth spiking early.

## 3. Database → Cloud SQL

- MySQL → Cloud SQL for MySQL. Almost no code change; the `mysql2` pool just takes a socket path.
- `DB_NAME=sbi_leadgen` → neutral name.
- Rename the customer-check schema: `sbi_customers` table, `addSbiCustomerSchema.js`, `sbiCustomerRepository.js` → `existing_customers` / `customerCheck*`.
- Drop the unused `sqlite3` dependency.

## 4. Finish de-branding the code

The README is already clean. Still carrying the old name:

- `backend/package.json` — name, description, and the repo / bugs / homepage URLs.
- Frontend UI strings in `Sidebar.tsx`, `Settings.tsx`, `StatusBadge.tsx`, `Button.tsx`.
- Brand colour tokens in `frontend/src/theme/colors.ts` and `index.css`.

## 5. Make the innovation visible

25% of the score is originality, and our strongest differentiator — the human-in-the-loop review plus the evidence-collector chain feeding qualification — is currently buried in the backend. Surface it in the UI (show the evidence behind each score, show the reviewer's decision trail) and lead with it in the deck. Also do an accessibility pass on the dashboard for the UX 10%.

## 6. Submission artifacts (non-code)

- Proposal deck as PDF: problem, community benefit, feasibility, scalability.
- Working prototype deployed on Cloud Run / Firebase.
- ~3-minute demo video, public YouTube / Vimeo / Drive link.
- Problem statement category named in the submission. Note: the submission form lists Healthcare / Education / Sustainability / Accessibility / Social Good, which doesn't match the six themes — someone should email support+aibuildercup@hack2skill.com to confirm what we put for BFSI.
- Everything in English.

---

## Progress so far (15 Oct) — items 2 and 3

Already done, no GCP account needed for any of it:

- `backend/src/config/database.js` — connects over a Unix socket when `DB_SOCKET` is set (Cloud SQL), falls back to host/port locally. Connection-error message updated to print whichever one is in use.
- `DB_NAME` default `sbi_leadgen` → `leadgen` in `config/database.js`, `db/mysql.js`, `db/init.js`, `.env.example`, and one comment in `migrations/add_scraping_job_stats.sql`.
- Removed the unused `sqlite3` dependency from `backend/package.json`; `npm install` has been run, so the lockfile and `node_modules` are back in sync. **Needed because the Dockerfile uses `npm ci`, which fails outright on a mismatched lockfile.**
- `backend/Dockerfile` and `backend/.dockerignore` written. Based on `mcr.microsoft.com/playwright:v1.62.0-jammy`, not a plain Node image, because Chromium needs system libraries a slim image lacks. Keep that tag's version matching the `playwright` entry in `package.json`.
- `frontend/src/constants/dashboard.js` — `BACKEND_URL` now resolves `window.BACKEND_URL` → `VITE_BACKEND_URL` → `http://localhost:5000`. Every API service file imports this one constant, so nothing else needed changing.
- `backend/src/server.js` — CORS origins are now a fixed local-dev list plus a comma-separated `CORS_ORIGINS` env var for the deployed frontend. Also added `localhost:5173` (Vite's default port), which was missing and would have blocked `npm run dev`.
- `server.js` already read `process.env.PORT`, so Cloud Run needs no change there.
- Customer Check feature de-branded end to end, backend and frontend in one pass: table `sbi_existing_customers` → `existing_customers`; files `addSbiCustomerSchema.js` → `addCustomerCheckSchema.js`, `sbiCustomerRepository.js` → `customerCheckRepository.js`, `sbiCustomerCheckService.js` → `customerCheckService.js`; API route `/api/tenders/:id/sbi-check` → `/customer-check`; client `fetchSbiCheck` → `fetchCustomerCheck`; and the user-facing labels on the Lead Details page ("Customer Check", "Existing Customer", "Not an Existing Customer"). The migration now renames an existing `sbi_existing_customers` table rather than creating an empty one beside it, so no local database loses its seed data.
- `frontend/firebase.json` written: serves `dist`, rewrites all routes to `index.html` so React Router deep links survive a refresh, and caches hashed assets for a year while keeping `index.html` uncached so redeploys appear immediately. `frontend/.env.production.example` added as the template for the Cloud Run URL.
- Deleted `backend/src/db/mysql.js`, a second duplicate MySQL pool with its own config. Its only consumer, `jobs/migrateTenderData.js`, now imports `all`/`run` from `config/database.js`, whose signatures are identical — so the Cloud SQL socket logic lives in exactly one place instead of two.

### Still open in items 2 and 3

- **The scraper cannot run in a container as written.** `backend/src/automation/browser/browser.js:53` calls `chromium.connectOverCDP('http://localhost:9222')` — it attaches to a Chrome someone started manually with remote debugging on, it never launches its own. There is no such Chrome inside a container. Needs a launch fallback:

  ```js
  const browser = process.env.CDP_ENDPOINT
    ? await chromium.connectOverCDP(process.env.CDP_ENDPOINT)
    : await chromium.launch({ args: ['--no-sandbox'] });
  ```

  `--no-sandbox` is required in containers. Not urgent: the API and dashboard deploy and work fine without it, only live scraping is affected, so a seeded-data demo is unblocked.
- `firebase.json` + hosting config for the frontend.
- On GCP, once access lands: create the Cloud SQL instance, push secrets, `gcloud run deploy`, `firebase deploy`.

### Deploy commands (for when GCP access lands)

Backend to Cloud Run — builds the image in the cloud from `backend/Dockerfile`, no local Docker:

```bash
gcloud run deploy leadgen-api   --source ./backend   --region asia-south1   --allow-unauthenticated   --add-cloudsql-instances PROJECT:asia-south1:leadgen-db   --set-env-vars DB_SOCKET=/cloudsql/PROJECT:asia-south1:leadgen-db,DB_NAME=leadgen,DB_USER=root,CORS_ORIGINS=https://PROJECT.web.app   --set-secrets DB_PASSWORD=DB_PASSWORD:latest,JWT_SECRET=JWT_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest   --memory 2Gi --timeout 300
```

`--memory 2Gi` because Chromium OOMs at the 512Mi default.

Frontend to Firebase Hosting — the Cloud Run URL from the step above goes into `.env.production` first, because Vite inlines it at build time, not at serve time:

```bash
cd frontend
cp .env.production.example .env.production   # edit in the real Cloud Run URL
npm run build
firebase deploy --only hosting
```

`firebase init hosting` needs running once before the first deploy (public dir `dist`, single-page app yes, and do not let it overwrite `index.html`). It writes `.firebaserc` with the project ID, which is gitignored.

### Notes on tooling

Docker Desktop is **not** required. `gcloud run deploy --source ./backend` builds the image with Cloud Build in the cloud, using the Dockerfile above. On a locked-down machine with no admin rights, run the deploy commands from Cloud Shell (`shell.cloud.google.com`) — it has `gcloud`, `node` and `git` preinstalled and needs nothing installed locally.

---

**Order of work:** 1 and 2 are eligibility gates, do them first. 3 and 4 are mechanical. 5 is where the remaining points are. 6 runs in parallel.
