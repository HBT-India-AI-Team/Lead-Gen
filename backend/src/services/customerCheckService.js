import * as customerCheckRepository from '../repositories/customerCheckRepository.js';

/**
 * Checks whether `companyName` matches an existing customer. Contains
 * no business logic beyond null-handling — customerCheckRepository is the only
 * thing that needs replacing when a real customer-master source replaces
 * the seeded demo table.
 */
export async function checkExistingCustomer(companyName) {
  const matchedCustomer = await customerCheckRepository.findByCompanyName(companyName);

  return {
    isExistingCustomer: Boolean(matchedCustomer),
    matchedCustomer,
  };
}
