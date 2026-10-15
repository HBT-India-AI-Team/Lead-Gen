// Converts real, already-normalized `tenders` rows into
// GOVERNMENT_TENDER_WIN lead_signals.
//
// GOVERNMENT_TENDER_BID is deliberately NOT implemented here. Inspection
// of src/automation/scraper/detail.js (extractWinnerFields()) confirmed
// the scraper only ever captures the rank-1 (winning) bidder — any
// non-winning bidder is explicitly discarded even when visible on the
// page ("a rank-2+ bidder is not the winner and must not be reported as
// one"). `tenders` has no bidder-list/participant column, and
// scraped_documents holds no such data either. There is therefore no real
// evidence in this dataset of which companies merely bid without winning
// — creating a BID signal would mean guessing, which the task rules
// (REAL DATA ONLY) forbid. If a future source ever supplies a real
// bidder/participant list, a GOVERNMENT_TENDER_BID writer belongs next to
// upsertGovernmentTenderWinSignal() in leadSignalRepository.js, not here.
//
// GOVERNMENT_TENDER_WIN evidence: `tenders.winning_company_name`, written
// only when the scraper's detail-page rank-1 extraction actually resolved
// a winner (see src/repositories/leadSignalRepository.js's
// upsertGovernmentTenderWinSignal() doc for the full chain).
//
// Idempotent: dedupes on tender_id (raw_data.tenderId), same JSON-lookup
// pattern as the existing TENDER signal — re-running only ever updates
// existing rows, never duplicates them.
//
// Usage: node scripts/importTenderSignals.js

import { all } from '../src/config/database.js';
import { upsertGovernmentTenderWinSignal } from '../src/repositories/leadSignalRepository.js';

async function loadWonTenders() {
  return all(
    `SELECT tender_id, title, description, category, location, amount, amount_value,
            contract_date, url, source, tender_type, buyer_department,
            winning_company_name, winning_bid_amount, winning_bid_amount_value
     FROM tenders
     WHERE winning_company_name IS NOT NULL AND winning_company_name != ''
     ORDER BY tender_id`
  );
}

function toCamelTender(row) {
  return {
    tenderId: row.tender_id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    amount: row.amount,
    amountValue: row.amount_value,
    contractDate: row.contract_date,
    url: row.url,
    source: row.source,
    buyerDepartment: row.buyer_department,
    winningCompanyName: row.winning_company_name,
    winningBidAmount: row.winning_bid_amount,
    winningBidAmountValue: row.winning_bid_amount_value,
  };
}

async function main() {
  const rows = await loadWonTenders();
  console.log(`Real tenders with a genuine winning_company_name: ${rows.length}\n`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const sample = [];

  for (const row of rows) {
    const tender = toCamelTender(row);
    const result = await upsertGovernmentTenderWinSignal(tender);

    if (!result) {
      skipped++;
      continue;
    }

    if (result.created) inserted++;
    else updated++;

    if (sample.length < 5) {
      sample.push({
        tenderId: tender.tenderId,
        winningCompanyName: tender.winningCompanyName,
        winningBidAmount: tender.winningBidAmount,
        winningBidAmountValue: tender.winningBidAmountValue,
        contractDate: tender.contractDate,
        signalId: result.id,
        created: result.created,
      });
    }
  }

  console.log(`GOVERNMENT_TENDER_WIN signals — inserted: ${inserted}, updated: ${updated}, skipped: ${skipped}.`);
  console.log('\nSample records used:');
  console.log(JSON.stringify(sample, null, 2));

  console.log(
    '\nGOVERNMENT_TENDER_BID: not implemented — no bidder/participant data exists in the ' +
    'source (see this file\'s header comment). 0 signals created for this type.'
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });