# Fintech Lead Intelligence

An AI lead-generation tool for bank relationship managers. It reads public government tender awards, finds the companies that won them, scores each one as a banking lead, and drafts a product proposal and outreach email with Gemini. A person approves every proposal and every email.

The idea: a company that has just won a government contract needs a performance bank guarantee and working capital within weeks.

Live app: https://leadgen-web-943775558788.asia-south1.run.app

## How it works

1. **Discover** — scrapers collect awarded tenders and winners from TenderBook, plus open CPPP eProcurement tenders as early signals.
2. **Enrich** — each winning company is matched to its Probe42 financial profile (revenue, net profit, credit rating, compliance). The prototype uses an imported Probe42 dataset.
3. **Qualify** — 10 fixed rules score each lead out of 100 ([qualificationRules.js](backend/src/services/scoring/qualificationRules.js)): 80+ is a good lead, 60–79 is flagged for expert review, under 60 is rejected. Missing data scores 0 and is never guessed. Gemini adds an advisory note (reasoning, risks, missing evidence) but cannot change the score.
4. **Propose** — for qualified leads, Gemini recommends a banking product and drafts a personalised email, using only the evidence it is given.
5. **Expert review** — a reviewer approves, requests changes, rejects or holds each proposal. Every decision, and which scorer produced the score, is written to a decision trail.
6. **Engage** — the approved email gets a final human approval and is queued. Sending is not built yet.
7. **Learn** — approvals and rejections become training data. After 30 decisions (at least 8 of each), the Model Maintenance agent trains a logistic-regression model per segment (sector and region), compares it with the current scorer on held-out leads, and proposes it only if it is better overall and no worse in any sector. An admin promotes it; the rules stay as the fallback.

The Dashboard also shows a daily Gemini brief of the pipeline: what changed, what to act on and what is stuck.

## Gemini

Every AI feature goes through one client ([llmClient.js](backend/src/services/llm/llmClient.js) → [geminiClient.js](backend/src/services/llm/geminiClient.js)), so the model, retries and JSON output format are set in one place.

- **Model:** `gemini-3.5-flash-lite` by default (override with `GEMINI_MODEL`).
- **Output:** JSON mode, then a strict shape check before anything is saved. If a call fails, nothing is saved and the lead stays where it was.
- **Quota:** daily-limit errors fail fast instead of being retried; batch jobs leave affected leads pending for the next run.
- **Telemetry:** every call is logged to the `llm_calls` table (tokens, latency, outcome, feature). Settings → AI Configuration shows usage and tokens per lead.
- **Offline fallback:** `LLM_PROVIDER=ollama` runs the same features on a local Gemma model.

## Project structure

```
backend/    Express API, MySQL, scrapers, scoring rules, Gemini client, ML training
frontend/   React 19 + Vite + TypeScript dashboard
```

`backend/` and `frontend/` are independent projects with no root `package.json`.

## Tech stack

- **Backend:** Node.js (Express 4), MySQL 8, Playwright (scraping), Gemini API
- **Frontend:** React 19, TypeScript, Vite, React Router v7, TanStack Query, Tailwind CSS v4
- **Google Cloud:** Cloud Run (web app and API), Cloud SQL for MySQL, Secret Manager for the Gemini key

## Local setup

**Backend**
```bash
cd backend
npm install
npx playwright install chromium   # only if running scrapers
cp .env.example .env              # set DB_*, JWT_SECRET and GEMINI_API_KEY
npm run db:init
npm run dev                       # http://localhost:5000
npm test                          # unit tests
```

**Frontend**
```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

Get a Gemini key at https://aistudio.google.com/apikey. The free tier allows a small number of requests per day, so enable billing for anything beyond a quick test.

## Environment variables

See [backend/.env.example](backend/.env.example) for the full list.

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `DB_SOCKET` | Cloud SQL Unix socket; when set, host and port are ignored |
| `JWT_SECRET` | Signing secret for API tokens |
| `GEMINI_API_KEY` | Gemini API key (required) |
| `GEMINI_MODEL`, `GEMINI_THINKING_LEVEL` | Optional model and thinking-level overrides |
| `GEMINI_PRICE_INPUT_USD_PER_MTOK`, `GEMINI_PRICE_OUTPUT_USD_PER_MTOK` | Optional; lets Settings show cost per lead |
| `CORS_ORIGINS` | Extra browser origins allowed to call the API |
| `LLM_PROVIDER` | `gemini` (default) or `ollama` |

## Deployment

- **API:** [backend/Dockerfile](backend/Dockerfile) builds the Cloud Run image. Set `DB_SOCKET` to the Cloud SQL socket and provide `GEMINI_API_KEY` from Secret Manager.
- **Web app:** build with `VITE_BACKEND_URL` set to the API's Cloud Run URL (see [frontend/.env.production.example](frontend/.env.production.example)).
- **Scrapers** run as batch jobs (`node src/jobs/<job>.js`). The TenderBook scraper needs a logged-in Chrome session, so run it from a workstation against the same database.
