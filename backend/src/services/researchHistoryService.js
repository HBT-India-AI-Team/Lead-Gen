import { all, get } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidId } from '../utils/validators.js';

export async function listResearchHistory({ companyId, sourceUrlId, status } = {}) {
  let sql = 'SELECT * FROM research_history WHERE 1=1';
  const params = [];

  if (companyId) {
    sql += ' AND company_id = ?';
    params.push(companyId);
  }
  if (sourceUrlId) {
    sql += ' AND source_url_id = ?';
    params.push(sourceUrlId);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';
  return all(sql, params);
}

export async function getResearchHistoryById(id) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid research history ID. Must be a positive integer.');
  const record = await get('SELECT * FROM research_history WHERE id = ?', [id]);
  if (!record) throw ApiError.notFound(`Research history entry with ID ${id} not found.`);
  return record;
}
