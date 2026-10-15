import * as sbiCustomerRepository from '../repositories/sbiCustomerRepository.js';

/**
 * Checks whether `companyName` matches an existing SBI customer. Contains
 * no business logic beyond null-handling — sbiCustomerRepository is the only
 * thing that needs replacing when a real customer-master source replaces
 * the seeded demo table.
 */
export async function checkSbiCustomer(companyName) {
  const matchedCustomer = await sbiCustomerRepository.findByCompanyName(companyName);

  return {
    isExistingCustomer: Boolean(matchedCustomer),
    matchedCustomer,
  };
}
