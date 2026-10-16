import { Router } from 'express';
import { all, get, run } from '../config/database.js';
import { parseJsonColumns, parseJsonColumnsAll } from '../utils/jsonColumns.js';

// Per-category lead settings API backing the Settings → Lead Management tabs
// (frontend/src/components/settings/LeadCategorySettings.tsx), mounted at
// /api/settings in src/server.js; its table is created at boot by
// src/db/migrations/addLeadCategorySettings.js.
//
// The :key path param is the exact category string from the frontend's
// LEAD_CATEGORY_OPTIONS single source of truth (URL-encoded), e.g.
// 'Tender' or 'GST%20registration' — no numeric id space is invented.
// score_thresholds is parsed on read so MariaDB-restored rows (JSON stored
// as text) come back as objects, like everywhere else.

const router = Router();

const MIN_WINDOW = 1;
const MAX_WINDOW = 365;

function toBigIntOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// GET all categories' settings (for hydrating every tab at once).
router.get('/lead-categories', async (_req, res) => {
  try {
    const rows = await all('SELECT * FROM lead_category_settings ORDER BY category_key');
    res.json({ settings: parseJsonColumnsAll(rows, ['score_thresholds']) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one category's settings. 404 if nothing saved yet (frontend then falls
// back to its DEFAULT_CATEGORY_SETTINGS — same defaults the migration uses).
router.get('/lead-categories/:key', async (req, res) => {
  try {
    const row = await get('SELECT * FROM lead_category_settings WHERE category_key = ?', [req.params.key]);
    if (!row) return res.status(404).json({ error: 'No settings saved for this category yet.' });
    res.json({ settings: parseJsonColumns(row, ['score_thresholds']) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT (upsert) one category's settings.
router.put('/lead-categories/:key', async (req, res) => {
  const { key } = req.params;
  const { tenderValueMin, tenderValueMax, decisionWindowDays, scoreThresholds } = req.body ?? {};

  const min = toBigIntOrNull(tenderValueMin);
  const max = toBigIntOrNull(tenderValueMax);
  const days = Number(decisionWindowDays);

  if (min === null || max === null || max < min) {
    return res.status(400).json({ error: 'tenderValueMin/tenderValueMax must be numbers with max >= min.' });
  }
  if (!Number.isInteger(days) || days < MIN_WINDOW || days > MAX_WINDOW) {
    return res.status(400).json({ error: `decisionWindowDays must be an integer between ${MIN_WINDOW} and ${MAX_WINDOW}.` });
  }

  try {
    await run(
      `INSERT INTO lead_category_settings
         (category_key, tender_value_min, tender_value_max, decision_window_days, score_thresholds)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tender_value_min = VALUES(tender_value_min),
         tender_value_max = VALUES(tender_value_max),
         decision_window_days = VALUES(decision_window_days),
         score_thresholds = VALUES(score_thresholds)`,
      [key, min, max, days, scoreThresholds ? JSON.stringify(scoreThresholds) : null]
    );
    const row = await get('SELECT * FROM lead_category_settings WHERE category_key = ?', [key]);
    res.json({ settings: parseJsonColumns(row, ['score_thresholds']) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
