import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { run, all, get } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);

// CPPP eProcurement scraper (source id 15, "CPPP Tenders by Closing Date").
// See that source's `description` for the full pivot story — short version:
// this was originally scoped against "Tenders by Classification", but that
// page (and every listing page except one) requires solving a CAPTCHA, which
// this job intentionally does not automate past. The one captcha-free
// browsable listing is "Tenders by Closing Date" -> "Closing within 14 days"
// tab; category comes from each tender's detail page ($DirectLink) instead
// of a classification browse, since the classification page is unreachable.
//
// KNOWN QUIRKS (confirmed via live exploration before writing this job):
// - The 14-day tab is session/form-state driven, not a bookmarkable URL —
//   page.url() stays on the bare app URL after clicking it. The job always
//   starts at the listing page and clicks the tab itself (like MCA hardcodes
//   its resource ID rather than deriving it from source_urls).
// - Pagination links ARE real URLs (component=$TablePages.linkPage...), but
//   are only reachable after establishing the tab's session state, so this
//   job clicks them within the same page/session rather than goto()'ing a
//   fresh context to each one.
// - Captcha-free coverage is capped at 14 days forward, not the 30-day
//   ("last 1 month") window originally requested — CPPP closing/opening
//   dates are forward-looking (still-open tenders), unlike TenderBook's
//   backward-looking contract-award dates. LOOKBACK_DAYS below is kept for
//   correctness/documentation even though it's currently a no-op given the
//   14-day ceiling.
// - "Tender Value in Rs" is frequently "NA" (undisclosed) — stored as-is,
//   that's a truthful scraped value, not a scrape failure.

const SOURCE_ID = 15;
const LOOKBACK_DAYS = 30; // see KNOWN QUIRKS above: currently a no-op given the 14-day captcha-free ceiling
const MAX_PAGES = 200; // circuit breaker; the 14-day tab has been observed to run ~7 pages

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseCpppDate(dateStr) {
  const match = /^(\d{2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2})\s*(AM|PM)$/i.exec((dateStr || '').trim());
  if (!match) return null;
  const [, dd, mon, yyyy, hh, mm, ampm] = match;
  const month = MONTHS[mon];
  if (month === undefined) return null;
  let hour = Number(hh) % 12;
  if (/pm/i.test(ampm)) hour += 12;
  return new Date(Number(yyyy), month, Number(dd), hour, Number(mm));
}

function randomDelayMs() {
  return 2000 + Math.random() * 3000; // 2-5 seconds, per spec
}

function buildCleanedText(tender) {
  return [
    tender.title,
    `Category: ${tender.category} | Location: ${tender.location}`,
    `Amount: ${tender.amount} | Closing: ${tender.closingDate} | Bid Opening: ${tender.bidOpeningDate}`,
    `Reference No: ${tender.referenceNo} | Tender ID: ${tender.tenderId}`,
    '',
    tender.description,
  ].join('\n');
}

// "No popup expected on this site" per the milestone, but wrapped
// defensively anyway — same generic dialog/overlay detector used for
// TenderBook, not tailored to any specific CPPP popup since none was
// observed during live exploration.
async function closePopupIfPresent(page) {
  const dialog = page.locator('[role="dialog"], .modal, [class*="modal" i], [class*="popup" i]').first();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 1500 });
  } catch {
    return;
  }
  const closeBtn = dialog
    .locator('button[aria-label="Close" i], button:has-text("×"), button:has-text("Close"), [class*="close" i]')
    .first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click().catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.waitForTimeout(500);
}

async function scrapeListingRows(page) {
  return page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a#DirectLink'));
    return links.map((link) => {
      const row = link.closest('tr');
      const cells = row ? Array.from(row.querySelectorAll('td')) : [];
      const closingDate = cells[2]?.textContent?.trim() || '';
      const bidOpeningDate = cells[3]?.textContent?.trim() || '';

      const titleCell = cells[4] || link.closest('td');
      const brackets = [...(titleCell?.textContent || '').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
      const title = brackets[0] || link.textContent.trim().replace(/^\[|\]$/g, '');
      const referenceNo = brackets[1] || '';
      const tenderId = brackets[2] || '';

      return { title, referenceNo, tenderId, closingDate, bidOpeningDate, detailUrl: link.href, rowHtml: row ? row.outerHTML : '' };
    });
  });
}

async function scrapeDetailPage(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const bounded = (label, stopLabel) => {
      const re = new RegExp(`${label}\\s+([^\\t\\n]+?)\\s+${stopLabel}`);
      const m = re.exec(text);
      return m ? m[1].trim() : '';
    };
    const description = bounded('Work Description', "NDA/Pre Qualification");
    const location = bounded('Location', 'Pincode');
    const category = bounded('Tender Category', 'No\\. of Covers');
    const amount = bounded('Tender Value in ₹', 'Product Category');
    const emdAmount = bounded('EMD Amount in ₹', 'EMD Exemption Allowed');
    return { description, location, category, amount, emdAmount, detailHtml: document.body.innerHTML };
  });
}

async function tenderAlreadyExists(sourceId, tender) {
  const existing = await get(
    `SELECT sd.id
     FROM scraped_documents sd
     JOIN scraping_jobs sj ON sj.id = sd.scraping_job_id
     JOIN source_urls su ON su.id = sj.source_url_id
     WHERE su.source_id = ?
       AND sd.metadata_json->>'$.title' = ?
       AND sd.metadata_json->>'$.description' = ?
       AND sd.metadata_json->>'$.location' = ?
       AND sd.metadata_json->>'$.category' = ?
       AND sd.metadata_json->>'$.amount' = ?
       AND sd.metadata_json->>'$.contractDate' = ?`,
    [sourceId, tender.title, tender.description, tender.location, tender.category, tender.amount, tender.contractDate]
  );
  return !!existing;
}

