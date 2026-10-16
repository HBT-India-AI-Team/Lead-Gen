import { exec } from '../../config/database.js';

// Per-call LLM telemetry (see services/llm/llmTelemetry.js): what each
// model call cost in tokens and time, and whether it succeeded.

export async function ensureLlmCallsSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS llm_calls (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(30) NOT NULL,
      model VARCHAR(100) NOT NULL,
      operation VARCHAR(60) NOT NULL,
      ok BOOLEAN NOT NULL,
      error_code VARCHAR(60) NULL,
      latency_ms INT NOT NULL,
      attempts INT NOT NULL DEFAULT 1,
      prompt_tokens INT NULL,
      completion_tokens INT NULL,
      total_tokens INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_llm_calls_created (created_at),
      INDEX idx_llm_calls_operation (operation, created_at)
    );
  `);
}
