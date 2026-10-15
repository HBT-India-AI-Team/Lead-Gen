import { run, all, get } from '../config/database.js';
import { ApiError, isDuplicateEntryError } from '../utils/ApiError.js';
import { findMissingFields, isValidUrl, isValidId } from '../utils/validators.js';

const EDITABLE_FIELDS = ['source_id', 'company_id', 'url', 'url_type', 'verification_status'];

async function assertSourceExists(sourceId) {
  const source = await get('SELECT id FROM sources WHERE id = ?', [sourceId]);
  if (!source) throw ApiError.badRequest(`"source_id" ${sourceId} does not reference an existing source.`);
}

async function assertCompanyExists(companyId) {
  if (companyId === undefined || companyId === null) return;
  const company = await get('SELECT id FROM companies WHERE id = ?', [companyId]);
  if (!company) throw ApiError.badRequest(`"company_id" ${companyId} does not reference an existing company.`);
}

async function assertNoDuplicateUrl(url, excludeId = null) {
  const existing = await get(
    excludeId ? 'SELECT id FROM source_urls WHERE url = ? AND id != ?' : 'SELECT id FROM source_urls WHERE url = ?',
    excludeId ? [url, excludeId] : [url]
  );
  if (existing) {
    throw ApiError.conflict(`The URL "${url}" has already been registered.`);
  }
}

function validateSourceUrlPayload(payload, { partial = false } = {}) {
  if (!partial) {
    const missing = findMissingFields(payload, ['source_id', 'url']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }
  }

  if (payload.url !== undefined && payload.url !== null && payload.url !== '' && !isValidUrl(payload.url)) {
    throw ApiError.badRequest('"url" must be a valid http(s) URL.');
  }
}

export async function listSourceUrls({ sourceId, companyId, verificationStatus } = {}) {
  let sql = 'SELECT * FROM source_urls WHERE 1=1';
  const params = [];

  if (sourceId) {
    sql += ' AND source_id = ?';
    params.push(sourceId);
  }
  if (companyId) {
    sql += ' AND company_id = ?';
    params.push(companyId);
  }
  if (verificationStatus) {
    sql += ' AND verification_status = ?';
    params.push(verificationStatus);
  }

  sql += ' ORDER BY discovered_at DESC';
  return all(sql, params);
}

export async function getSourceUrlById(id) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid source URL ID. Must be a positive integer.');
  const sourceUrl = await get('SELECT * FROM source_urls WHERE id = ?', [id]);
  if (!sourceUrl) throw ApiError.notFound(`Source URL with ID ${id} not found.`);
  return sourceUrl;
}

export async function createSourceUrl(payload) {
  validateSourceUrlPayload(payload);
  await assertSourceExists(payload.source_id);
  await assertCompanyExists(payload.company_id);
  await assertNoDuplicateUrl(payload.url);

  let result;
  try {
    result = await run(
      `INSERT INTO source_urls (source_id, company_id, url, url_type, verification_status)
       VALUES (?, ?, ?, ?, ?)`,
      [payload.source_id, payload.company_id ?? null, payload.url, payload.url_type ?? null, payload.verification_status ?? 'Pending']
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw ApiError.conflict(`The URL "${payload.url}" has already been registered.`);
    }
    throw error;
  }

  return getSourceUrlById(result.lastID);
}

export async function updateSourceUrl(id, payload) {
  const existing = await getSourceUrlById(id);
  validateSourceUrlPayload(payload, { partial: true });

  const next = { ...existing };
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      next[field] = payload[field];
    }
  }

  if (!next.source_id) throw ApiError.badRequest('"source_id" cannot be empty.');
  if (!next.url || !String(next.url).trim()) throw ApiError.badRequest('"url" cannot be empty.');

  if (next.source_id !== existing.source_id) await assertSourceExists(next.source_id);
  if (next.company_id !== existing.company_id) await assertCompanyExists(next.company_id);
  if (next.url !== existing.url) await assertNoDuplicateUrl(next.url, id);

  try {
    await run(
      `UPDATE source_urls
       SET source_id = ?, company_id = ?, url = ?, url_type = ?, verification_status = ?
       WHERE id = ?`,
      [next.source_id, next.company_id, next.url, next.url_type, next.verification_status, id]
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw ApiError.conflict(`The URL "${next.url}" has already been registered.`);
    }
    throw error;
  }

  return getSourceUrlById(id);
}

export async function deleteSourceUrl(id) {
  const existing = await getSourceUrlById(id);
  await run('DELETE FROM source_urls WHERE id = ?', [id]);
  return existing;
}
