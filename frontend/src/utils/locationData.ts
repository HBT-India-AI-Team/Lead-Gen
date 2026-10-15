import indiaStatesDistricts from '../data/indiaStatesDistricts.json';

// Master list of Indian States/UTs and their districts, for populating the
// State/District dropdowns only. Sourced from the Government of India Local
// Government Directory (LGD) districts dataset (data.gov.in / lgdirectory.gov.in).
// NOT the source of truth for tender records — `tenders.tender_state` /
// `tenders.tender_district` hold whatever a source actually reports, which
// may not match an entry here.

export interface StateDistricts {
  state: string;
  districts: string[];
}

const DATA = indiaStatesDistricts as StateDistricts[];

/** All State/UT names, alphabetically (as already ordered in the source file). */
export function getStates(): string[] {
  return DATA.map((entry) => entry.state);
}

/** Districts belonging to `state`, alphabetically. Returns [] for an unrecognized or empty state name. */
export function getDistrictsByState(state: string): string[] {
  if (!state) return [];
  const entry = DATA.find((item) => item.state === state);
  return entry ? entry.districts : [];
}
