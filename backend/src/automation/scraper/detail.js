import { rejectLockedValue, normalizePhone, normalizeEmail, normalizeDate, normalizeCompanyName, normalizeAmount } from "./normalize.js";
import { logger } from "../utils/logger.js";

// Visits a single tender's detail page to pick up fields TenderBook doesn't
// expose on the listing card: EMD, tender fee, buyer department, exact
// publish/opening dates, contact details, and PDF/document links.
//
// TenderBook gates most of this behind a per-tender paywall ("View for
// ₹299") or an account sign-in — confirmed by fetching a real detail page
// during this audit, which rendered masked/placeholder copy ("Refer Docs",
// obscured tender numbers) instead of real values for the locked fields.
// This module never guesses: every value is matched against a known label
// on the live page, and anything that looks like the site's own paywall/
// placeholder copy (see normalize.js's rejectLockedValue) is discarded in
// favor of null. Whatever this account's Chrome session is actually
// entitled to see is what ends up in the returned object — nothing more.
//
// Selectors are text-content based (not TenderBook's generated Tailwind
// classes) because those classes are unverified beyond the free card view
// this audit could reach; label text is far more stable across an
// unauthenticated vs. authenticated render of the same page.

const FIELD_LABELS = {

    emdAmount: [/emd\s*amount/i, /earnest money deposit/i, /\bemd\b/i],
    tenderFee: [/tender\s*fee/i, /document\s*fee/i, /cost of (tender|document)/i],
    buyerDepartment: [/department/i, /buyer/i, /organi[sz]ation/i],
    publishDate: [/publish(ed)?\s*date/i, /tender\s*date/i, /date of publish/i],
    openingDate: [/opening\s*date/i, /bid\s*opening/i, /technical opening/i],
    contactPerson: [/contact\s*person/i, /contact\s*name/i],
    contactPhone: [/phone/i, /mobile/i, /contact\s*no/i],
    contactEmail: [/email/i, /e-mail/i],
    address: [/address/i],

};

const DATE_FIELDS = new Set(["publishDate", "openingDate"]);

// Direct "Winning Bidder: X" / "Winning Bid Amount: ₹Y" style labels, for
// accounts whose session renders the Bidders tab unlocked with its own
// explicit fields rather than the generic "Bidder Name: X, Ranking N" line
// seen on the Info panel.
const WINNER_LABELS = {
    winningCompanyName: [/winning\s*bidder/i, /\bl-?1\s*bidder/i, /awarded\s*to/i, /^winner$/i],
    // "amount"/"value" is mandatory here (not "winning bid" alone) and each
    // pattern ends on a word boundary — otherwise "winning bid" as a prefix
    // of "winning bidder" would make the amount label match the *name*
    // label's text too (confirmed by a synthetic-DOM test during this audit).
    winningBidAmount: [/winning\s*bid\s*(amount|value)\b/i, /\bl-?1\s*(amount|value)\b/i, /awarded\s*(value|amount)\b/i],
};

/**
 * Reads the "Bidder Name: <name>, Ranking <n>" line TenderBook's Info panel
 * renders (confirmed on a live tender-results page) and, separately, any
 * explicit "Winning Bidder" / "Winning Bid Amount" style label the Bidders
 * tab may expose to an entitled account. Only ever returns a name/amount
 * tied to rank 1 — a rank-2+ bidder is not the winner and must not be
 * reported as one, even if its text happens to be readable.
 */
