import { chromium } from "playwright";

const browser = await chromium.connectOverCDP(
    "http://localhost:9222"
);

console.log("Connected");

console.log(
    "Contexts:",
    browser.contexts().length
);

for (const context of browser.contexts()) {

    console.log(
        "Pages:",
        context.pages().length
    );

    for (const page of context.pages()) {

        console.log(
            "URL:",
            page.url()
        );

    }
}

await browser.close();