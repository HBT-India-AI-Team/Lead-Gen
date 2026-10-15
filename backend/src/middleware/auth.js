import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Requires a valid `Authorization: Bearer <token>` header. On success,
 * attaches the decoded JWT payload ({ id, email, role, roleId, firstName,
 * lastName }) to `req.user` for downstream handlers/middleware.
 */
export function authenticateToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Authentication token missing. Provide an "Authorization: Bearer <token>" header.'));
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid authentication token.';
    return next(ApiError.unauthorized(message));
  }
}

/**
 * Restricts a route to the given role name(s). Must run after
 * authenticateToken (relies on req.user.role set from the JWT payload).
 */
export function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires one of the following roles: ${roles.join(', ')}.`));
    }
    return next();
  };
}
