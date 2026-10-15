import { progress } from "./progress.js";
import { printReport } from "./report.js";
import { scrapeAllCategories } from "../scraper/category.js";

export async function startAgent() {

    progress.start();

    await scrapeAllCategories();

    progress.finish();

    printReport();

}