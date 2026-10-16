// Gemini client failure handling against a local fake Gemini server, plus
// the outreach-email template fallback. No real API key or database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// The client logs every call to MySQL. Point it at a closed port before
// anything loads .env, so a test run can never write to a real database.
process.env.DB_SOCKET = '';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';

const { GeminiClient } = await import('../src/services/llm/geminiClient.js');
const { generateProposalEmail } = await import('../src/services/emailGenerator.js');

function quotaError(res, retryDelay) {
  res.writeHead(429, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota.',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
      ],
    },
  }));
}

// Behaviour is chosen by the model name in the URL.
const calls = new Map();
const server = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const model = decodeURIComponent((req.url.match(/models\/([^:]+):/) || [])[1] || '');
    const count = (calls.get(model) || 0) + 1;
    calls.set(model, count);
    if (model === 'quota-daily') return quotaError(res, '66767s');
    if (model === 'quota-minute' && count === 1) return quotaError(res, '1s');
    if (model === 'overloaded') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    }));
  });
});

let baseUrl;
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const client = (model) => new GeminiClient({ apiKey: 'test', baseUrl, model, retries: 2, retryDelayMs: 50 });

test('a daily quota error fails fast without retrying', async () => {
  const started = Date.now();
  await assert.rejects(client('quota-daily').chatWithMeta({ user: 'hi', operation: 'test' }), (error) => {
    assert.equal(error.code, 'LLM_QUOTA_EXHAUSTED');
    assert.equal(error.retryAfterSeconds, 66767);
    return true;
  });
  assert.ok(Date.now() - started < 1500, 'must not wait out an 18-hour quota');
  assert.equal(calls.get('quota-daily'), 1);
});

test('a per-minute limit waits as long as Google asks, then succeeds', async () => {
  const started = Date.now();
  const { data } = await client('quota-minute').chatWithMeta({ user: 'hi', operation: 'test' });
  assert.deepEqual(data, { ok: true });
  assert.ok(Date.now() - started >= 900, 'should wait about 1s');
  assert.equal(calls.get('quota-minute'), 2);
});

test('an overloaded model is retried, then reported as transient', async () => {
  await assert.rejects(client('overloaded').chatWithMeta({ user: 'hi', operation: 'test' }), (error) => {
    assert.equal(error.transient, true);
    assert.notEqual(error.code, 'LLM_QUOTA_EXHAUSTED');
    return true;
  });
  assert.equal(calls.get('overloaded'), 3);
});

test('a successful call returns parsed JSON and token usage', async () => {
  const { data, usage } = await client('fine').chatWithMeta({ user: 'hi', operation: 'test' });
  assert.deepEqual(data, { ok: true });
  assert.deepEqual(usage, { prompt: 10, completion: 5, total: 15 });
});

test('the outreach email falls back to the template when Gemini fails', async () => {
  const failing = { chat: async () => { throw new Error('quota'); } };
  const email = await generateProposalEmail(
    { name: 'Acme Infra Pvt Ltd', sector: 'Works Contract', focus_area: 'Road construction', tags: [] },
    { trigger_signal: 'Won a state highway resurfacing tender' },
    { llmClient: failing }
  );
  assert.match(email, /^Dear Acme Infra Pvt Ltd Team,/);
  assert.match(email, /Relationship Manager Team$/);
});
