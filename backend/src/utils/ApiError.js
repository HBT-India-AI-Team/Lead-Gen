/**
 * Lightweight HTTP-aware error. `name` doubles as the `error` field and
 * `status` as the HTTP status code in server.js's existing global error
 * handler (`res.status(err.status || 500).json({ error: err.name, message: err.message })`),
 * so throwing an ApiError from a service/controller produces the same
 * response shape already used across the rest of this API.
 */
export class ApiError extends Error {
  constructor(status, name, message) {
    super(message);
    this.status = status;
    this.name = name;
  }

  static badRequest(message) {
    return new ApiError(400, 'Bad Request', message);
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(401, 'Unauthorized', message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, 'Forbidden', message);
  }

  static notFound(message) {
    return new ApiError(404, 'Not Found', message);
  }

  static conflict(message) {
    return new ApiError(409, 'Conflict', message);
  }
}

/**
 * True if `error` is a MySQL UNIQUE-constraint violation (race-condition
 * safety net alongside the app-level pre-insert duplicate checks — two
 * concurrent requests can both pass the pre-check before either commits).
 */
export function isDuplicateEntryError(error) {
  return error?.code === 'ER_DUP_ENTRY';
}
