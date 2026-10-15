import bcrypt from 'bcrypt';
import { run } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import { findByEmailWithPassword, getProfileById } from './userService.js';

/**
 * Verifies credentials and issues a JWT. Deliberately returns the same
 * generic error for "no such user" and "wrong password" to avoid leaking
 * which emails are registered.
 */
export async function login(email, password) {
  const user = await findByEmailWithPassword(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (user.status !== 'Active') {
    throw ApiError.forbidden('This account is not active. Contact an administrator.');
  }

  await run('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role_name,
    roleId: user.role_id,
  });

  const profile = await getProfileById(user.id);
  return { token, user: profile, role: profile.role };
}
