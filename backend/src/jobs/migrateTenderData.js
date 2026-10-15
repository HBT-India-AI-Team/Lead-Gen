import { all, run } from "../db/mysql.js";

async function migrate() {

    console.log("Starting migration");

    const documents = await all(`
        SELECT 
            id,
            metadata_json
        FROM scraped_documents
        WHERE metadata_json IS NOT NULL
    `);


    console.log(`Found ${documents.length} records`);


    let inserted = 0;
    let skipped = 0;
    let failed = 0;


    for (const doc of documents) {

        try {

            let data;


            // MySQL JSON column already returns object
            if (typeof doc.metadata_json === "object") {
                data = doc.metadata_json;
            } 
            else {
                data = JSON.parse(doc.metadata_json);
            }


            if (!data.tenderId) {
                console.log("Skipping - no tenderId");
                skipped++;
                continue;
            }


            await run(
                `
                INSERT INTO tenders
                (
                    tender_id,
                    title,
                    description,
                    category,
                    location,
                    amount,
                    contract_date,
                    url,
                    source
                )
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)

                ON DUPLICATE KEY UPDATE

                    title = VALUES(title),
                    description = VALUES(description),
                    category = VALUES(category),
                    location = VALUES(location),
                    amount = VALUES(amount),
                    contract_date = VALUES(contract_date),
                    url = VALUES(url)

                `,
                [
                    data.tenderId || null,
                    data.title || null,
                    data.description || null,
                    data.category || null,
                    data.location || null,
                    data.amount || null,
                    data.contractDate || null,
                    data.url || null,
                    "TenderBook"
                ]
            );


            inserted++;


            if(inserted % 50 === 0){
                console.log(`${inserted} migrated`);
            }


        }
        catch(error){

            console.log(
                "Migration failed:",
                error.message
            );

            failed++;

        }

    }


    console.log(`
================================
Migration Completed

Total : ${documents.length}
Inserted/Updated : ${inserted}
Skipped : ${skipped}
Failed : ${failed}

================================
`);

}


migrate()
.then(()=>process.exit(0))
.catch(err=>{
    console.error(err);
    process.exit(1);
});