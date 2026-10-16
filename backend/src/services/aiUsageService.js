import { all } from '../config/database.js';

// Measured LLM usage from llm_calls (written by services/llm/llmTelemetry.js):
// per feature, how many calls, how often they failed, how long they took
// and how many tokens they used — the numbers behind "cost per lead" and
// latency claims.
//
// Cost is only computed when prices are configured, because they change:
// GEMINI_PRICE_INPUT_USD_PER_MTOK and GEMINI_PRICE_OUTPUT_USD_PER_MTOK
// (US$ per million input / output tokens for the model in use).

// The model calls one lead makes on its way to outreach.
const PER_LEAD_OPERATIONS = ['qualification_advisory', 'proposal', 'outreach_email'];

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function prices() {
  const input = Number(process.env.GEMINI_PRICE_INPUT_USD_PER_MTOK);
  const output = Number(process.env.GEMINI_PRICE_OUTPUT_USD_PER_MTOK);
  return input > 0 && output > 0 ? { input, output } : null;
}

function summarize(rows, price) {
  const ok = rows.filter((row) => row.ok);
  const latencies = ok.map((row) => row.latency_ms).sort((a, b) => a - b);
  const sum = (key) => ok.reduce((total, row) => total + (row[key] ?? 0), 0);
  const promptTokens = sum('prompt_tokens');
  const completionTokens = sum('completion_tokens');
  const totalTokens = sum('total_tokens');
  const cost = price ? (promptTokens * price.input + (totalTokens - promptTokens) * price.output) / 1e6 : null;

  return {
    calls: rows.length,
    failures: rows.length - ok.length,
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    p95LatencyMs: percentile(latencies, 95),
    avgTokensPerCall: ok.length ? Math.round(totalTokens / ok.length) : null,
    totalTokens,
    promptTokens,
    completionTokens,
    // Output price applies to every non-prompt token (answer + thinking).
    estimatedCostUsd: cost,
    avgCostUsdPerCall: cost != null && ok.length ? cost / ok.length : null,
  };
}

export async function getAiUsage({ days = 7 } = {}) {
  const window = Math.min(Math.max(Number(days) || 7, 1), 90);
  const rows = await all(
    `SELECT provider, model, operation, ok, latency_ms, prompt_tokens, completion_tokens, total_tokens
     FROM llm_calls WHERE created_at >= NOW() - INTERVAL ? DAY`,
    [window]
  );
  const normalized = rows.map((row) => ({ ...row, ok: Boolean(row.ok) }));
  const price = prices();

  const byOperation = new Map();
  for (const row of normalized) {
    if (!byOperation.has(row.operation)) byOperation.set(row.operation, []);
    byOperation.get(row.operation).push(row);
  }
  const operations = [...byOperation.entries()]
    .map(([operation, opRows]) => ({ operation, ...summarize(opRows, price) }))
    .sort((a, b) => b.calls - a.calls);

  const perLead = operations.filter((op) => PER_LEAD_OPERATIONS.includes(op.operation));
  const perLeadTokens = perLead.length ? perLead.reduce((total, op) => total + (op.avgTokensPerCall ?? 0), 0) : null;
  const perLeadCost = price && perLead.length ? perLead.reduce((total, op) => total + (op.avgCostUsdPerCall ?? 0), 0) : null;

  return {
    days: window,
    models: [...new Set(normalized.map((row) => `${row.provider}/${row.model}`))],
    overall: summarize(normalized, price),
    operations,
    perLead: {
      operations: PER_LEAD_OPERATIONS,
      measured: perLead.map((op) => op.operation),
      avgTokens: perLeadTokens,
      avgCostUsd: perLeadCost,
    },
    pricingConfigured: Boolean(price),
  };
}
