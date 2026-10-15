// Imports real Probe42 company-report XLS files (uploads/probe42/*.xls)
// into probe42_demo_profiles, replacing the fictitious seed data that used
// to live there. Read-then-upsert, keyed on CIN (the XLS filename itself
// is the company's CIN) — safe to re-run any number of times.
//
// Every extracted field is read by SHEET/LABEL, never by fixed row index,
// since real Probe42 exports don't have identical row layouts across
// companies (see the Prompt 1 inspection: sheet count, year-columns, and
// even which sheets exist at all vary per company). A field with no
// matching label, or a "-"/blank cell, is stored as NULL — never guessed
// or defaulted to a plausible-looking number.
//
// Usage: node scripts/importProbe42Xls.js

import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from '../src/config/database.js';
import { ensureProbe42DemoSchema } from '../src/db/migrations/addProbe42DemoSchema.js';
import { ensureLeadSignalsSchema } from '../src/db/migrations/addLeadSignalsSchema.js';
import {
  upsertGstRegistrationSignal,
  upsertEstablishmentExpansionSignal,
  upsertEmployeeGrowthSignal,
} from '../src/repositories/leadSignalRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROBE42_DIR = path.resolve(__dirname, '../uploads/probe42');

// CINs of the 4 fictitious demo profiles the old addProbe42DemoSchema.js
// used to seed (see git history / Prompt 1 inspection report). Deleted by
// CIN — a specific, known list, not a blanket wipe — so importing real
// companies in a later run never risks deleting a real company imported
// earlier.
const FICTITIOUS_DEMO_CINS = [
  'U27100WB2011PTC160432',
  'U45201MH2012PTC229981',
  'U17110TN2008PLC067812',
  'U63090DL2017PTC318765',
];

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parses Probe42's "13 Dec, 1983" date format into "1983-12-13". Returns null for "-", blank, or anything unrecognized. */
function parseProbe42Date(text) {
  if (!text || text === '-') return null;
  const match = String(text).trim().match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return null;
  const day = String(match[1]).padStart(2, '0');
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${day}`;
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  return xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
}

/** Reads the vertical label/value "About the Company" sheet into a Map (label -> value). */
function readAboutCompany(workbook) {
  const rows = sheetRows(workbook, 'About the Company');
  const map = new Map();
  if (!rows) return map;
  for (const row of rows) {
    const label = String(row[0] ?? '').trim();
    if (label) map.set(label, String(row[1] ?? '').trim());
  }
  return map;
}

function findRowByLabel(rows, label) {
  return rows?.find((row) => String(row[0] ?? '').trim() === label) ?? null;
}

/** Rightmost non-empty, non-"-" cell from column index 2 onward. Standalone Financial Data lists years left-to-right (col 0/1 are the row label), so this is the latest year that actually has a value for this row. */
function latestValue(row) {
  if (!row) return null;
  for (let i = row.length - 1; i >= 2; i--) {
    const raw = String(row[i] ?? '').trim();
    if (raw && raw !== '-') return raw;
  }
  return null;
}

/** Parses a "Rs. Crore" figure (thousands separators, optional leading "-") into raw INR. Returns null if not a real number. */
function croreToInr(text) {
  if (text === null || text === undefined) return null;
  const cleaned = String(text).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 1e7 * 100) / 100;
}

function extractFinancials(workbook) {
  const rows = sheetRows(workbook, 'Standalone Financial Data');
  if (!rows) return { annualRevenue: null, netProfit: null };

  return {
    annualRevenue: croreToInr(latestValue(findRowByLabel(rows, 'Net Revenue'))),
    netProfit: croreToInr(latestValue(findRowByLabel(rows, 'Profit for the Period'))),
  };
}

// Long-term scale (AAA..D, optional +/-) vs short-term scale (A1+, A4, etc,
// always letter+digit) — deliberately distinct patterns so a short-term
// rating can never be picked up here. See Prompt 1 inspection: real
// Credit Ratings sheets mix both scales in the same table.
const LONG_TERM_RATING_PATTERN = /^[A-D]{1,3}[+-]?$/;

/** Picks the latest-dated long-term rating from the Credit Ratings sheet, if the sheet exists at all. Returns null when the sheet is absent (real companies often have none) or has no long-term entry. */
function extractCreditRating(workbook) {
  const rows = sheetRows(workbook, 'Credit Ratings');
  if (!rows || rows.length < 2) return null;

  const header = rows[0].map((h) => String(h).trim().toUpperCase());
  const dateIdx = header.indexOf('DATE');
  const ratingIdx = header.indexOf('RATING');
  if (dateIdx === -1 || ratingIdx === -1) return null;

  let best = null;
  let bestDate = null;
  for (const row of rows.slice(1)) {
    const rating = String(row[ratingIdx] ?? '').trim();
    if (!LONG_TERM_RATING_PATTERN.test(rating)) continue;
    const parsedDate = parseProbe42Date(row[dateIdx]);
    if (!parsedDate) continue;
    if (!bestDate || parsedDate > bestDate) {
      bestDate = parsedDate;
      best = rating;
    }
  }
  return best;
}

/** Counts directors with no Date of Cessation (i.e. currently active). Returns null if the Directors sheet is absent. */
function extractDirectorCount(workbook) {
  const rows = sheetRows(workbook, 'Directors');
  if (!rows || rows.length < 2) return null;

  const header = rows[0].map((h) => String(h).trim().toUpperCase());
  const cessationIdx = header.indexOf('DATE OF CESSATION');
  const dataRows = rows.slice(1).filter((row) => String(row[0] ?? '').trim());
  if (dataRows.length === 0) return null;
  if (cessationIdx === -1) return dataRows.length;

  const active = dataRows.filter((row) => {
    const value = String(row[cessationIdx] ?? '').trim();
    return !value || value === '-';
  });
  return active.length;
}

/** Converts a header row + data rows into an array of plain objects keyed by the sheet's own column headers. Rows that are entirely blank are dropped. */
function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h) => String(h ?? '').trim());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => Object.fromEntries(header.map((key, i) => [key, String(row[i] ?? '').trim()])));
}

/**
 * Reads the "GST" sheet — present for most companies but genuinely absent
 * for some (e.g. P P Enterprises has none at all; sheetRows() already
 * returns null for a missing sheet, which rowsToObjects()/this function
 * both treat as "no registrations", not an error). One real GSTIN can
 * repeat across filing-history rows in the source sheet; only rows that
 * actually have a GSTIN are kept. `DATE OF REGISTRATION` is parsed here
 * (same "31 May, 2023" format as the rest of this file) so the caller gets
 * a ready-to-store ISO date alongside the untouched raw row.
 */
function extractGstRegistrations(workbook) {
  const records = rowsToObjects(sheetRows(workbook, 'GST'));
  return records
    .filter((record) => record.GSTIN)
    .map((record) => ({ raw: record, signalDate: parseProbe42Date(record['DATE OF REGISTRATION']) }));
}

/** Parses a "NO. OF EMPLOYEES" cell into a real integer, or null if blank/non-numeric — never defaulted to 0. */
function parseEmployeeCount(text) {
  if (text === null || text === undefined || String(text).trim() === '') return null;
  const value = Number(String(text).trim());
  return Number.isFinite(value) ? value : null;
}

/**
 * Evidence type A (establishment expansion): reads "EPFO Establishments"
 * and keeps only rows whose real DATE OF SETUP genuinely postdates the
 * company's own real Date of Incorporation (both parsed from the same XLS
 * file — comparing two real dates, never guessing one). Returns [] when
 * the sheet is absent (e.g. P P Enterprises) or the company has no
 * incorporation date to compare against.
 */
function extractEstablishmentExpansionEvidence(workbook, incorporationDate) {
  if (!incorporationDate) return [];
  const rows = rowsToObjects(sheetRows(workbook, 'EPFO Establishments'));

  return rows
    .map((row) => ({
      establishmentId: row['ESTABLISHMENT ID'],
      establishmentName: row['ESTABLISHMENT NAME'] || null,
      city: row.CITY || null,
      setupDate: parseProbe42Date(row['DATE OF SETUP']),
      employeeCount: parseEmployeeCount(row['NO. OF EMPLOYEES']),
      businessActivity: row['PRINCIPAL BUSINESS ACTIVITIES'] || null,
      address: row.ADDRESS || null,
    }))
    .filter((row) => row.establishmentId && row.setupDate && row.setupDate > incorporationDate);
}

/**
 * Evidence type B (employee growth): reads "Annexure - EPFO Establishments"
 * (one row per establishment per wage month) and groups by establishment
 * ID. DATE OF CREDIT (a full "DD Mon, YYYY" date, always present when the
 * row is valid) is used to sort chronologically — WAGE MONTH alone has no
 * day component. Only establishments with 2+ valid, dated observations
 * AND a genuinely higher latest count than earliest count qualify; a flat
 * or declining count, or a single observation, produces no evidence.
 */
function extractEmployeeGrowthEvidence(workbook) {
  const records = rowsToObjects(sheetRows(workbook, 'Annexure - EPFO Establishments'));

  const byEstablishment = new Map();
  for (const record of records) {
    const establishmentId = record['ESTABLISHMENT ID'];
    const employeeCount = parseEmployeeCount(record['NO. OF EMPLOYEES']);
    const creditDate = parseProbe42Date(record['DATE OF CREDIT']);
    if (!establishmentId || employeeCount === null || !creditDate) continue;

    if (!byEstablishment.has(establishmentId)) byEstablishment.set(establishmentId, []);
    byEstablishment.get(establishmentId).push({
      establishmentId,
      establishmentName: record['ESTABLISHMENT NAME'] || null,
      wageMonth: record['WAGE MONTH'] || null,
      employeeCount,
      creditDate,
    });
  }

  const evidence = [];
  for (const observations of byEstablishment.values()) {
    observations.sort((a, b) => a.creditDate.localeCompare(b.creditDate));
    if (observations.length < 2) continue;

    const earliest = observations[0];
    const latest = observations[observations.length - 1];
    if (latest.employeeCount > earliest.employeeCount) {
      evidence.push({ earliest, latest });
    }
  }
  return evidence;
}

function extractCompanyProfile(filePath, cinFromFilename) {
  const workbook = xlsx.readFile(filePath);
  const about = readAboutCompany(workbook);

  const { annualRevenue, netProfit } = extractFinancials(workbook);
  const incorporationDate = parseProbe42Date(about.get('Date of Incorporation'));

  return {
    companyName: about.get('Legal Name') || null,
    cin: about.get('CIN') || cinFromFilename,
    incorporationDate,
    annualRevenue,
    netProfit,
    creditRating: extractCreditRating(workbook),
    // "Active Compliance" is absent entirely for some (newer) companies —
    // Map.get() on a missing key already returns undefined, normalized to
    // null below; never inferred from GST/legal-history/anything else.
    complianceStatus: about.get('Active Compliance') || null,
    directorCount: extractDirectorCount(workbook),
    gstRegistrations: extractGstRegistrations(workbook),
    establishmentExpansions: extractEstablishmentExpansionEvidence(workbook, incorporationDate),
    employeeGrowths: extractEmployeeGrowthEvidence(workbook),
  };
}

async function upsertProfile(profile) {
  await run(
    `INSERT INTO probe42_demo_profiles
       (company_name, cin, incorporation_date, annual_revenue, net_profit, credit_rating, compliance_status, director_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       company_name = VALUES(company_name),
       incorporation_date = VALUES(incorporation_date),
       annual_revenue = VALUES(annual_revenue),
       net_profit = VALUES(net_profit),
       credit_rating = VALUES(credit_rating),
       compliance_status = VALUES(compliance_status),
       director_count = VALUES(director_count)`,
    [
      profile.companyName,
      profile.cin,
      profile.incorporationDate,
      profile.annualRevenue,
      profile.netProfit,
      profile.creditRating,
      profile.complianceStatus,
      profile.directorCount,
    ]
  );
}

async function removeFictitiousDemoRows() {
  for (const cin of FICTITIOUS_DEMO_CINS) {
    await run('DELETE FROM probe42_demo_profiles WHERE cin = ?', [cin]);
  }
}

async function main() {
  await ensureProbe42DemoSchema();
  await ensureLeadSignalsSchema();
  await removeFictitiousDemoRows();

  const files = fs.readdirSync(PROBE42_DIR).filter((f) => f.toLowerCase().endsWith('.xls'));
  console.log(`Found ${files.length} Probe42 XLS file(s) in ${PROBE42_DIR}\n`);

  let imported = 0;
  let skipped = 0;
  const gstStats = { found: 0, inserted: 0, updated: 0, skipped: 0 };
  const expansionStats = {
    establishmentFound: 0, establishmentInserted: 0, establishmentUpdated: 0, establishmentSkipped: 0,
    growthFound: 0, growthInserted: 0, growthUpdated: 0, growthSkipped: 0,
  };

  for (const file of files) {
    const cinFromFilename = path.basename(file, path.extname(file));

    try {
      const profile = extractCompanyProfile(path.join(PROBE42_DIR, file), cinFromFilename);

      if (!profile.companyName || !profile.cin) {
        console.error(`SKIPPED ${file}: could not extract a company name/CIN.`);
        skipped++;
        continue;
      }

      await upsertProfile(profile);
      imported++;

      console.log(`Imported: ${profile.companyName} (${profile.cin})`);
      console.log(
        `  incorporation=${profile.incorporationDate ?? 'NULL'} revenue=${profile.annualRevenue ?? 'NULL'} ` +
        `netProfit=${profile.netProfit ?? 'NULL'} rating=${profile.creditRating ?? 'NULL'} ` +
        `compliance=${profile.complianceStatus ?? 'NULL'} directors=${profile.directorCount ?? 'NULL'}`
      );

      gstStats.found += profile.gstRegistrations.length;
      if (profile.gstRegistrations.length === 0) {
        console.log('  GST registrations: none (no GST sheet in this file)\n');
      } else {
        for (const { raw, signalDate } of profile.gstRegistrations) {
          const result = await upsertGstRegistrationSignal(raw, profile.companyName, profile.cin, signalDate);
          if (!result) {
            gstStats.skipped++;
            continue;
          }
          if (result.created) gstStats.inserted++;
          else gstStats.updated++;
        }
        console.log(`  GST registrations: ${profile.gstRegistrations.length} found in sheet`);
      }

      expansionStats.establishmentFound += profile.establishmentExpansions.length;
      for (const est of profile.establishmentExpansions) {
        const result = await upsertEstablishmentExpansionSignal({
          cin: profile.cin,
          companyName: profile.companyName,
          establishmentId: est.establishmentId,
          establishmentName: est.establishmentName,
          city: est.city,
          setupDate: est.setupDate,
          employeeCount: est.employeeCount,
          businessActivity: est.businessActivity,
          address: est.address,
        });
        if (!result) expansionStats.establishmentSkipped++;
        else if (result.created) expansionStats.establishmentInserted++;
        else expansionStats.establishmentUpdated++;
      }

      expansionStats.growthFound += profile.employeeGrowths.length;
      for (const { earliest, latest } of profile.employeeGrowths) {
        const result = await upsertEmployeeGrowthSignal({
          cin: profile.cin,
          companyName: profile.companyName,
          establishmentId: latest.establishmentId,
          establishmentName: latest.establishmentName,
          city: null,
          earliestMonth: earliest.wageMonth,
          earliestCount: earliest.employeeCount,
          earliestDate: earliest.creditDate,
          latestMonth: latest.wageMonth,
          latestCount: latest.employeeCount,
          latestDate: latest.creditDate,
        });
        if (!result) expansionStats.growthSkipped++;
        else if (result.created) expansionStats.growthInserted++;
        else expansionStats.growthUpdated++;
      }

      console.log(
        `  Establishment expansion evidence: ${profile.establishmentExpansions.length} found | ` +
        `Employee growth evidence: ${profile.employeeGrowths.length} found\n`
      );
    } catch (error) {
      console.error(`FAILED ${file}: ${error.message}`);
      skipped++;
    }
  }

  console.log(`Done. Probe42 profiles imported ${imported}, skipped ${skipped}, out of ${files.length} file(s).`);
  console.log(
    `GST_REGISTRATION signals — found: ${gstStats.found}, inserted: ${gstStats.inserted}, ` +
    `updated: ${gstStats.updated}, skipped: ${gstStats.skipped}.`
  );
  console.log(
    `COMPANY_EXPANSION (establishment) — found: ${expansionStats.establishmentFound}, inserted: ${expansionStats.establishmentInserted}, ` +
    `updated: ${expansionStats.establishmentUpdated}, skipped: ${expansionStats.establishmentSkipped}.`
  );
  console.log(
    `COMPANY_EXPANSION (employee growth) — found: ${expansionStats.growthFound}, inserted: ${expansionStats.growthInserted}, ` +
    `updated: ${expansionStats.growthUpdated}, skipped: ${expansionStats.growthSkipped}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });