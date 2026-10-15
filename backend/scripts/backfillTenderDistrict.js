// ONE-TIME, OPTIONAL backfill — NOT run automatically by any migration or
// job, and does NOT touch the scraper/enrichment pipeline (no import of
// src/automation/**, src/jobs/documentProcessor.js, or
// src/jobs/tenderbookEnrichWinners.js).
//
// Populates tenders.tender_district for existing rows where tender_city and
// tender_state are already set but tender_district is still NULL. Never
// overwrites a row that already has a non-null tender_district, and never
// touches tender_state, tender_city, location, category, or any other
// column — only tender_district is written.
//
// Resolution rule (deliberately narrow, to avoid fabricating data): a
// candidate row is only resolved when its tender_city matches — exactly,
// case-insensitively — one of the district names already listed for its
// tender_state in the approved master list
// (frontend/src/data/indiaStatesDistricts.json, built from the official LGD
// districts dataset). This covers the common case where the scraped city IS
// the district headquarters (e.g. city "Chennai" -> district "Chennai").
// No partial/fuzzy matching, no city->district lookup beyond that exact
// match — anything that doesn't match exactly (unrecognized state name,
// city that isn't also a district name in that state, etc.) is left NULL
// rather than guessed.
//
// Run with no flags (default) to review what would be written — no writes
// happen. Add --confirm to actually run the UPDATEs, only after reviewing
// the dry-run output.
//
// Usage:
//   node scripts/backfillTenderDistrict.js              (dry run — review only)
//   node scripts/backfillTenderDistrict.js --confirm     (applies the UPDATEs)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { all, get, run } from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIRM = process.argv.includes('--confirm');

const MASTER_DATA_PATH = path.resolve(__dirname, '../frontend/src/data/indiaStatesDistricts.json');

/** Loads the approved State -> District master list into a case-insensitive lookup: lowercased state -> Map(lowercased district -> canonical district spelling). */
function loadStateDistrictMap() {
  const raw = fs.readFileSync(MASTER_DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  const map = new Map();
  for (const { state, districts } of data) {
    const districtMap = new Map();
    for (const district of districts) {
      districtMap.set(district.trim().toLowerCase(), district);
    }
    map.set(state.trim().toLowerCase(), districtMap);
  }
  return map;
}

/** Returns the canonical district name if tender_city exactly matches (case-insensitively) a district of tender_state in the master list; otherwise null. Never guesses. */
function resolveDistrict(stateDistrictMap, tenderState, tenderCity) {
  const districtMap = stateDistrictMap.get(tenderState.trim().toLowerCase());
  if (!districtMap) return null;
  return districtMap.get(tenderCity.trim().toLowerCase()) ?? null;
}

async function main() {
  const stateDistrictMap = loadStateDistrictMap();

  const totalBefore = await get('SELECT COUNT(*) AS c FROM tenders');
  const alreadyPopulatedBefore = await get('SELECT COUNT(*) AS c FROM tenders WHERE tender_district IS NOT NULL');

  const candidates = await all(`
    SELECT tender_id, tender_city, tender_state
    FROM tenders
    WHERE tender_city IS NOT NULL AND tender_city != ''
      AND tender_state IS NOT NULL AND tender_state != ''
      AND tender_district IS NULL
    ORDER BY tender_id
  `);

  const resolutions = [];
  let unresolvedCount = 0;

  console.log('tender_id | tender_city | tender_state | resolved_district');
  console.log('-'.repeat(70));

  for (const row of candidates) {
    const resolved = resolveDistrict(stateDistrictMap, row.tender_state, row.tender_city);
    if (resolved) {
      resolutions.push({ tenderId: row.tender_id, resolvedDistrict: resolved });
    } else {
      unresolvedCount++;
    }
    console.log(`${row.tender_id} | ${row.tender_city} | ${row.tender_state} | ${resolved ?? '(unresolved)'}`);
  }

  console.log('\n--- Before ---');
  console.log(`Total tenders: ${totalBefore.c}`);
  console.log(`District already populated: ${alreadyPopulatedBefore.c}`);
  console.log(`Candidates (city+state set, district NULL): ${candidates.length}`);
  console.log(`  -> District successfully resolved: ${resolutions.length}`);
  console.log(`  -> District unresolved (stays NULL): ${unresolvedCount}`);

  if (!CONFIRM) {
    console.log('\nDry run only — no rows were updated. Re-run with --confirm to apply.');
    return;
  }

  console.log(`\nApplying ${resolutions.length} update(s)...`);
  let updated = 0;
  for (const { tenderId, resolvedDistrict } of resolutions) {
    // Re-check tender_district IS NULL at write time too, so a row that
    // picked up a value between the dry-run scan and this UPDATE (e.g. a
    // concurrent process) is never overwritten.
    const result = await run(
      'UPDATE tenders SET tender_district = ? WHERE tender_id = ? AND tender_district IS NULL',
      [resolvedDistrict, tenderId]
    );
    updated += result.changes;
  }

  const totalAfter = await get('SELECT COUNT(*) AS c FROM tenders');
  const populatedAfter = await get('SELECT COUNT(*) AS c FROM tenders WHERE tender_district IS NOT NULL');

  console.log('\n--- After ---');
  console.log(`Total tenders: ${totalAfter.c}`);
  console.log(`Rows updated this run: ${updated}`);
  console.log(`District now populated (total): ${populatedAfter.c}`);
  console.log(`District still unresolved/NULL: ${totalAfter.c - populatedAfter.c}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
