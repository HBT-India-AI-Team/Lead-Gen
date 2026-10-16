import { GeminiClient } from './geminiClient.js';
import { OllamaClient } from './ollamaClient.js';

// Single place that decides which LLM backend the app talks to. Both
// clients expose the same chat()/chatWithMeta() contract, so services
// only ever call createLlmClient() and never name a provider themselves.
//
//   LLM_PROVIDER=gemini (default) -> Gemini API (GEMINI_API_KEY, GEMINI_MODEL)
//   LLM_PROVIDER=ollama           -> local Ollama, offline fallback
//                                    (OLLAMA_BASE_URL, OLLAMA_DEFAULT_MODEL, e.g. gemma3)

export function createLlmClient(options = {}) {
  const provider = (options.provider || process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  if (provider === 'gemini') return new GeminiClient(options);
  if (provider === 'ollama') return new OllamaClient(options);

  throw new Error(`Unknown LLM_PROVIDER "${provider}" — expected "gemini" or "ollama".`);
}
