import { scrapeAllCategories } from "./scraper/category.js";

export async function runTenderBookAutomation() {

    console.log("");
    console.log("========================================");
    console.log("Starting TenderBook Automation");
    console.log("========================================");

    const start = Date.now();

    try {

        const result = await scrapeAllCategories();

console.log(result);

        const seconds = (
            (Date.now() - start) / 1000
        ).toFixed(2);

        console.log("");
        console.log("========================================");
        console.log("Automation Finished Successfully");
        console.log(`Time : ${seconds} seconds`);
        console.log("========================================");

    } catch (error) {

        console.error(error);
        throw error;

    }

}

runTenderBookAutomation()
    .then(() => {
        console.log("Done");
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });