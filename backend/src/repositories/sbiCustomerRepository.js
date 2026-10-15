import { get } from '../config/database.js';

// Data-access layer for the SBI Customer Check demo dataset
// (sbi_existing_customers — see src/db/migrations/addSbiCustomerSchema.js).
// findByCompanyName() is the ONLY function the rest of this feature calls —
// swapping this seeded table for a real SBI customer-master integration
// later means rewriting this one function's body, nothing above it.

function normalizeForMatch(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function findByCompanyName(companyName) {
  const normalized = normalizeForMatch(companyName);
  if (!normalized) return null;

  const row = await get(
    'SELECT * FROM sbi_existing_customers WHERE LOWER(TRIM(customer_name)) = ?',
    [normalized]
  );

  return row || null;
}
