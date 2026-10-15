import { run, all, get } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId } from '../utils/validators.js';

/**
 * Writes one activity_logs row. Called internally by companyService and
 * sourceService after a successful create/update/delete — never fails the
 * calling request if logging itself has a problem (logging is best-effort
 * observability, not a business invariant).
 */
export async function logActivity({ userId, module, action, description }) {
  try {
    await run(
      'INSERT INTO activity_logs (user_id, module, action, description) VALUES (?, ?, ?, ?)',
      [userId ?? null, module, action, description ?? null]
    );
  } catch (error) {
    console.error('[Activity Log] Failed to write log entry:', error.message);
  }
}

export async function listActivityLogs({ module, action, userId } = {}) {
  let sql = `
    SELECT al.id, al.user_id, al.module, al.action, al.description, al.created_at,
           u.first_name, u.last_name, u.email
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (module) {
    sql += ' AND al.module = ?';
    params.push(module);
  }
  if (action) {
    sql += ' AND al.action = ?';
    params.push(action);
  }
  if (userId) {
    sql += ' AND al.user_id = ?';
    params.push(userId);
  }

  sql += ' ORDER BY al.created_at DESC';

  const rows = await all(sql, params);
  return rows.map(toActivityLogShape);
}

export async function getActivityLogById(id) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid activity log ID. Must be a positive integer.');
  const row = await get(
    `SELECT al.id, al.user_id, al.module, al.action, al.description, al.created_at,
            u.first_name, u.last_name, u.email
     FROM activity_logs al
     LEFT JOIN users u ON al.user_id = u.id
     WHERE al.id = ?`,
    [id]
  );
  if (!row) throw ApiError.notFound(`Activity log with ID ${id} not found.`);
  return toActivityLogShape(row);
}

function toActivityLogShape(row) {
  return {
    id: row.id,
    module: row.module,
    action: row.action,
    description: row.description,
    created_at: row.created_at,
    user: row.user_id ? { id: row.user_id, first_name: row.first_name, last_name: row.last_name, email: row.email } : null,
  };
}
