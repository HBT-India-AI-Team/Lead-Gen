import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { exec, get, testConnection } from '../config/database.js';
import { seedIfEmpty, seedAuthIfEmpty, seedSourcesIfEmpty } from './seed.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_NAME = process.env.DB_NAME || 'sbi_leadgen';

const baseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

/**
 * Ensures the target database exists. Connects without selecting a
 * database first, since the app's normal pool (in config/database.js)
 * always connects with `database` pre-selected and would fail outright
 * if that database hasn't been created yet.
 */
async function ensureDatabaseExists() {
  let connection;
  try {
    connection = await mysql.createConnection(baseConfig);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
  } catch (error) {
    console.error(`[DB Init] Could not create/verify database "${DB_NAME}":`, error.message);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

/** Applies schema.sql (CREATE TABLE IF NOT EXISTS — safe to re-run). */
async function applySchema() {
  const schemaPath = path.resolve(__dirname, './schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`[DB Init] Missing schema file: ${schemaPath}`);
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  try {
    await exec(schemaSql);
  } catch (error) {
    console.error('[DB Init] Failed to apply schema.sql:', error.message);
    throw error;
  }
}

/**
 * Migrates a `roles`/`users` schema created by an earlier version of this
 * app (column `roles.name`, status values 'active'/'inactive'/'suspended')
 * to the current shape (`roles.role_name`, status 'Active'/'Inactive').
 * Safe to run on every boot: each step is guarded by an information_schema
 * check and only fires if the legacy shape is still present.
 */
async function migrateLegacyAuthSchema() {
  const legacyRoleColumn = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'roles' AND column_name = 'name'`
  );
  if (legacyRoleColumn && legacyRoleColumn.count > 0) {
    console.log('[DB Migrate] Renaming roles.name -> roles.role_name...');
    await exec('ALTER TABLE roles CHANGE COLUMN name role_name VARCHAR(50) NOT NULL;');
  }

  const legacyStatusCheck = await get(
    `SELECT COUNT(*) AS count FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = 'chk_users_status'
     AND check_clause LIKE '%suspended%'`
  );
  if (legacyStatusCheck && legacyStatusCheck.count > 0) {
    console.log('[DB Migrate] Normalizing users.status to Active/Inactive...');
    await exec(`
      UPDATE users SET status = 'Active' WHERE LOWER(status) = 'active';
      UPDATE users SET status = 'Inactive' WHERE LOWER(status) IN ('inactive', 'suspended');
      ALTER TABLE users DROP CHECK chk_users_status;
      ALTER TABLE users MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Active';
      ALTER TABLE users ADD CONSTRAINT chk_users_status CHECK (status IN ('Active', 'Inactive'));
    `);
  }
}

/**
 * Renames the original `companies` table (V1 demo data: id, name, sector,
 * focus_area, ...) to `legacy_companies`, freeing up the `companies` name
 * for the Phase 3 production schema (company_name, website, headquarters,
 * ...). Must run BEFORE applySchema(), otherwise `CREATE TABLE IF NOT
 * EXISTS companies` in schema.sql would silently no-op against the
 * still-present old-shape table. MySQL's RENAME TABLE automatically
 * repoints the FKs in predictive_needs/proposals to the new name, so the
 * legacy /api/v1/discovery and /api/v1/proposals routes keep working
 * unchanged.
 */
async function migrateLegacyCompaniesTable() {
  const companiesTableExists = await get(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'companies'`
  );
  if (!companiesTableExists || companiesTableExists.count === 0) {
    return;
  }

  const hasOldShape = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'companies' AND column_name = 'name'`
  );
  const legacyTableExists = await get(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'legacy_companies'`
  );

  if (hasOldShape && hasOldShape.count > 0 && (!legacyTableExists || legacyTableExists.count === 0)) {
    console.log('[DB Migrate] Renaming companies -> legacy_companies (freeing up "companies" for the Phase 3 schema)...');
    await exec('RENAME TABLE companies TO legacy_companies;');
  }
}

/**
 * Upgrades a `sources` table created by Phase 3 (no `description`/`priority`
 * columns, unconstrained `category`, `health_status` defaulting to
 * 'Unknown') to the Phase 4 Source Registry shape. Guarded by
 * information_schema checks so it's a no-op on fresh installs (schema.sql
 * already creates the final shape) and safe to re-run on every boot.
 */
async function migrateSourcesTableForRegistry() {
  const sourcesTableExists = await get(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'sources'`
  );
  if (!sourcesTableExists || sourcesTableExists.count === 0) return;

  const hasDescription = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'sources' AND column_name = 'description'`
  );
  if (!hasDescription || hasDescription.count === 0) {
    console.log('[DB Migrate] Adding sources.description...');
    await exec('ALTER TABLE sources ADD COLUMN description TEXT AFTER last_run;');
  }

  const hasPriority = await get(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'sources' AND column_name = 'priority'`
  );
  if (!hasPriority || hasPriority.count === 0) {
    console.log('[DB Migrate] Adding sources.priority...');
    await exec('ALTER TABLE sources ADD COLUMN priority INT NOT NULL DEFAULT 0 AFTER description;');
  }

  const hasCategoryCheck = await get(
    `SELECT COUNT(*) AS count FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = 'chk_sources_category'`
  );
  if (!hasCategoryCheck || hasCategoryCheck.count === 0) {
    console.log('[DB Migrate] Constraining sources.category to the fixed Source Registry list...');
    await exec(`
      UPDATE sources SET category = 'Other'
        WHERE category IS NULL OR category NOT IN ('Government', 'Tender', 'Startup', 'News', 'Finance', 'Company', 'Other');
      ALTER TABLE sources MODIFY COLUMN category VARCHAR(50) DEFAULT 'Other';
      ALTER TABLE sources ADD CONSTRAINT chk_sources_category
        CHECK (category IN ('Government', 'Tender', 'Startup', 'News', 'Finance', 'Company', 'Other'));
    `);
  }

  const hasHealthCheck = await get(
    `SELECT COUNT(*) AS count FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = 'chk_sources_health_status'`
  );
  if (!hasHealthCheck || hasHealthCheck.count === 0) {
    console.log('[DB Migrate] Constraining sources.health_status to Healthy/Warning/Offline...');
    await exec(`
      UPDATE sources SET health_status = 'Warning'
        WHERE health_status IS NULL OR health_status NOT IN ('Healthy', 'Warning', 'Offline');
      ALTER TABLE sources MODIFY COLUMN health_status VARCHAR(20) NOT NULL DEFAULT 'Healthy';
      ALTER TABLE sources ADD CONSTRAINT chk_sources_health_status
        CHECK (health_status IN ('Healthy', 'Warning', 'Offline'));
    `);
  }
}

export async function initializeDatabase() {
  await ensureDatabaseExists();
  await testConnection();
  await migrateLegacyCompaniesTable();
  await applySchema();
  await migrateLegacyAuthSchema();
  await migrateSourcesTableForRegistry();
  await seedIfEmpty();
  await seedAuthIfEmpty();
  await seedSourcesIfEmpty();
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  initializeDatabase()
    .then(() => {
      console.log('[DB Init] MySQL database ready.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[DB Init] Fatal error during initialization:', error.message);
      process.exit(1);
    });
}
