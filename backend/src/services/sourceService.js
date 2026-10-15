import { run, all, get } from '../config/database.js';
import { ApiError, isDuplicateEntryError } from '../utils/ApiError.js';
import { findMissingFields, isValidUrl, isValidId } from '../utils/validators.js';
import { logActivity } from './activityLogService.js';

const EDITABLE_FIELDS = ['source_name', 'base_url', 'category', 'country', 'crawl_frequency', 'enabled', 'health_status', 'description', 'priority'];

export const CATEGORIES = ['Government', 'Tender', 'Startup', 'News', 'Finance', 'Company', 'Other'];
export const HEALTH_STATUSES = ['Healthy', 'Warning', 'Offline'];

const SORTABLE_COLUMNS = {
  priority: 'priority',
  last_run: 'last_run',
  created_at: 'created_at',
  source_name: 'source_name',
};

function isNonEmpty(value) {
  return value !== undefined && value !== null && value !== '';
}

function toBoolean(value, fieldName) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  throw ApiError.badRequest(`"${fieldName}" must be a boolean.`);
}

function isValidPriority(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0;
}

function validateSourcePayload(payload, { partial = false } = {}) {
  if (!partial) {
    const missing = findMissingFields(payload, ['source_name', 'base_url']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }
  }

  if (isNonEmpty(payload.base_url) && !isValidUrl(payload.base_url)) {
    throw ApiError.badRequest('"base_url" must be a valid http(s) URL.');
  }

  if (isNonEmpty(payload.category) && !CATEGORIES.includes(payload.category)) {
    throw ApiError.badRequest(`"category" must be one of: ${CATEGORIES.join(', ')}.`);
  }

  if (isNonEmpty(payload.health_status) && !HEALTH_STATUSES.includes(payload.health_status)) {
    throw ApiError.badRequest(`"health_status" must be one of: ${HEALTH_STATUSES.join(', ')}.`);
  }

  if (isNonEmpty(payload.priority) && !isValidPriority(payload.priority)) {
    throw ApiError.badRequest('"priority" must be a non-negative integer.');
  }
}

async function assertNoDuplicateName(sourceName, excludeId = null) {
  const existing = await get(
    excludeId
      ? 'SELECT id FROM sources WHERE LOWER(source_name) = LOWER(?) AND id != ?'
      : 'SELECT id FROM sources WHERE LOWER(source_name) = LOWER(?)',
    excludeId ? [sourceName, excludeId] : [sourceName]
  );
  if (existing) {
    throw ApiError.conflict(`A source named "${sourceName}" already exists.`);
  }
}

async function assertNoDuplicateUrl(baseUrl, excludeId = null) {
  const existing = await get(
    excludeId
      ? 'SELECT id FROM sources WHERE base_url = ? AND id != ?'
      : 'SELECT id FROM sources WHERE base_url = ?',
    excludeId ? [baseUrl, excludeId] : [baseUrl]
  );
  if (existing) {
    throw ApiError.conflict(`A source with base URL "${baseUrl}" already exists.`);
  }
}

/**
 * Supports search (by name), category/enabled filters, sort by
 * priority/last_run/created_at/source_name, and page/limit pagination.
 * `page`/`limit` are parsed defensively since they arrive as query-string
 * values (strings) and are interpolated as LIMIT/OFFSET, not bound params
 * mysql2 always accepts as numbers there.
 */
