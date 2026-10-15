import { BACKEND_URL } from '../constants/dashboard';

// Client for /api/users/* (src/routes/users.js) — GET/PUT profile and
// PUT change-password.

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * PUT /api/users/profile. `email` is intentionally never sent — userService
 * updateProfile() on the backend throws ApiError.badRequest("Email cannot
 * be changed.") if the value differs at all, so this client doesn't offer a
 * way to trigger that failure in the first place.
 */
export async function updateProfile({ firstName, lastName, phone }) {
  const response = await fetch(`${BACKEND_URL}/api/users/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ first_name: firstName, last_name: lastName, phone: phone || null }),
  });
  return parseJson(response);
}

/** PUT /api/users/change-password */
export async function changePassword({ currentPassword, newPassword }) {
  const response = await fetch(`${BACKEND_URL}/api/users/change-password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return parseJson(response);
}
