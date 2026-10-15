import { run, all, get } from '../config/database.js';
import { ApiError, isDuplicateEntryError } from '../utils/ApiError.js';
import { findMissingFields, isValidUrl, isValidId } from '../utils/validators.js';
import { logActivity } from './activityLogService.js';

const EDITABLE_FIELDS = ['company_name', 'website', 'sector', 'headquarters', 'company_type', 'company_size', 'description', 'status'];

function validateCompanyPayload(payload, { partial = false } = {}) {
  if (!partial) {
    const missing = findMissingFields(payload, ['company_name']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }
  }

  if (payload.website !== undefined && payload.website !== null && payload.website !== '' && !isValidUrl(payload.website)) {
    throw ApiError.badRequest('"website" must be a valid http(s) URL.');
  }

  if (payload.status !== undefined && payload.status !== null && !['Active', 'Inactive'].includes(payload.status)) {
    throw ApiError.badRequest('"status" must be either "Active" or "Inactive".');
  }
}

async function assertNoDuplicateName(companyName, excludeId = null) {
  const existing = await get(
    excludeId
      ? 'SELECT id FROM companies WHERE LOWER(company_name) = LOWER(?) AND id != ?'
      : 'SELECT id FROM companies WHERE LOWER(company_name) = LOWER(?)',
    excludeId ? [companyName, excludeId] : [companyName]
  );
  if (existing) {
    throw ApiError.conflict(`A company named "${companyName}" already exists.`);
  }
}

export async function listCompanies({ status, sector } = {}) {
  let sql = 'SELECT * FROM companies WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (sector) {
    sql += ' AND LOWER(sector) = LOWER(?)';
    params.push(sector);
  }

  sql += ' ORDER BY created_at DESC';
  return all(sql, params);
}

export async function getCompanyById(id) {
  if (!isValidId(id)) throw ApiError.badRequest('Invalid company ID. Must be a positive integer.');
  const company = await get('SELECT * FROM companies WHERE id = ?', [id]);
  if (!company) throw ApiError.notFound(`Company with ID ${id} not found.`);
  return company;
}

export async function createCompany(payload, actingUser) {
  validateCompanyPayload(payload);
  await assertNoDuplicateName(payload.company_name);

  let result;
  try {
    result = await run(
      `INSERT INTO companies (company_name, website, sector, headquarters, company_type, company_size, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.company_name,
        payload.website ?? null,
        payload.sector ?? null,
        payload.headquarters ?? null,
        payload.company_type ?? null,
        payload.company_size ?? null,
        payload.description ?? null,
        payload.status ?? 'Active',
      ]
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw ApiError.conflict(`A company named "${payload.company_name}" already exists.`);
    }
    throw error;
  }

  const company = await getCompanyById(result.lastID);

  await logActivity({
    userId: actingUser?.id,
    module: 'companies',
    action: 'created',
    description: `Company "${company.company_name}" (ID ${company.id}) was created.`,
  });

  return company;
}

export async function updateCompany(id, payload, actingUser) {
  const existing = await getCompanyById(id);
  validateCompanyPayload(payload, { partial: true });

  const next = { ...existing };
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      next[field] = payload[field];
    }
  }

  if (!next.company_name || !String(next.company_name).trim()) {
    throw ApiError.badRequest('"company_name" cannot be empty.');
  }

  if (next.company_name.toLowerCase() !== existing.company_name.toLowerCase()) {
    await assertNoDuplicateName(next.company_name, id);
  }

  try {
    await run(
      `UPDATE companies
       SET company_name = ?, website = ?, sector = ?, headquarters = ?, company_type = ?, company_size = ?, description = ?, status = ?
       WHERE id = ?`,
      [next.company_name, next.website, next.sector, next.headquarters, next.company_type, next.company_size, next.description, next.status, id]
    );
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw ApiError.conflict(`A company named "${next.company_name}" already exists.`);
    }
    throw error;
  }

  const company = await getCompanyById(id);

  await logActivity({
    userId: actingUser?.id,
    module: 'companies',
    action: 'updated',
    description: `Company "${company.company_name}" (ID ${company.id}) was updated.`,
  });

  return company;
}

export async function deleteCompany(id, actingUser) {
  const existing = await getCompanyById(id);
  await run('DELETE FROM companies WHERE id = ?', [id]);

  await logActivity({
    userId: actingUser?.id,
    module: 'companies',
    action: 'deleted',
    description: `Company "${existing.company_name}" (ID ${existing.id}) was deleted.`,
  });

  return existing;
}
