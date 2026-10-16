// MySQL 8 returns a JSON column already parsed, but MariaDB has no native
// JSON type — it stores JSON as longtext with a CHECK (json_valid(...)), and
// the driver hands that back as a plain string. The same is true of any
// MySQL database restored from a MariaDB dump, where those columns arrive as
// longtext. Readers downstream expect objects, so normalize on the way out
// rather than making every caller test the type.
//
// Parsing is best-effort by design: a column holding text that is not valid
// JSON is returned untouched instead of throwing, so one malformed row can
// never take down a whole list response.

function parseValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  // Cheap guard so ordinary text columns are never run through the parser.
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/** Returns `row` with each named column parsed from a JSON string, if it is one. */
export function parseJsonColumns(row, columns) {
  if (!row) return row;
  const out = { ...row };
  for (const column of columns) {
    if (column in out) out[column] = parseValue(out[column]);
  }
  return out;
}

/** parseJsonColumns() over an array of rows. */
export function parseJsonColumnsAll(rows, columns) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => parseJsonColumns(row, columns));
}