async function findNextPageLink(page, pageNum) {
  const target = String(pageNum + 1);
  const link = page.locator(`a:text-is("${target}")`).first();
  return (await link.count()) > 0 ? link : null;
}

export async function runCpppScrape() {
  const sourceUrl = await get(`SELECT * FROM source_urls WHERE source_id = ? AND last_scraped_at IS NULL LIMIT 1`, [SOURCE_ID]);
  if (!sourceUrl) {
    console.log(`[CPPP Scrape] No pending source_urls for source id ${SOURCE_ID}.`);
    return;
  }

  const jobResult = await run(
    `INSERT INTO scraping_jobs (source_url_id, status, started_at) VALUES (?, 'Running', CURRENT_TIMESTAMP)`,
    [sourceUrl.id]
  );
  const jobId = jobResult.lastID;
  console.log(`[CPPP Scrape] Job ${jobId} started for source_url ${sourceUrl.id} (${sourceUrl.url})`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + LOOKBACK_DAYS);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let totalFound = 0;
  let stored = 0;
  let duplicates = 0;
  let outOfWindow = 0;
  let failed = 0;

  try {
    await page.goto(sourceUrl.url, { waitUntil: 'networkidle', timeout: 30000 });
    await closePopupIfPresent(page);
    await page.getByText('Closing within 14 days', { exact: true }).first().click();
    await page.waitForTimeout(randomDelayMs());
    await closePopupIfPresent(page);

    let pageNum = 1;
    while (pageNum <= MAX_PAGES) {
      const rows = await scrapeListingRows(page);
      if (rows.length === 0) {
        console.log(`[CPPP Scrape] Job ${jobId}: page ${pageNum} had no rows — end of results.`);
        break;
      }

      for (const row of rows) {
        totalFound++;
        try {
          await page.goto(row.detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await closePopupIfPresent(page);
          const detail = await scrapeDetailPage(page);

          const tender = {
            title: row.title,
            description: detail.description,
            location: detail.location,
            category: detail.category,
            amount: detail.amount,
            contractDate: `Closing: ${row.closingDate} | Bid Opening: ${row.bidOpeningDate}`,
            referenceNo: row.referenceNo,
            tenderId: row.tenderId,
            closingDate: row.closingDate,
            bidOpeningDate: row.bidOpeningDate,
            emdAmount: detail.emdAmount,
            detailUrl: row.detailUrl,
          };

          const closing = parseCpppDate(row.closingDate);
          const opening = parseCpppDate(row.bidOpeningDate);
          const withinWindow = (closing && closing <= cutoff) || (opening && opening <= cutoff);
          if (!withinWindow) {
            outOfWindow++;
            await page.waitForTimeout(randomDelayMs());
            continue;
          }

          if (await tenderAlreadyExists(sourceUrl.source_id, tender)) {
            duplicates++;
            await page.waitForTimeout(randomDelayMs());
            continue;
          }

          await run(
            `INSERT INTO scraped_documents (scraping_job_id, raw_html, cleaned_text, metadata_json) VALUES (?, ?, ?, ?)`,
            [
              jobId,
              `<!-- listing row -->\n${row.rowHtml}\n<!-- detail page -->\n${detail.detailHtml}`,
              buildCleanedText(tender),
              JSON.stringify({
                title: tender.title,
                description: tender.description,
                location: tender.location,
                category: tender.category,
                amount: tender.amount,
                contractDate: tender.contractDate,
                referenceNo: tender.referenceNo,
                tenderId: tender.tenderId,
                emdAmount: tender.emdAmount,
                detailUrl: tender.detailUrl,
              }),
            ]
          );
          stored++;
        } catch (tenderError) {
          failed++;
          console.error(`[CPPP Scrape] Job ${jobId}: failed to process tender "${row.title || 'unknown'}" —`, tenderError.message);
        }
        await page.waitForTimeout(randomDelayMs());
      }

      await page.goto(sourceUrl.url, { waitUntil: 'networkidle', timeout: 30000 });
      await closePopupIfPresent(page);
      await page.getByText('Closing within 14 days', { exact: true }).first().click();
      await page.waitForTimeout(randomDelayMs());

      const nextLink = await findNextPageLink(page, pageNum);
      if (!nextLink) {
        console.log(`[CPPP Scrape] Job ${jobId}: no page ${pageNum + 1} link found — end of results.`);
        break;
      }
      await nextLink.click();
      await page.waitForTimeout(randomDelayMs());
      await closePopupIfPresent(page);
      pageNum++;
    }

    await run(
      `UPDATE scraping_jobs SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, records_found = ? WHERE id = ?`,
      [totalFound, jobId]
    );
    await run(
      `UPDATE source_urls SET last_scraped_at = CURRENT_TIMESTAMP, verification_status = 'Verified' WHERE id = ?`,
      [sourceUrl.id]
    );
    console.log(`[CPPP Scrape] Job ${jobId} completed: ${stored} stored, ${duplicates} duplicate(s) skipped, ${outOfWindow} out-of-window, ${failed} failed, out of ${totalFound} scraped.`);
  } catch (error) {
    await run(
      `UPDATE scraping_jobs SET status = 'Failed', completed_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?`,
      [error.message, jobId]
    );
    console.error(`[CPPP Scrape] Job ${jobId} failed:`, error.message);
  } finally {
    await browser.close();
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runCpppScrape()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[CPPP Scrape] Fatal error:', error);
      process.exit(1);
    });
}
