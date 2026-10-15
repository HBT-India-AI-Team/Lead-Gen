import { runTenderBookAutomation } from "../automation/index.js";

async function main() {

    try {

        await runTenderBookAutomation();

        process.exit(0);

    } catch (error) {

        console.error(error);

        process.exit(1);

    }

}

main();