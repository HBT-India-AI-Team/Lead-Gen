const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Min 8 chars, at least one letter and one number (matches the seeded
// default admin password "Admin@123").
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

export function isStrongPassword(password) {
  return typeof password === 'string' && PASSWORD_REGEX.test(password);
}

/** Returns the list of field names missing (undefined/null/empty-string) from `body`. */
export function findMissingFields(body, requiredFields) {
  return requiredFields.filter((field) => {
    const value = body?.[field];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  });
}

/** Validates an absolute http(s) URL (used for company websites and source URLs). */
export function isValidUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** True if `value` is a positive integer (as a number or a numeric string) — used to validate :id route params. */
export function isValidId(value) {
  if (value === undefined || value === null || value === '') return false;
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}
