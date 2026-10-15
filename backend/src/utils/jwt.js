import jwt from 'jsonwebtoken';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to your .env file before starting the server.');
}

/** Signs a JWT for the given payload (kept small: id, email, role). */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** Verifies a JWT, throwing jsonwebtoken's own error on failure/expiry. */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
