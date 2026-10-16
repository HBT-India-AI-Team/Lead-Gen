import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// On Cloud SQL (Cloud Run) MySQL is reached over a Unix socket rather than
// TCP, so DB_SOCKET takes precedence when set and host/port are omitted
// entirely. Local development sets no DB_SOCKET and keeps the TCP path.
const poolConfig = {
  ...(process.env.DB_SOCKET
    ? { socketPath: process.env.DB_SOCKET }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
      }),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'leadgen',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(poolConfig);

/**
 * Verifies the pool can actually reach MySQL. Used at server boot so a
 * missing/unreachable database fails fast with a clear message instead of
 * surfacing as a confusing error on the first incoming request.
 */
export async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    return true;
  } catch (error) {
    console.error('[MySQL] Connection failed:', error.message);
    throw new Error(`Unable to connect to MySQL database "${poolConfig.database}" at ${poolConfig.socketPath || `${poolConfig.host}:${poolConfig.port}`} — ${error.message}`);
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Runs an INSERT/UPDATE/DELETE and normalizes the result to the same shape
 * the previous `sqlite` wrapper returned (`lastID`/`changes`), so existing
 * route code that reads `result.lastID` keeps working unchanged.
 */
export async function run(sql, params = []) {
  try {
    const [result] = await pool.query(sql, params);
    return { lastID: result.insertId, changes: result.affectedRows };
  } catch (error) {
    console.error('[MySQL] Query failed:', error.message, '\nSQL:', sql);
    throw error;
  }
}

/** Runs a SELECT and returns all matching rows. */
export async function all(sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('[MySQL] Query failed:', error.message, '\nSQL:', sql);
    throw error;
  }
}

/** Runs a SELECT and returns only the first row (or undefined). */
export async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0];
}

/** Runs one or more semicolon-separated DDL statements (schema setup only). */
export async function exec(sql) {
  let connection;
  try {
    connection = await mysql.createConnection({ ...poolConfig, multipleStatements: true });
    await connection.query(sql);
  } catch (error) {
    console.error('[MySQL] Exec failed:', error.message);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Runs `callback` against a single pinned connection wrapped in a
 * transaction, committing on success and rolling back on any error.
 * Needed because pooled `run`/`all`/`get` calls may each land on a
 * different physical connection, which would break atomicity for
 * multi-statement writes (see ingest_pipeline.js).
 */
export async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const txDb = {
      run: async (sql, params = []) => {
        const [result] = await connection.query(sql, params);
        return { lastID: result.insertId, changes: result.affectedRows };
      },
      all: async (sql, params = []) => {
        const [rows] = await connection.query(sql, params);
        return rows;
      },
      get: async (sql, params = []) => {
        const [rows] = await connection.query(sql, params);
        return rows[0];
      },
    };
    const result = await callback(txDb);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

let dbApi = null;

/**
 * Returns the singleton DB access object. Kept API-compatible with the
 * previous `sqlite` wrapper's `getDb()` (`.run`/`.all`/`.get`/`.exec`) so
 * route files only need their import path updated, not their query code.
 */
export async function getDb() {
  if (dbApi) return dbApi;
  await testConnection();
  dbApi = { run, all, get, exec, withTransaction, close: closePool, pool };
  return dbApi;
}

export async function closePool() {
  await pool.end();
}

export default pool;
