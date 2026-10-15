# LeadGen Intelligence Platform

An internal lead-generation and qualification tool for relationship managers. It scrapes public government e-tender portals, enriches winning companies with corporate-registry and financial data, runs a deterministic + AI-assisted scoring pipeline to qualify each tender as a banking lead, and takes surviving leads through a human-in-the-loop proposal and outreach workflow. A React dashboard covers the tender pipeline, human review, communication drafts, and analytics.

## Project Structure

```
lead-gen-agent/
├── backend/    Express.js API + MySQL + scraping/AI jobs
└── frontend/   React 19 + Vite + TypeScript dashboard
```

`backend/` and `frontend/` are independent projects — no root `package.json`.

## Tech Stack

- **Backend:** Node.js (Express 4), MySQL, JWT auth, Playwright (scraping), Ollama (AI scoring/proposals), OpenAI (select jobs)
- **Frontend:** React 19 + TypeScript, Vite, React Router v7, TanStack Query, Tailwind CSS v4

## What It Does

1. **Scrape** tender listings from TenderBook and CPPP eProcurement
2. **Enrich** with MCA company data and Probe42 financial reports
3. **Qualify** each lead via a deterministic scoring pipeline
4. **Propose** a banking product for qualified leads, reviewed by a human
5. **Communicate** an approved outreach email, reviewed before sending
6. **Present** it all in a dashboard: Dashboard, Tender Leads, Human Review, Communication, Analytics, Settings

## Setup

**Backend**
```bash
cd backend
npm install
npx playwright install chromium   # only if running scrapers
cp .env.example .env              # fill in DB, JWT, OLLAMA_BASE_URL, OLLAMA_DEFAULT_MODEL
npm run db:init
npm run dev                       # http://localhost:5000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

## Environment Variables

Required beyond `.env.example`: `OLLAMA_BASE_URL`, `OLLAMA_DEFAULT_MODEL` (qualification/proposal generation will fail without these). Optional: `OPENAI_API_KEY` (only for a few legacy jobs), `DATA_GOV_IN_API_KEY` (MCA data jobs).
