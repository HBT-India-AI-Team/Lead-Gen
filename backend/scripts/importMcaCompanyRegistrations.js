// Converts real MCA company records already pulled by src/jobs/mcaIngest.js
// / mcaExpand.js (stored raw in scraped_documents.metadata_json for
// source_id = 10) into NEW_COMPANY_REGISTRATION lead_signals rows.
//
// A record only becomes a signal when ALL of these hold — never inferred,
// never relaxed:
//   - CompanyRegistrationdate_date is present and parses as a real date
//   - that date falls within the last REGISTRATION_LOOKBACK_DAYS days
//   - CompanyStatus is exactly "Active"
// Everything else (a blank date, a Strike-Off/Amalgamated/etc. status, a
// registration older than the window) is skipped, not guessed at.
//
// Idempotent: leadSignalRepository.upsertNewCompanyRegistrationSignal()
// dedupes on CIN/LLPIN (stored in raw_data.CIN), so re-running this script
// against the same 300 records only ever updates existing rows, never
// duplicates them.
//
// Usage: node scripts/importMcaCompanyRegistrations.js

import { all } from '../src/config/database.js';
import { SOURCE_ID } from '../src/jobs/mcaIngest.js';
import { upsertNewCompanyRegistrationSignal } from '../src/repositories/leadSignalRepository.js';

const REGISTRATION_LOOKBACK_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isWithinLookbackWindow(dateString, days, now = new Date()) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  const diffDays = (now.getTime() - date.getTime()) / MS_PER_DAY;
  return diffDays >= 0 && diffDays <= days;
}

async function loadMcaRecords() {
  const rows = await all(
    `SELECT sd.id, sd.metadata_json
     FROM scraped_documents sd
     JOIN scraping_jobs sj ON sj.id = sd.scraping_job_id
     JOIN source_urls su ON su.id = sj.source_url_id
     WHERE su.source_id = ?
     ORDER BY sd.id`,
    [SOURCE_ID]
  );

  return rows.map((row) => ({
    documentId: row.id,
    company: typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json,
  }));
}

async function main() {
  const now = new Date();
  const records = await loadMcaRecords();

  const stats = {
    inspected: records.length,
    validDate: 0,
    withinWindow: 0,
    active: 0,
    qualifying: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
  };

  const sampleQualifying = [];

  for (const { documentId, company } of records) {
    const hasValidDate = Boolean(company?.CompanyRegistrationdate_date) && !Number.isNaN(new Date(company.CompanyRegistrationdate_date).getTime());
    if (hasValidDate) stats.validDate++;

    const withinWindow = hasValidDate && isWithinLookbackWindow(company.CompanyRegistrationdate_date, REGISTRATION_LOOKBACK_DAYS, now);
    if (withinWindow) stats.withinWindow++;

    const isActive = company?.CompanyStatus === 'Active';
    if (isActive) stats.active++;

    const qualifies = hasValidDate && withinWindow && isActive && Boolean(company?.CIN) && Boolean(company?.CompanyName);

    if (!qualifies) {
      stats.skipped++;
      continue;
    }

    stats.qualifying++;

    const result = await upsertNewCompanyRegistrationSignal(company);
    if (!result) {
      stats.skipped++;
      continue;
    }

    if (result.created) stats.inserted++;
    else stats.updated++;

    if (sampleQualifying.length < 5) {
      sampleQualifying.push({
        documentId,
        CIN: company.CIN,
        CompanyName: company.CompanyName,
        CompanyRegistrationdate_date: company.CompanyRegistrationdate_date,
        CompanyStatus: company.CompanyStatus,
        CompanyStateCode: company.CompanyStateCode,
        signalId: result.id,
        created: result.created,
      });
    }
  }

  console.log(`MCA records inspected:        ${stats.inspected}`);
  console.log(`  with a valid registration date:  ${stats.validDate}`);
  console.log(`  within the last ${REGISTRATION_LOOKBACK_DAYS} days:     ${stats.withinWindow}`);
  console.log(`  CompanyStatus = "Active":         ${stats.active}`);
  console.log(`Qualifying for a signal:      ${stats.qualifying}`);
  console.log(`  signals inserted:               ${stats.inserted}`);
  console.log(`  signals updated (already existed): ${stats.updated}`);
  console.log(`Skipped (did not qualify):    ${stats.skipped}`);
  console.log('\nSample qualifying records used:');
  console.log(JSON.stringify(sampleQualifying, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });