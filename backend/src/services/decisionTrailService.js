import * as tenderService from './tenderService.js';
import * as tenderProposalRepository from '../repositories/tenderProposalRepository.js';
import * as leadDecisionEventRepository from '../repositories/leadDecisionEventRepository.js';

// Records and reads the per-lead decision trail: every step where the
// rules engine, the AI or a human reviewer decided something about a lead,
// in order, with who decided and why.
//
// Leads processed before lead_decision_events existed have no persisted
// events, so getDecisionTrail() fills each missing step from the latest-
// state columns on tenders/tender_proposals and flags it `derived: true`.
// Those columns only keep the most recent decision, so a derived trail can
// be shorter than what really happened — the UI says so.

/**
 * Appends one event. Best-effort, like activityLogService.logActivity():
 * a failure to write the audit row is logged, never thrown, so it can't
 * fail the qualification/review action that triggered it.
 */
export async function recordDecisionEvent(event) {
  try {
    await leadDecisionEventRepository.insertEvent(event);
  } catch (error) {
    console.error(`[Decision Trail] Failed to record ${event.eventType} for tender ${event.tenderId}:`, error.message);
  }
}

function toEventShape(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    actorType: row.actor_type,
    actor: row.actor,
    decision: row.decision,
    comment: row.comment,
    details: row.details ?? null,
    createdAt: row.created_at,
    derived: false,
  };
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function derivedEvent(eventType, actorType, actor, decision, createdAt, { comment = null, details = null } = {}) {
  return { id: `derived-${eventType}`, eventType, actorType, actor, decision, comment, details, createdAt, derived: true };
}

/** Builds the steps that can be reconstructed from latest-state columns. */
function deriveEvents(tender, proposal) {
  const events = [];
  const reason = parseJson(tender.qualification_reason);

  if (tender.qualification_completed_at && tender.qualification_score != null) {
    events.push(derivedEvent('QUALIFIED', 'RULES', 'Rules engine', tender.lead_status, tender.qualification_completed_at, {
      details: { score: tender.qualification_score },
    }));

    const ai = reason?.aiAnalysis;
    if (ai) {
      const available = ai.status === 'AVAILABLE';
      events.push(derivedEvent('AI_ADVISORY', 'AI', 'AI advisory', available ? ai.classification ?? 'AVAILABLE' : 'UNAVAILABLE', tender.qualification_completed_at, {
        details: available ? { score: ai.score, confidence: ai.confidence, recommendedNextAction: ai.recommendedNextAction ?? null } : { error: ai.error ?? null },
      }));
    }
  }

  if (proposal) {
    const raw = parseJson(proposal.raw_ai_response);
    events.push(derivedEvent('PROPOSAL_GENERATED', 'AI', 'AI proposal agent', raw?.proposalStatus ?? null, proposal.created_at, {
      details: { proposalScore: proposal.proposal_score ?? null, recommendedProduct: parseJson(proposal.recommended_product)?.name ?? null },
    }));

    if (proposal.reviewed_at) {
      events.push(derivedEvent('PROPOSAL_REVIEWED', 'HUMAN', proposal.reviewed_by, proposal.status, proposal.reviewed_at, {
        comment: proposal.review_comment ?? null,
      }));
    }

    if (proposal.communication_approved_at) {
      events.push(derivedEvent('COMMUNICATION_REVIEWED', 'HUMAN', proposal.communication_approved_by, proposal.communication_status, proposal.communication_approved_at, {
        comment: proposal.communication_review_comment ?? null,
      }));
    }
  }

  return events;
}

/**
 * Returns the full decision trail for one lead, oldest first. 404s (via
 * tenderService.getTenderById) if the tender doesn't exist.
 */
export async function getDecisionTrail(tenderId) {
  const tender = await tenderService.getTenderById(tenderId);

  const [rows, proposal] = await Promise.all([
    leadDecisionEventRepository.listByTenderId(tenderId),
    tenderProposalRepository.findLatestGeneratedProposalByTenderId(tenderId),
  ]);

  const persisted = rows.map(toEventShape);
  const persistedTypes = new Set(persisted.map((event) => event.eventType));
  const derived = deriveEvents(tender, proposal).filter((event) => !persistedTypes.has(event.eventType));

  const events = [...derived, ...persisted].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return { tenderId, events, hasDerivedEvents: derived.length > 0 };
}