async function extractWinnerFields(page, labelPatterns) {

    return page.evaluate((patterns) => {

        function textOf(el) {
            return (el?.innerText || el?.textContent || "").trim();
        }

        // TenderBook wraps each "Label" together with its own ":" separator
        // in one row div (e.g. <div><p>Bidder Details</p><span>:</span></div>
        // <div>value</div>) — confirmed on a live tender-results page. So the
        // label element's OWN nextElementSibling is often just the bare ":"
        // span, not the value; the real value sits one level up, as the
        // wrapper row's next sibling. Walks outward from `el` (self, then
        // parent, then grandparent) and returns the first sibling whose text
        // is neither empty, punctuation-only, nor identical to the label.
        function findValueSibling(el, label) {
            let ancestor = el;
            for (let depth = 0; depth < 3 && ancestor; depth++) {
                const sib = ancestor.nextElementSibling;
                const text = textOf(sib);
                if (text && text !== label && !/^[:\-–—]+$/.test(text)) {
                    return text;
                }
                ancestor = ancestor.parentElement;
            }
            return null;
        }

        const result = { winningCompanyName: null, winningBidAmount: null };

        // 1) Explicit "Winning Bidder" / "Winning Bid Amount" labels, if the
        //    page ever renders them for this account.
        const candidateNodes = Array.from(
            document.querySelectorAll("dt, dl, li, div, span, p, td, th")
        );

        for (const [field, sources] of Object.entries(patterns)) {

            for (const node of candidateNodes) {

                const label = textOf(node);

                if (label.length > 60) continue;

                const isMatch = sources.some(
                    (source) => new RegExp(source, "i").test(label)
                );

                if (!isMatch) continue;

                const inlineMatch = label.match(/:\s*(.+)$/);

                if (inlineMatch && inlineMatch[1].trim()) {
                    result[field] = inlineMatch[1].trim();
                    break;
                }

                const siblingText = findValueSibling(node, label);

                if (siblingText) {
                    result[field] = siblingText;
                    break;
                }

            }

        }

        // 2) "Bidder Name: <name>, Ranking <n>" compound line — only accept
        //    the name (and, if present in the same row, an amount) when the
        //    ranking is explicitly 1.
        if (!result.winningCompanyName) {

            const bidderLineNode = candidateNodes.find(node =>
                /bidder\s*name\s*:/i.test(textOf(node))
            );

            const bidderLine = textOf(bidderLineNode);

            const rankedMatch = bidderLine.match(
                /bidder\s*name\s*:\s*([^,]+?)\s*,\s*ranking\s*#?\s*1\b/i
            );

            if (rankedMatch) {
                result.winningCompanyName = rankedMatch[1].trim();
            }

        }

        // 3) A Bidders-tab table/list, if rendered: rows exposing a rank and
        //    a name (+ optionally an amount) as separate cells rather than
        //    one combined text line.
        if (!result.winningCompanyName) {

            const rows = Array.from(
                document.querySelectorAll("table tr, [class*='bidder'] tr, [class*='bidder'] li")
            );

            for (const row of rows) {

                const rowText = textOf(row);

                const isRankOne = /\b(rank(ing)?\s*#?\s*1|l-?1)\b/i.test(rowText);

                if (!isRankOne) continue;

                const cells = Array.from(row.querySelectorAll("td, span, div"))
                    .map(textOf)
                    .filter(Boolean);

                const nameCell = cells.find(c =>
                    c.length > 2 &&
                    !/\b(rank(ing)?\s*#?\s*1|l-?1)\b/i.test(c) &&
                    !/^₹|^\d/.test(c)
                );

                const amountCell = cells.find(c => /^₹|^\d/.test(c));

                if (nameCell) result.winningCompanyName = nameCell;
                if (amountCell && !result.winningBidAmount) result.winningBidAmount = amountCell;

                break;

            }

        }

        return result;

    }, Object.fromEntries(
        Object.entries(labelPatterns).map(([field, list]) => [
            field,
            list.map(p => p.source),
        ])
    ));

}

/**
 * Reads the page's full visible text and, for each target field, looks for
 * "Label" followed by its value either on the same line (Label: Value) or
 * as the very next sibling text node — the two layouts TenderBook's own
 * free-tier cards already use for Amount/Contract date (see parser.js).
 */
async function extractLabeledFields(page) {

    return page.evaluate((labelPatterns) => {

        function textOf(el) {
            return (el?.innerText || el?.textContent || "").trim();
        }

        const results = {};

        const candidateNodes = Array.from(
            document.querySelectorAll("dt, dl, li, div, span, p, td, th")
        );

        for (const [field, patterns] of Object.entries(labelPatterns)) {

            let found = null;

            for (const node of candidateNodes) {

                const label = textOf(node);

                if (label.length > 60) continue;

                const isMatch = patterns.some(
                    (source) => new RegExp(source, "i").test(label)
                );

                if (!isMatch) continue;

                const inlineMatch = label.match(/:\s*(.+)$/);

                if (inlineMatch && inlineMatch[1].trim()) {
                    found = inlineMatch[1].trim();
                    break;
                }

                const sibling =
                    node.nextElementSibling ||
                    node.parentElement?.nextElementSibling;

                const siblingText = textOf(sibling);

                if (siblingText && siblingText !== label) {
                    found = siblingText;
                    break;
                }

            }

            results[field] = found;

        }

        const pdfLink = document.querySelector(
            'a[href$=".pdf"], a[href*="/download"], a[href*="document"]'
        );

        results.pdfUrl = pdfLink ? pdfLink.href : null;

        return results;

    }, Object.fromEntries(
        Object.entries(FIELD_LABELS).map(([field, patterns]) => [
            field,
            patterns.map(p => p.source),
        ])
    ));

}

/**
 * Navigates to the tender's own detail page and returns only the fields
 * this account's session can actually see. Returns {} (no fields, no
 * error) if the page can't be reached — a detail-page miss should never
 * block saving the base card fields already captured by parseTenderCards.
 */
export async function scrapeTenderDetail(page, tender) {

    if (!tender.url) return {};

    try {

        await page.goto(tender.url, {
            waitUntil: "networkidle",
            timeout: 30000,
        });

        const raw = await extractLabeledFields(page);
        const rawWinner = await extractWinnerFields(page, WINNER_LABELS);

        const detail = {
            emdAmount: rejectLockedValue(raw.emdAmount),
            tenderFee: rejectLockedValue(raw.tenderFee),
            buyerDepartment: rejectLockedValue(raw.buyerDepartment),
            publishDate: null,
            openingDate: null,
            contactPerson: rejectLockedValue(raw.contactPerson),
            contactPhone: normalizePhone(raw.contactPhone),
            contactEmail: normalizeEmail(raw.contactEmail),
            address: rejectLockedValue(raw.address),
            pdfUrl: rejectLockedValue(raw.pdfUrl),
            winningCompanyName: null,
            winningBidAmount: null,
            winningBidAmountValue: null,
        };

        for (const field of DATE_FIELDS) {
            const cleaned = rejectLockedValue(raw[field]);
            detail[field] = cleaned ? normalizeDate(cleaned) : null;
        }

        const winnerName = normalizeCompanyName(rejectLockedValue(rawWinner.winningCompanyName));

        if (winnerName) {
            detail.winningCompanyName = winnerName;
        }

        const winnerAmountRaw = rejectLockedValue(rawWinner.winningBidAmount);

        if (winnerAmountRaw) {
            const parsedAmount = normalizeAmount(winnerAmountRaw);
            detail.winningBidAmount = parsedAmount.display;
            detail.winningBidAmountValue = parsedAmount.value;
        }

        return detail;

    } catch (error) {

        logger.warn(`Detail page fetch failed for ${tender.tenderId}: ${error.message}`);

        return {};

    }

}
