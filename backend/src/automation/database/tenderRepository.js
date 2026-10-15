import { run, get } from "../../config/database.js";

// MySQL error code for a UNIQUE index violation (mysql2 sets this on the
// thrown error). Used to catch the race window between tenderExists()'s
// SELECT and this module's INSERT — two concurrent scrape runs can both
// pass the SELECT check before either commits its INSERT. A real duplicate
// pair caused exactly this in production data (two scraping_jobs, same
// tenderId, same-second timestamps) before scraped_documents.tender_id_gen
// had a unique index to catch it — see migrations/addTenderBookEnrichmentSchema.js.
const ER_DUP_ENTRY = "ER_DUP_ENTRY";

export async function tenderExists(tenderId) {

    if (!tenderId) return false;

    // tender_id_gen is a generated column indexed by
    // addScrapedDocumentsTenderIdIndex() (src/db/migrations/addDocumentProcessingSchema.js)
    // — querying it directly guarantees the index is used, rather than
    // relying on the optimizer matching a JSON_EXTRACT expression to it.
    const row = await get(
        `
        SELECT id
        FROM scraped_documents
        WHERE tender_id_gen = ?
        LIMIT 1
        `,
        [tenderId]
    );

    return !!row;

}

export async function saveTender(jobId, tender) {

    // tenderId is the only stable identifier TenderBook gives us (derived
    // from the tender's own URL, not its title/description). A card whose
    // link couldn't be parsed has no stable key to dedupe against later, so
    // it's skipped rather than saved under a blank/null key.
    if (!tender.tenderId) {

        return {
            inserted: false,
            duplicate: false,
            skipped: true
        };

    }

    const exists = await tenderExists(tender.tenderId);

    if (exists) {

        return {
            inserted: false,
            duplicate: true
        };

    }

    const cleanedText = `
${tender.title}

${tender.description}

Location : ${tender.location}

Category : ${tender.category}

Tender Type : ${tender.tenderType || ""}

Amount : ${tender.amount}

Contract Date : ${tender.contractDate}

Closing Date : ${tender.closingDate || ""}

URL : ${tender.url}
`;

    try {

        await run(
            `
            INSERT INTO scraped_documents
            (
                scraping_job_id,
                raw_html,
                cleaned_text,
                metadata_json
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?
            )
            `,
            [
                jobId,
                tender.rawHtml,
                cleanedText,
                JSON.stringify(tender)
            ]
        );

    } catch (error) {

        if (error.code === ER_DUP_ENTRY) {

            return {
                inserted: false,
                duplicate: true
            };

        }

        throw error;

    }

    return {
        inserted: true,
        duplicate: false
    };

}