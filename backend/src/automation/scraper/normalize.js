// Field normalization for TenderBook data. Pure string/number transforms —
// no page/browser access — so both the card parser (parser.js) and the
// detail-page parser (detail.js) can share the same rules and every value
// that reaches saveTender() has already gone through the same cleanup.

const LOCKED_VALUE_PATTERNS = [
    /view for\s*₹/i,
    /sign\s*in/i,
    /log\s*in/i,
    /subscribe/i,
    /unlock/i,
    /refer docs/i,
    /^n\/a$/i,
    /^-+$/,
    /^x{2,}/i,
    // TenderBook renders a decorative teaser ("Bidder Name: Mr. Jhon Doe,
    // Ranking 2") over the real Bidders tab for accounts without access —
    // confirmed on a live tender-results page. Must never be stored as a
    // real winning bidder.
    /jh?on\s*doe/i,
    /jane\s*doe/i,
];

/**
 * Filters out TenderBook's own paywall/placeholder copy ("Refer Docs",
 * "View for ₹299", "Sign in to view", masked "XXX..." strings, etc.) so it
 * never gets stored as if it were a real value. Returns null instead of the
 * placeholder text.
 */
export function normalizeWhitespace(value) {

    if (value === null || value === undefined) return null;

    const cleaned = String(value)
        .replace(/\s+/g, " ")
        .trim();

    return cleaned.length > 0 ? cleaned : null;

}

export function rejectLockedValue(value) {

    const cleaned = normalizeWhitespace(value);

    if (!cleaned) return null;

    const isLocked = LOCKED_VALUE_PATTERNS.some(pattern => pattern.test(cleaned));

    return isLocked ? null : cleaned;

}

/**
 * Company/organization names on TenderBook are rendered in Title Case with
 * inconsistent spacing ("South  Central Railway"). Collapses whitespace and
 * fixes common ALL-CAPS scrapes without touching genuine acronyms (kept as
 * a light-touch trim rather than a full title-case rewrite, since names like
 * "NTPC", "IIT Madras" would be mangled by naive title-casing).
 */
export function normalizeCompanyName(value) {

    const cleaned = normalizeWhitespace(value);

    if (!cleaned) return null;

    return cleaned.replace(/\s*,\s*/g, ", ");

}

const AMOUNT_MULTIPLIERS = {
    crore: 1e7,
    cr: 1e7,
    lac: 1e5,
    lakh: 1e5,
    lakhs: 1e5,
    thousand: 1e3,
    k: 1e3,
};

/**
 * Parses TenderBook's Indian-currency shorthand ("₹21.15 Lac", "₹1.2 Cr")
 * into a plain numeric rupee value for amount_value, keeping the original
 * display string as-is. Returns { display, value, currency } — value is
 * null when the amount is missing/unparseable rather than 0, so a genuine
 * zero-rupee tender is never confused with "not scraped".
 */
export function normalizeAmount(value) {

    const cleaned = normalizeWhitespace(value);

    if (!cleaned) return { display: null, value: null, currency: "INR" };

    const match = cleaned
        .replace(/,/g, "")
        .match(/([\d.]+)\s*(crore|cr|lac|lakhs|lakh|thousand|k)?/i);

    if (!match) return { display: cleaned, value: null, currency: "INR" };

    const numeric = parseFloat(match[1]);

    if (Number.isNaN(numeric)) return { display: cleaned, value: null, currency: "INR" };

    const unit = match[2] ? match[2].toLowerCase() : null;

    const multiplier = unit ? (AMOUNT_MULTIPLIERS[unit] || 1) : 1;

    return {
        display: cleaned,
        value: Number((numeric * multiplier).toFixed(2)),
        currency: "INR",
    };

}

/**
 * Normalizes both TenderBook date formats (card dates are DD/MM/YYYY,
 * description dates are already YYYY-MM-DD) to ISO YYYY-MM-DD so
 * contract_date/closing_date/publish_date/opening_date are comparable and
 * sortable as text. Returns null for anything that isn't a real calendar
 * date instead of storing a malformed string.
 */
export function normalizeDate(value) {

    const cleaned = normalizeWhitespace(value);

    if (!cleaned) return null;

    let year, month, day;

    const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (isoMatch) {
        [, year, month, day] = isoMatch;
    } else if (slashMatch) {
        [, day, month, year] = slashMatch;
    } else {
        return null;
    }

    const date = new Date(Number(year), Number(month) - 1, Number(day));

    const isValid =
        date.getFullYear() === Number(year) &&
        date.getMonth() === Number(month) - 1 &&
        date.getDate() === Number(day);

    if (!isValid) return null;

    return [
        year,
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
    ].join("-");

}

/**
 * Splits TenderBook's combined "City, State" location tag into separate
 * fields. Takes the last comma-separated segment as the state (TenderBook
 * always puts state last) and everything before it as the city, so
 * multi-comma addresses like "Zone Xii Greater Chennai Corporation, Tamil
 * Nadu" still split correctly instead of only handling the two-segment case.
 */
export function normalizeLocation(value) {

    const cleaned = normalizeWhitespace(value);

    if (!cleaned) return { display: null, city: null, state: null };

    const parts = cleaned.split(",").map(part => part.trim()).filter(Boolean);

    if (parts.length === 0) return { display: cleaned, city: null, state: null };

    if (parts.length === 1) return { display: cleaned, city: null, state: parts[0] };

    const state = parts[parts.length - 1];
    const city = parts.slice(0, -1).join(", ");

    return { display: cleaned, city, state };

}

/**
 * Normalizes Indian phone numbers to a bare 10-digit form (dropping +91/0
 * prefixes, spaces, and dashes). Returns null for anything that doesn't
 * resolve to a plausible 10-digit mobile/landline number rather than
 * storing punctuation-only or truncated junk.
 */
export function normalizePhone(value) {

    const cleaned = normalizeWhitespace(value);

    if (!cleaned) return null;

    let digits = cleaned.replace(/[^\d]/g, "");

    if (digits.length === 12 && digits.startsWith("91")) {
        digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith("0")) {
        digits = digits.slice(1);
    }

    return /^[6-9]\d{9}$/.test(digits) ? digits : null;

}

/**
 * Lowercases and trims an email address, returning null if it doesn't match
 * a basic email shape — TenderBook's locked-content placeholder text
 * ("Sign in to view email") should never pass this check.
 */
export function normalizeEmail(value) {

    const cleaned = rejectLockedValue(value);

    if (!cleaned) return null;

    const lower = cleaned.toLowerCase();

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : null;

}
