// One-off backfill: re-normalizes the raw_html/metadata_json already sitting
// in scraped_documents for TenderBook rows so the newly-added tenders
// columns (closing_date, tender_type, tender_city, tender_state, etc.) get
// populated for tenders scraped before this enrichment existed, without
// needing a live browser. Re-parses raw_html with the current parser rules
// (not just the old metadata_json) so the 30 legacy rows with a missing
// tenderId/url (see DATABASE_ANALYSIS.md) get a chance to resolve too.
//
// Safe to re-run: upsertTender() is keyed on tender_id, so this only ever
// overwrites TenderBook-owned columns on rows it already produced.
//
// Usage: node scripts/backfillTenderBookFields.js

import { all } from '../src/config/database.js';
import { upsertTender } from '../src/repositories/tenderRepository.js';
import {
  normalizeWhitespace,
  normalizeCompanyName,
  normalizeAmount,
  normalizeDate,
  normalizeLocation,
} from '../src/automation/scraper/normalize.js';

const SOURCE_NAME = 'TenderBook';

function reparseFromRawHtml(rawHtml) {
  const linkMatch = rawHtml.match(/href="(\/tender-results\/[^"]+)"/);
  const url = linkMatch ? `https://www.tenderbook.in${linkMatch[1]}` : null;
  const tenderId = url ? url.split('/').filter(Boolean).pop() : null;

  const titleMatch = rawHtml.match(/<h3[^>]*>([^<]+)<\/h3>/);
  const title = titleMatch ? titleMatch[1].trim() : null;

  const descMatch = rawHtml.match(/<p[^>]*title="([^"]+)"/);
  const description = descMatch ? descMatch[1] : null;

  const closingMatch = (description || '').match(
    /last date of submission for this tender is\s*([\d]{4}-[\d]{2}-[\d]{2})/i
  );
  const tenderTypeMatch = (description || '').match(/this is an? (.+?) tender in /i);

  return { url, tenderId, title, description, closingMatch, tenderTypeMatch };
}

async function main() {
  const rows = await all(`
    SELECT sd.id, sd.raw_html, sd.metadata_json
    FROM scraped_documents sd
    JOIN scraping_jobs sj ON sj.id = sd.scraping_job_id
    JOIN source_urls su ON su.id = sj.source_url_id
    WHERE su.source_id = 13
  `);

  console.log(`Found ${rows.length} TenderBook-origin scraped_documents rows.`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const data = typeof row.metadata_json === 'string'
        ? JSON.parse(row.metadata_json)
        : row.metadata_json;

      let tenderId = data?.tenderId || null;
      let title = data?.title || null;
      let description = data?.description || null;
      let closingDateRaw = data?.closingDate || null;
      let tenderTypeRaw = data?.tenderType || null;

      // Legacy rows predate url/tenderId/closingDate/tenderType extraction —
      // recover them straight from the stored raw_html instead of skipping.
      if (!tenderId || !closingDateRaw || !tenderTypeRaw) {
        const reparsed = reparseFromRawHtml(row.raw_html || '');
        tenderId = tenderId || reparsed.tenderId;
        title = title || reparsed.title;
        description = description || reparsed.description;
        closingDateRaw = closingDateRaw || (reparsed.closingMatch ? reparsed.closingMatch[1] : null);
        tenderTypeRaw = tenderTypeRaw || (reparsed.tenderTypeMatch ? reparsed.tenderTypeMatch[1] : null);
      }

      if (!tenderId) {
        skipped++;
        continue;
      }

      const location = normalizeLocation(data?.location);
      const amount = normalizeAmount(data?.amount);

      await upsertTender({
        tenderId,
        title: normalizeCompanyName(title),
        description: normalizeWhitespace(description),
        category: normalizeWhitespace(data?.category),
        location: location.display,
        amount: amount.display,
        amountValue: amount.value,
        contractDate: normalizeDate(data?.contractDate),
        url: data?.url || null,
        source: SOURCE_NAME,
        companyName: normalizeCompanyName(title),
        tenderType: normalizeWhitespace(tenderTypeRaw),
        closingDate: normalizeDate(closingDateRaw),
        tenderCity: location.city,
        tenderState: location.state,
        // Detail-page-only fields: not present in already-stored card-level
        // metadata_json, so left null here — populated on the next live
        // scrape run once SCRAPE_TENDER_DETAILS visits each tender's page.
        emdAmount: null,
        tenderFee: null,
        buyerDepartment: null,
        publishDate: null,
        openingDate: null,
        pdfUrl: null,
        buyerContactPerson: null,
        buyerContactPhone: null,
        buyerContactEmail: null,
        buyerAddress: null,
        winningCompanyName: null,
        winningBidAmount: null,
        winningBidAmountValue: null,
      });

      updated++;

      if (updated % 200 === 0) console.log(`${updated} updated...`);

    } catch (error) {
      failed++;
      console.log(`Row ${row.id} failed: ${error.message}`);
    }
  }

  console.log(`
================================
Backfill Completed
Total   : ${rows.length}
Updated : ${updated}
Skipped : ${skipped}
Failed  : ${failed}
================================
`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
