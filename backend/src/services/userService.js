import bcrypt from 'bcrypt';
import { run, get } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { isStrongPassword, findMissingFields } from '../utils/validators.js';

const SALT_ROUNDS = 10;

const PUBLIC_USER_FIELDS = `
  u.id, u.first_name, u.last_name, u.email, u.phone, u.status, u.profile_image,
  u.last_login, u.created_at, u.updated_at,
  r.id AS role_id, r.role_name, r.description AS role_description
`;

function toProfileShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    profile_image: row.profile_image,
    last_login: row.last_login,
    created_at: row.created_at,
    updated_at: row.updated_at,
    role: row.role_id ? { id: row.role_id, role_name: row.role_name, description: row.role_description } : null,
  };
}

/** Finds a user by email including the password hash (login-only — never returned to clients as-is). */
export async function findByEmailWithPassword(email) {
  return get(
    `SELECT u.*, r.role_name
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.email = ?`,
    [email.trim().toLowerCase()]
  );
}

export async function getProfileById(userId) {
  const row = await get(
    `SELECT ${PUBLIC_USER_FIELDS} FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
    [userId]
  );
  if (!row) throw ApiError.notFound('User not found.');
  return toProfileShape(row);
}

export async function updateProfile(userId, updates) {
  const existing = await get('SELECT id, email FROM users WHERE id = ?', [userId]);
  if (!existing) throw ApiError.notFound('User not found.');

  if (Object.prototype.hasOwnProperty.call(updates, 'email') && updates.email && updates.email.trim().toLowerCase() !== existing.email.toLowerCase()) {
    throw ApiError.badRequest('Email cannot be changed.');
  }

  const missing = findMissingFields(updates, ['first_name', 'last_name']);
  if (missing.length) {
    throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
  }

  await run(
    `UPDATE users SET first_name = ?, last_name = ?, phone = ?, profile_image = ? WHERE id = ?`,
    [updates.first_name, updates.last_name, updates.phone ?? null, updates.profile_image ?? null, userId]
  );

  return getProfileById(userId);
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await get('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
  if (!user) throw ApiError.notFound('User not found.');

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    throw ApiError.badRequest('Current password is incorrect.');
  }

  if (!isStrongPassword(newPassword)) {
    throw ApiError.badRequest('New password must be at least 8 characters and include at least one letter and one number.');
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
}
