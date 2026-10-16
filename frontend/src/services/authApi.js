import { BACKEND_URL } from '../constants/dashboard';

// Centralized home for every /api/auth/* call and for JWT token storage.
// sourceRegistryApi.js re-exports getToken/setToken/login/logout from
// here (rather than defining its own copies) so there is exactly one
// place that knows how a session is stored and refreshed. Same
// localStorage key SourceRegistry.jsx already uses, so an existing
// session keeps working unchanged.

const TOKEN_KEY = 'source_registry_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** POST /api/auth/login — on success, persists the returned token. */
export async function login(email, password) {
  const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJson(response);
  setToken(data.token);
  return data;
}

/** GET /api/auth/me — resolves the current session's user/role, used to hydrate auth state on load. Throws if there is no token or it's invalid/expired. */
export async function fetchCurrentUser() {
  const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  return parseJson(response);
}

/**
 * Clears the local token and notifies the backend (stateless JWT — the
 * server has nothing to invalidate, but the request still confirms the
 * token was accepted). Never rejects: an already-expired/missing token
 * should still let the user end up logged out client-side.
 */
export async function logout() {
  const token = getToken();
  setToken(null);
  if (!token) return { message: 'Logout successful.' };

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    return await parseJson(response);
  } catch {
    return { message: 'Logout successful.' };
  }
}
