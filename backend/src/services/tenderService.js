import * as tenderRepository from '../repositories/tenderRepository.js';
import { ApiError } from '../utils/ApiError.js';

/** Thin pagination/filter-shaping wrapper around tenderRepository.listTenders(), mirroring sourceService.listSources()'s response shape. */
export async function listTenders(query = {}) {
  return tenderRepository.listTenders(query);
}

/**
 * Looks up a tender by its natural key (tender_id, e.g. "TRBPxjC-175970"),
 * not the numeric `id` PK — every URL/link in this app is built off
 * tender_id. Throws ApiError.notFound rather than returning undefined, so
 * every caller (controller, sbiCustomerCheckService, healthCheckService,
 * tenderProposalService) gets the same 404 behavior for free instead of
 * each having to null-check.
 */
export async function getTenderById(tenderId) {
  if (!tenderId || !String(tenderId).trim()) {
    throw ApiError.badRequest('A tender ID is required.');
  }

  const tender = await tenderRepository.getTenderById(tenderId);

  if (!tender) {
    throw ApiError.notFound(`Tender "${tenderId}" not found.`);
  }

  return tender;
}

/** Distinct real category values from `tenders`, for populating a filter dropdown honestly instead of a hardcoded/guessed list. */
export async function listCategories() {
  return tenderRepository.listCategories();
}

/** Lead Category values actually backed by real `lead_signals` evidence — see tenderRepository.listLeadCategories(). */
export async function listLeadCategories() {
  return tenderRepository.listLeadCategories();
}

/** Distinct real tender_state values from `tenders`, for the State filter dropdown. */
export async function listStates() {
  return tenderRepository.listStates();
}

/** Distinct real district values from `tenders`, optionally narrowed to one state — for the State-dependent District filter dropdown. */
export async function listDistricts(state) {
  return tenderRepository.listDistricts(state);
}
