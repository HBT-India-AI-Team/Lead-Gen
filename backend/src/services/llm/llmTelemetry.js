import { run } from '../../config/database.js';

// One row per model call in llm_calls (latency, tokens, outcome, which
// feature made it) plus one log line, so cost-per-lead and latency claims
// are measured rather than estimated. Fire-and-forget: a telemetry failure
// is logged and never reaches the caller.

export function recordLlmCall({ provider, model, operation, ok, latencyMs, attempts, usage, errorCode }) {
  const tokens = usage?.total ?? 0;
  console.log(
    `[LLM] ${provider} ${model} op=${operation} ${ok ? 'ok' : `failed(${errorCode})`} ${latencyMs}ms attempts=${attempts}${ok ? ` tokens=${tokens}` : ''}`
  );

  run(
    `INSERT INTO llm_calls (provider, model, operation, ok, error_code, latency_ms, attempts, prompt_tokens, completion_tokens, total_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [provider, model, operation, ok ? 1 : 0, errorCode ?? null, latencyMs, attempts, usage?.prompt ?? null, usage?.completion ?? null, usage?.total ?? null]
  ).catch((error) => {
    console.warn('[LLM] Could not record call telemetry:', error.message);
  });
}
