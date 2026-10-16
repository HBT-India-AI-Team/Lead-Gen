import * as aiBriefRepository from '../repositories/aiBriefRepository.js';
import { getPipelineSummary } from './pipelineSummaryService.js';
import { createLlmClient } from './llm/llmClient.js';

// "Today's AI Brief" on the Dashboard: Gemini turns the day's real pipeline
// numbers, top-scoring leads and last-24h decisions into three or four
// sentences — what changed, what to act on, what is stuck.
//
// One brief per day (Asia/Kolkata), stored in ai_briefs, so the whole app
// spends one model call a day on it however many people open the
// Dashboard. A failed generation (quota, outage) is remembered for a few
// minutes so page loads don't keep retrying against an exhausted quota.

const BRIEF_TIMEZONE = 'Asia/Kolkata';
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const BULLET_KINDS = ['changed', 'act', 'stuck'];

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    bullets: {
      type: 'array',
      minItems: 3,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: BULLET_KINDS },
          text: { type: 'string' },
          tenderId: { type: ['string', 'null'] },
        },
        required: ['kind', 'text', 'tenderId'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'bullets'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You write the daily brief for relationship managers in a bank's corporate lending team. Their tool turns government tender awards into financing leads, scores them, and routes AI-drafted proposals to human reviewers.

Use ONLY the JSON facts you are given. Never invent a number, company, tender, amount or trend; quote figures exactly as given. If a section of the facts is empty, say so plainly rather than filling the gap.

Write 3 or 4 bullets:
- kind "changed": what happened in the last 24 hours (decisions recorded). If nothing was recorded, say that.
- kind "act": the most valuable leads to act on today — name the winning company, the tender and its score.
- kind "stuck": work waiting in a queue (proposals awaiting review, leads ready for a proposal, leads not yet qualified).
Each bullet is one plain-English sentence under 30 words, no markdown. Set tenderId to the lead's tenderId from the facts when a bullet is about one specific lead, otherwise null.
headline: one sentence under 15 words that sums up the day.`;

let inFlight = null;
let lastFailure = null;

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRIEF_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function truncate(text, max) {
  if (!text) return null;
  const value = String(text).replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function collectFacts(briefDate) {
  const [pipeline, topLeads, recentDecisions] = await Promise.all([
    getPipelineSummary(),
    aiBriefRepository.topQualifiedLeads(5),
    aiBriefRepository.recentDecisionCounts(24),
  ]);

  return {
    date: briefDate,
    pipeline: {
      totalLeads: pipeline.totalLeads,
      qualification: pipeline.qualification,
      notYetQualified: pipeline.awaitingHealthCheck,
      readyForProposal: pipeline.awaitingProposal,
      proposalsAwaitingReview: pipeline.awaitingProposalReview,
      proposals: pipeline.proposal,
      outreach: pipeline.communication,
    },
    topLeads: topLeads.map((lead) => ({
      tenderId: lead.tender_id,
      tender: truncate(lead.title, 140),
      winningCompany: lead.winning_company_name,
      winningBid: lead.winning_bid_amount ?? lead.amount,
      state: lead.tender_state,
      score: lead.qualification_score,
      leadStatus: lead.lead_status,
      pipelineStatus: lead.pipeline_status,
    })),
    last24Hours: recentDecisions.map((row) => ({
      step: row.event_type,
      by: row.actor_type,
      decision: row.decision,
      count: Number(row.count),
    })),
  };
}

/** Keeps only well-formed bullets, and only lead links to leads that were actually in the facts. */
function sanitize(data, facts) {
  const knownLeads = new Set(facts.topLeads.map((lead) => lead.tenderId));
  const bullets = (Array.isArray(data?.bullets) ? data.bullets : [])
    .filter((bullet) => BULLET_KINDS.includes(bullet?.kind) && typeof bullet.text === 'string' && bullet.text.trim())
    .map((bullet) => ({ kind: bullet.kind, text: bullet.text.trim(), tenderId: knownLeads.has(bullet.tenderId) ? bullet.tenderId : null }));
  const headline = typeof data?.headline === 'string' ? data.headline.trim() : '';

  if (!headline || bullets.length === 0) {
    throw new Error('The model returned an empty brief.');
  }
  return { headline, bullets: bullets.slice(0, 4) };
}

async function generate(briefDate) {
  const facts = await collectFacts(briefDate);
  const client = createLlmClient();
  const started = Date.now();
  const { data, usage } = await client.chatWithMeta({
    system: SYSTEM_PROMPT,
    user: `Facts for ${briefDate}:\n${JSON.stringify(facts, null, 2)}`,
    schema: BRIEF_SCHEMA,
    temperature: 0.3,
  });
  const { headline, bullets } = sanitize(data, facts);

  return aiBriefRepository.insertBrief({
    briefDate,
    headline,
    bullets,
    facts,
    model: client.model,
    provider: client.provider,
    tokenUsage: usage,
    latencyMs: Date.now() - started,
  });
}

/** Short, user-facing reason for a failed generation; the raw error goes to the server log. */
function friendlyReason(message = '') {
  if (/HTTP 429/.test(message)) return 'the Gemini quota is used up for now';
  if (/HTTP 503/.test(message)) return 'Gemini is overloaded right now';
  if (/timed out/i.test(message)) return 'Gemini took too long to respond';
  if (/API key|GEMINI_API_KEY|OLLAMA_BASE_URL/.test(message)) return 'no AI provider is configured on the server';
  return 'the AI service returned an error';
}

function toResponse(row, briefDate) {
  return {
    status: 'ready',
    date: briefDate,
    headline: row.headline,
    bullets: row.bullets,
    model: row.model,
    provider: row.provider,
    generatedAt: row.generated_at,
    latencyMs: row.latency_ms,
    tokenUsage: row.token_usage,
    basedOn: {
      totalLeads: row.facts?.pipeline?.totalLeads ?? null,
      topLeads: row.facts?.topLeads?.length ?? 0,
      decisionsLast24Hours: (row.facts?.last24Hours ?? []).reduce((sum, item) => sum + item.count, 0),
    },
  };
}

/**
 * Today's brief: the stored one if it exists, otherwise generated now (one
 * generation at a time per instance). Never throws for a model failure —
 * returns { status: 'unavailable', reason } so the Dashboard can say so.
 */
export async function getTodaysBrief() {
  const briefDate = todayInIndia();
  const existing = await aiBriefRepository.findByDate(briefDate);
  if (existing) return toResponse(existing, briefDate);

  if (lastFailure && lastFailure.date === briefDate && Date.now() - lastFailure.at < FAILURE_COOLDOWN_MS) {
    return { status: 'unavailable', date: briefDate, reason: lastFailure.reason, retryAfterSeconds: Math.ceil((FAILURE_COOLDOWN_MS - (Date.now() - lastFailure.at)) / 1000) };
  }

  if (!inFlight) {
    inFlight = generate(briefDate).finally(() => {
      inFlight = null;
    });
  }

  try {
    const row = await inFlight;
    lastFailure = null;
    return toResponse(row, briefDate);
  } catch (error) {
    console.error('[AI Brief] Generation failed:', error.message);
    lastFailure = { date: briefDate, at: Date.now(), reason: friendlyReason(error.message) };
    return { status: 'unavailable', date: briefDate, reason: lastFailure.reason, retryAfterSeconds: Math.ceil(FAILURE_COOLDOWN_MS / 1000) };
  }
}

/**
 * Which LLM provider and model the backend is configured to use, without
 * calling it (no quota spent). `configured: false` with the reason when
 * the provider can't be constructed, e.g. a missing API key.
 */
export function getAiStatus() {
  try {
    const client = createLlmClient();
    return { configured: true, provider: client.provider, model: client.model };
  } catch (error) {
    return { configured: false, provider: process.env.LLM_PROVIDER || 'gemini', model: null, reason: error.message };
  }
}