export async function listSources({ search, category, enabled, page = 1, limit = 10, sortBy = 'created_at', order = 'desc' } = {}) {
  const conditions = [];
  const params = [];

  if (isNonEmpty(search)) {
    conditions.push('LOWER(source_name) LIKE ?');
    params.push(`%${String(search).trim().toLowerCase()}%`);
  }

  if (isNonEmpty(category)) {
    if (!CATEGORIES.includes(category)) {
      throw ApiError.badRequest(`"category" must be one of: ${CATEGORIES.join(', ')}.`);
    }
    conditions.push('category = ?');
    params.push(category);
  }

  if (isNonEmpty(enabled)) {
    conditions.push('enabled = ?');
    params.push(toBoolean(enabled, 'enabled') ? 1 : 0);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const sortColumn = SORTABLE_COLUMNS[sortBy] || 'created_at';
  const sortOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const totalRow = await get(`SELECT COUNT(*) AS count FROM sources ${whereClause}`, params);
  const total = totalRow?.count || 0;

  const sources = await all(
    `SELECT * FROM sources ${whereClause} ORDER BY ${sortColumn} ${sortOrder}, id DESC LIMIT ${limitNum} OFFSET ${offset}`,
    params
  );

  return {
    sources,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
}

export async function getSourceById(id) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid source ID. Must be a positive integer.');
  const source = await get('SELECT * FROM sources WHERE id = ?', [id]);
  if (!source) throw ApiError.notFound(`Source with ID ${id} not found.`);
  return source;
}

export async function createSource(payload, actingUser) {
  validateSourcePayload(payload);
  await assertNoDuplicateName(payload.source_name);
  await assertNoDuplicateUrl(payload.base_url);

  let result;
  try {
    result = await run(
      `INSERT INTO sources (source_name, base_url, category, country, crawl_frequency, enabled, health_status, description, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.source_name,
        payload.base_url,
        payload.category ?? 'Other',
        payload.country ?? null,
        payload.crawl_frequency ?? null,
        payload.enabled === undefined ? true : toBoolean(payload.enabled, 'enabled'),
        payload.health_status ?? 'Healthy',
        payload.description ?? null,
        isNonEmpty(payload.priority) ? Number(payload.priority) : 0,
      ]
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw ApiError.conflict('A source with this name or base URL already exists.');
    }
    throw error;
  }

  const source = await getSourceById(result.lastID);

  await logActivity({
    userId: actingUser?.id,
    module: 'sources',
    action: 'created',
    description: `Source "${source.source_name}" (ID ${source.id}) was added to the registry.`,
  });

  return source;
}

export async function updateSource(id, payload, actingUser) {
  const existing = await getSourceById(id);
  validateSourcePayload(payload, { partial: true });

  const next = { ...existing };
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      next[field] = payload[field];
    }
  }

  if (!next.source_name || !String(next.source_name).trim()) {
    throw ApiError.badRequest('"source_name" cannot be empty.');
  }
  if (!next.base_url || !String(next.base_url).trim()) {
    throw ApiError.badRequest('"base_url" cannot be empty.');
  }

  if (next.source_name.toLowerCase() !== existing.source_name.toLowerCase()) {
    await assertNoDuplicateName(next.source_name, id);
  }
  if (next.base_url !== existing.base_url) {
    await assertNoDuplicateUrl(next.base_url, id);
  }

  try {
    await run(
      `UPDATE sources
       SET source_name = ?, base_url = ?, category = ?, country = ?, crawl_frequency = ?, enabled = ?, health_status = ?, description = ?, priority = ?
       WHERE id = ?`,
      [
        next.source_name,
        next.base_url,
        next.category,
        next.country,
        next.crawl_frequency,
        toBoolean(next.enabled, 'enabled'),
        next.health_status,
        next.description,
        Number(next.priority) || 0,
        id,
      ]
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw ApiError.conflict('A source with this name or base URL already exists.');
    }
    throw error;
  }

  const source = await getSourceById(id);

  await logActivity({
    userId: actingUser?.id,
    module: 'sources',
    action: 'updated',
    description: `Source "${source.source_name}" (ID ${source.id}) was updated.`,
  });

  return source;
}

export async function deleteSource(id, actingUser) {
  const existing = await getSourceById(id);
  await run('DELETE FROM sources WHERE id = ?', [id]);

  await logActivity({
    userId: actingUser?.id,
    module: 'sources',
    action: 'deleted',
    description: `Source "${existing.source_name}" (ID ${existing.id}) was deleted from the registry.`,
  });

  return existing;
}

export async function updateSourceStatus(id, payload, actingUser) {
  const existing = await getSourceById(id);
  if (payload?.enabled === undefined) {
    throw ApiError.badRequest('"enabled" is required.');
  }
  const enabled = toBoolean(payload.enabled, 'enabled');

  await run('UPDATE sources SET enabled = ? WHERE id = ?', [enabled, id]);
  const source = await getSourceById(id);

  await logActivity({
    userId: actingUser?.id,
    module: 'sources',
    action: 'status_changed',
    description: `Source "${source.source_name}" (ID ${source.id}) status changed from ${existing.enabled ? 'Enabled' : 'Disabled'} to ${enabled ? 'Enabled' : 'Disabled'}.`,
  });

  return source;
}

export async function updateSourceHealth(id, payload, actingUser) {
  const existing = await getSourceById(id);
  const healthStatus = payload?.health_status;
  if (!isNonEmpty(healthStatus) || !HEALTH_STATUSES.includes(healthStatus)) {
    throw ApiError.badRequest(`"health_status" must be one of: ${HEALTH_STATUSES.join(', ')}.`);
  }

  await run('UPDATE sources SET health_status = ? WHERE id = ?', [healthStatus, id]);
  const source = await getSourceById(id);

  await logActivity({
    userId: actingUser?.id,
    module: 'sources',
    action: 'health_updated',
    description: `Source "${source.source_name}" (ID ${source.id}) health status updated from ${existing.health_status} to ${healthStatus}.`,
  });

  return source;
}

/** Marks `last_run` as now. No crawling/scraping happens here — this only records that a run occurred (the actual crawl is out of scope for the Source Registry phase). */
export async function touchSourceLastRun(id, actingUser) {
  const existing = await getSourceById(id);
  await run('UPDATE sources SET last_run = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  const source = await getSourceById(id);

  await logActivity({
    userId: actingUser?.id,
    module: 'sources',
    action: 'run_recorded',
    description: `Source "${source.source_name}" (ID ${source.id}) last run timestamp updated (previous: ${existing.last_run ? new Date(existing.last_run).toISOString() : 'never'}).`,
  });

  return source;
}

export async function updateSourcePriority(id, payload, actingUser) {
  const existing = await getSourceById(id);
  const priority = payload?.priority;
  if (!isNonEmpty(priority) || !isValidPriority(priority)) {
    throw ApiError.badRequest('"priority" must be a non-negative integer.');
  }

  await run('UPDATE sources SET priority = ? WHERE id = ?', [Number(priority), id]);
  const source = await getSourceById(id);

  await logActivity({
    userId: actingUser?.id,
    module: 'sources',
    action: 'priority_updated',
    description: `Source "${source.source_name}" (ID ${source.id}) priority updated from ${existing.priority} to ${priority}.`,
  });

  return source;
}
