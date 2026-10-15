// OPTIONAL — NOT run automatically by any migration or job.
//
// This audit found 21 pairs of scraped_documents rows sharing the same
// tenderId (two concurrent scraping_jobs both passed the pre-insert dedup
// check before either committed — a real race condition, now closed going
// forward by the ER_DUP_ENTRY catch in
// src/automation/database/tenderRepository.js and the indexed
// tender_id_gen column). Those 21 pairs already exist in the live database
// and are not touched by any other script in this project.
//
// Run with --dry-run (default) to review what would be deleted; add
// --confirm to actually delete. Always keeps the earliest row (MIN(id))
// per duplicated tenderId and removes the rest.
//
// Usage:
//   node scripts/dedupeTenders.js              (review only, no writes)
//   node scripts/dedupeTenders.js --confirm     (actually deletes)

import { all, run } from '../src/config/database.js';

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  const groups = await all(`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.tenderId')) AS tender_id, COUNT(*) AS c
    FROM scraped_documents
    WHERE metadata_json IS NOT NULL
    GROUP BY tender_id
    HAVING c > 1 AND tender_id IS NOT NULL AND tender_id != ''
  `);

  if (groups.length === 0) {
    console.log('No duplicate tenderId groups found.');
    return;
  }

  console.log(`Found ${groups.length} duplicate tenderId group(s).`);

  let totalToDelete = 0;

  for (const group of groups) {
    const rows = await all(
      `SELECT id, scraping_job_id, created_at
       FROM scraped_documents
       WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.tenderId')) = ?
       ORDER BY id ASC`,
      [group.tender_id]
    );

    const [keep, ...remove] = rows;
    totalToDelete += remove.length;

    console.log(
      `${group.tender_id}: keeping id=${keep.id} (job ${keep.scraping_job_id}), ` +
      `removing id(s)=${remove.map(r => r.id).join(', ')}`
    );

    if (CONFIRM) {
      for (const row of remove) {
        await run('DELETE FROM scraped_documents WHERE id = ?', [row.id]);
      }
    }
  }

  console.log(
    CONFIRM
      ? `\nDeleted ${totalToDelete} duplicate row(s).`
      : `\nDry run only — ${totalToDelete} row(s) would be deleted. Re-run with --confirm to apply.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
