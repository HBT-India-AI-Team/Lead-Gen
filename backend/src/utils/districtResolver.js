import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Backend-owned copy of frontend/src/data/indiaStatesDistricts.json (same
// Government of India LGD-sourced content, duplicated rather than imported
// across the frontend/backend boundary so this module has no dependency on
// the frontend app being present at runtime). Keep both files in sync if the
// source data is ever updated.
const STATE_DISTRICTS = JSON.parse(
    readFileSync(path.join(__dirname, "../data/indiaStatesDistricts.json"), "utf8")
);

function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
}

// Keyed by normalized state name -> that state's real district list, built
// once at module load instead of scanning the array on every call.
const DISTRICTS_BY_STATE = new Map(
    STATE_DISTRICTS.map((entry) => [normalize(entry.state), entry.districts])
);

/**
 * Resolves a district for a scraped { city, state } pair, validated against
 * the real State -> District master data — never a guess from free text.
 *
 * The only resolution rule is exact (case-insensitive) equality between the
 * city name and one of the real district names listed for that state. This
 * is deliberately conservative: TenderBook's card only ever exposes a
 * combined "City, State" tag with no separate district field, and a large
 * share of Indian districts are named after their headquarters city (e.g.
 * "Pune, Maharashtra" -> district "Pune", "Tirupati, Andhra Pradesh" ->
 * district "Tirupati") — so this rule resolves those cases correctly with
 * zero fabrication risk. Anything that doesn't match a real district name
 * exactly (an unrecognized state, a locality/area name distinct from its
 * district, a multi-segment address fragment, etc.) returns null rather
 * than guessing, and is logged so gaps in coverage are visible.
 *
 * Returns the canonically-cased district string from the master data (not
 * the caller's casing) on a match, otherwise null.
 */
export function resolveDistrict({ city, state } = {}) {
    const normalizedCity = normalize(city);
    const normalizedState = normalize(state);

    if (!normalizedCity || !normalizedState) {
        logUnresolved(city, state);
        return null;
    }

    const districts = DISTRICTS_BY_STATE.get(normalizedState);

    if (!districts) {
        logUnresolved(city, state);
        return null;
    }

    const match = districts.find((district) => normalize(district) === normalizedCity);

    if (!match) {
        logUnresolved(city, state);
        return null;
    }

    return match;
}

function logUnresolved(city, state) {
    console.log(`[DISTRICT] Could not resolve:\ncity=${city ?? ""}\nstate=${state ?? ""}`);
}
