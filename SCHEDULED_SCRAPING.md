# Scheduled Scraping — Build Notes

Making tender discovery run on its own instead of being triggered by hand. "Discover" is step one of the product story, so a judge asking "does it run automatically?" should get a yes.

**Priority: below the AI Brief and the Settings model fix.** Those are an hour each and move the 40% Gen AI criterion. This is a couple of hours with a real chance the portal blocks a Cloud Run IP. Do it if there is time, skip it honestly if not — see section 6.

---

## 0. Read this before starting

**This may simply not be achievable, and that is an acceptable outcome.** Public procurement portals defend themselves: CPPP and GeM gate behind CAPTCHAs, TenderBook puts winner data behind a paid login, and bot protection that ignores a residential IP will often block a Cloud Run one.

The sandbox *did* scrape TenderBook listing pages successfully (332 rows, then ~22,900 across 24 categories) from inside the InnoHub environment, so the parser works and the listings were not CAPTCHA'd from there. Whether the same holds from a Google Cloud IP is unknown until tried, and that is the whole risk.

Team decision, unchanged: **no bypassing paywalls, logins or CAPTCHAs.** If a portal blocks us, we stop, we do not work around it.

So: timebox this. Do step 1 and step 3 first — the code fix and a single manual run. If that run inserts rows, continue to scheduling. If it comes back empty or blocked, stop and use the line in section 6. Do not spend a day on it.

---

## 1. Where things actually stand

Both scrapers exist and neither runs on a schedule.

**`src/jobs/cpppScrape.js`** — launches its own headless Chromium (`chromium.launch`, line 167), so it works fine inside a container. It was deployed as a Cloud Run Job (`leadgen-scrape`) and the execution **succeeded while scraping nothing**: line 35 sets `SOURCE_ID = 15`, it queries `source_urls` for that source, finds none, logs "No pending source_urls for source id 15" and exits 0. The imported database has source **13** (TenderBook) and a handful of others, but no source 15.

**`src/automation/index.js`** (the TenderBook scraper, wrapped by `src/jobs/tenderbookScrape.js`) — **cannot run in a container as written.** `src/automation/browser/browser.js:53` calls `chromium.connectOverCDP('http://localhost:9222')`, which attaches to a Chrome someone started manually with remote debugging on. There is no such Chrome in Cloud Run.

---

## 2. Recommended path: TenderBook, not CPPP

TenderBook is the cheaper win because **the imported database already contains its 24 registered category URLs** under source 13 (`https://www.tenderbook.in/tender-results/<slug>-categories/active`). CPPP would need a source row and URLs registered from scratch.

So the work is one code change plus deployment, not a data-entry exercise.

### Step 1 — give the browser helper a launch fallback

`backend/src/automation/browser/browser.js`, in `connectBrowser()`:

```js
const browser = process.env.CDP_ENDPOINT
  ? await chromium.connectOverCDP(process.env.CDP_ENDPOINT)
  : await chromium.launch({ args: ['--no-sandbox'] });
```

`--no-sandbox` is required in containers. Keeping `CDP_ENDPOINT` as an opt-in means the existing local workflow (manually started Chrome on 9222) keeps working unchanged — don't remove that path, the sandbox depends on it.

Note `checkRemoteDebuggingAvailable()` currently runs before connecting and throws if nothing answers on 9222. That check should only run on the CDP branch, or it will fail the launch path before it starts.

### Step 2 — deploy as a Cloud Run Job

Run `src/automation/index.js` directly, **not** `src/jobs/tenderbookScrape.js` — the sandbox notes record that the job file imports the automation module *and* calls it again, so it may run twice.

```bash
gcloud run jobs deploy leadgen-tenderbook \
  --source ./backend --region $REGION \
  --command node --args src/automation/index.js \
  --set-cloudsql-instances $PROJECT_ID:$REGION:leadgen-db \
  --set-env-vars DB_SOCKET=/cloudsql/$PROJECT_ID:$REGION:leadgen-db,DB_NAME=leadgen,DB_USER=root,TENDER_SCRAPE_DETAILS=false \
  --set-secrets DB_PASSWORD=DB_PASSWORD:latest \
  --memory 2Gi --task-timeout 3600
```

`TENDER_SCRAPE_DETAILS=false` keeps the first run fast. The full 24-category scrape with detail pages took hours in the sandbox and produced ~22,900 rows.

### Step 3 — verify one real run before scheduling anything

```bash
gcloud run jobs execute leadgen-tenderbook --region $REGION --wait
```

Then check it actually wrote rows:

```sql
SELECT COUNT(*) FROM scraped_documents WHERE created_at > NOW() - INTERVAL 1 HOUR;
```

**Scraped rows do not become tenders by themselves.** `src/jobs/documentProcessor.js` moves Pending `scraped_documents` into `tenders`. That has to run after the scrape, as a second job or a second step.

### Step 4 — only now, schedule it

```bash
gcloud scheduler jobs create http leadgen-tenderbook-weekly \
  --location $REGION \
  --schedule "17 2 * * 1" \
  --uri "https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/leadgen-tenderbook:run" \
  --http-method POST \
  --oauth-service-account-email "$PROJECT_NUM-compute@developer.gserviceaccount.com"
```

Weekly, at an off-peak minute. Daily is pointless — the scraper looks back 30 days anyway.

---

## 3. Create it paused

**Do not let a scrape run before the screenshots and demo video are captured.** New rows change the dashboard counts the deck quotes, and a re-scrape could overwrite rows the walkthrough depends on.

```bash
gcloud scheduler jobs pause leadgen-tenderbook-weekly --location $REGION
```

Resume after recording.

---

## 4. What this does and does not get us

**Does:** more tenders, automatically, from a real source, with the pipeline running unattended on Google Cloud infrastructure. That is a legitimate architecture point for the deck.

**Does not:** more *winners*. TenderBook hides winner data behind a paid login, and the standing team decision is not to bypass it. Winners in our data come from public award announcements, entered by hand. Since a tender without a winner produces no lead, scheduled scraping grows the top of the funnel and nothing below it.

Say that plainly rather than implying the pipeline self-feeds end to end. A judge who asks "so where do the winners come from?" should get the real answer, which is a good answer — public, sourced, verifiable announcements.

---

## 5. Watch out for

- **The portal may block a Cloud Run IP** where a laptop IP works. If the run returns zero rows with no error, this is the first thing to check. There is no fix within the rules — if it blocks, the honest position is section 6.
- **No paywall, login or CAPTCHA bypass.** Standing team decision, applies to TenderBook, CPPP and GeM.
- **Rate limiting.** Space runs out; do not hammer a government portal from a cloud IP.
- **Use `/tender-results/<slug>-categories/active` URLs**, never `/all-tenders/...` — the parser skips every card on the latter with "no stable tender ID". The 24 URLs already in the database are the correct form.
- **Clear stuck jobs** if a run is interrupted: `UPDATE scraping_jobs SET status='Completed' WHERE status='Running';`

---

## 6. If it does not work out

The honest line for the architecture slide, true as of today with no further work:

> Scrapers are packaged as Cloud Run Jobs, triggered on demand and ready for Cloud Scheduler.

That is accurate, demonstrates the right separation (scraping does not run inside the API service), and no judge will fault it. Do not claim automated discovery unless a scheduled run has actually inserted rows.
