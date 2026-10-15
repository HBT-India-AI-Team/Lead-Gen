import {
    normalizeWhitespace,
    normalizeCompanyName,
    normalizeAmount,
    normalizeDate,
    normalizeLocation,
} from "./normalize.js";
import { resolveDistrict } from "../../utils/districtResolver.js";

export async function parseTenderCards(page) {

    const rawCards = await page.$$eval(
        '[data-slot="card"]',
        (cards) => {

            return cards.map(card => {

                const link = card.querySelector('a[href*="/tender-results/"]');

                const title =
                    card.querySelector("h3")?.innerText.trim() || "";

                const description =
                    card.querySelector("p[title]")?.getAttribute("title") || "";

                const tags = card.querySelectorAll(
                    "div.border-cyan-400, div.border-teal-500"
                );

                const location =
                    tags[0]?.innerText.trim() || "";

                const category =
                    tags[1]?.innerText.trim() || "";

                let amount = "";
                let contractDate = "";

                card.querySelectorAll("span").forEach(span => {

                    if (span.innerText.trim() === "Amount") {
                        amount = span.nextElementSibling?.innerText.trim() || "";
                    }

                    if (span.innerText.trim() === "Contract date") {
                        contractDate = span.nextElementSibling?.innerText.trim() || "";
                    }

                });

                // The description sentence embeds two fields the visible tags
                // don't expose: the exact submission deadline and a more
                // specific tender type than the page's broad category bucket
                // (e.g. category tag "Vehicles And Accessories" vs description
                // "This is a Railway Ancillaries tender in..."). Extracted here
                // (in-page) since regex needs the raw description string.
                const closingDateMatch = description.match(
                    /last date of submission for this tender is\s*([\d]{4}-[\d]{2}-[\d]{2})/i
                );

                const tenderTypeMatch = description.match(
                    /this is an? (.+?) tender in /i
                );

                const url = link
                    ? "https://www.tenderbook.in" + link.getAttribute("href")
                    : "";

                const tenderId = url ? url.split("/").filter(Boolean).pop() : "";

                return {

    tenderId: tenderId || null,
    title,
    description,
    location,
    category,
    amount,
    contractDate,
    closingDate: closingDateMatch ? closingDateMatch[1] : "",
    tenderType: tenderTypeMatch ? tenderTypeMatch[1] : "",
    url: url || null,
    rawHtml: card.outerHTML

};

            });

        }
    );

    return rawCards.map(card => {

        const location = normalizeLocation(card.location);

        const amount = normalizeAmount(card.amount);

        return {
            ...card,
            title: normalizeCompanyName(card.title),
            description: normalizeWhitespace(card.description),
            category: normalizeWhitespace(card.category),
            tenderType: normalizeWhitespace(card.tenderType),
            location: location.display,
            city: location.city,
            state: location.state,
            district: resolveDistrict({ city: location.city, state: location.state }),
            amount: amount.display,
            amountValue: amount.value,
            contractDate: normalizeDate(card.contractDate),
            closingDate: normalizeDate(card.closingDate),
        };

    });

}