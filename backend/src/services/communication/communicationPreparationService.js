import * as tenderService from '../tenderService.js';
import * as tenderProposalRepository from '../../repositories/tenderProposalRepository.js';
import { ApiError } from '../../utils/ApiError.js';
import { recordDecisionEvent } from '../decisionTrailService.js';

// PHASE 4 — Communication Preparation + Communication Review. Sibling to
// proposalPipelineService.js (PHASE 2/3), same layered shape: read the real
// tender + the real already-generated proposal directly from their
// existing repositories, gate on the real persisted state, never call
// Ollama, never regenerate the proposal.
//
// PHASE 4 spec §7 explicitly prefers reusing the already-approved
// proposal's email draft over generating a second one — the approved
// proposal's `email_subject`/`email_draft` (PHASE 2, human-reviewed in
// PHASE 3) already IS the customer-facing communication content. Since
// that content is already real, already validated, and already approved
// by a human, calling Ollama again here would only risk producing content
// that no longer matches what was actually approved — so this file never
// imports OllamaClient/creates a second Ollama client, per spec §7/§8's
// "only if genuinely required" gate. If a future phase genuinely needs a
// distinct customer-facing rewrite, that belongs in a new
// communicationPromptBuilder.js/communicationGenerationService.js pair
// (mirroring qualificationAiAnalysisService.js's pattern) — not here.

// Communication only ever exists after the proposal itself was approved by
// a human (PHASE 3) — never for QUALIFIED_BAD/QUALIFIED_HITL (no proposal
// exists at all for those, so the 404 below already covers them) and never
// for READY_FOR_REVIEW/NEEDS_HUMAN_REVIEW/CHANGES_REQUESTED/ON_HOLD/
// REJECTED proposals.
const APPROVED_PROPOSAL_STATUS = 'APPROVED';

// A communication review decision landing on one of these is final, same
// pattern as PHASE 3's TERMINAL_REVIEW_STATUSES — ON_HOLD stays revisable
// (a reviewer can come back to it later), but once a proposal is either
// cleared for sending or rejected, a second decision is refused rather
// than silently overwriting the first reviewer's call.
const TERMINAL_COMMUNICATION_STATUSES = ['AWAITING_SEND_APPROVAL', 'REJECTED'];

const COMMUNICATION_DECISION_TO_STATUS = {
  APPROVE: 'AWAITING_SEND_APPROVAL',
  ON_HOLD: 'ON_HOLD',
  REJECT: 'REJECTED',
};

/**
 * No column anywhere in the schema represents the WINNING company's real
 * contact channel — Probe42 profiles (annual_revenue/net_profit/
 * credit_rating/compliance_status/director_count) have no email/phone
 * field, and the only contact-shaped columns on `tenders`
 * (email/phone/contact_person/cin/gst and buyer_contact_person/phone/
 * email) are either empty in every real row today or, per
 * healthCheckService.js's own documented finding, represent the
 * tender-ISSUING BUYER (e.g. "Central Railway"), not the customer this
 * communication is actually for. Wiring either would misattribute the
 * wrong party's contact info even on the rare row where one is non-null —
 * so this always returns null, honestly, per PHASE 4 spec §2/§9.
 */
function resolveContactInfo() {
  return { contactEmail: null, contactName: null, phone: null };
}

/**
 * Shapes a raw `tender_proposals` row (already confirmed APPROVED) into
 * the PHASE 4 response contract. Reuses email_subject/email_draft as the
 * communication subject/body — no separate communication email fields
 * exist or are needed.
 */
function toCommunicationShape(tenderId, row) {
  const { contactEmail, contactName, phone } = resolveContactInfo();

  return {
    tenderId,
    proposalStatus: row.status,
    communicationStatus: row.communication_status ?? null,
    recommendedProduct: row.recommended_product ?? null,
    proposalScore: row.proposal_score ?? null,
    rationale: row.rationale ?? [],
    missingInformation: row.missing_information ?? [],
    contactEmail,
    contactName,
    phone,
    subject: row.email_subject ?? null,
    body: row.email_draft ?? null,
    reviewComment: row.communication_review_comment ?? null,
    reviewedBy: row.communication_approved_by ?? null,
    reviewedAt: row.communication_approved_at ?? null,
  };
}

/**
 * Loads the real tender + its real generated proposal and confirms the
 * proposal is genuinely APPROVED. 404s if the tender doesn't exist, 404s
 * separately if no generated proposal exists at all (covers
 * QUALIFIED_BAD/QUALIFIED_HITL — proposal generation was never allowed for
 * them, so there is nothing here to find), and 409s if a proposal exists
 * but hasn't been approved yet (READY_FOR_REVIEW, NEEDS_HUMAN_REVIEW,
 * CHANGES_REQUESTED, ON_HOLD, or REJECTED).
 */
async function loadApprovedProposal(tenderId) {
  await tenderService.getTenderById(tenderId);

  const row = await tenderProposalRepository.findLatestGeneratedProposalByTenderId(tenderId);
  if (!row) {
    throw ApiError.notFound(`No generated proposal exists for tender "${tenderId}".`);
  }

  if (row.status !== APPROVED_PROPOSAL_STATUS) {
    throw ApiError.conflict(
      `Tender "${tenderId}"'s proposal is not approved yet (current proposal status: "${row.status}"). ` +
      'Communication preparation requires proposal.status = "APPROVED".'
    );
  }

  return row;
}

/**
 * Retrieves the real communication state/draft for one tender. Never
 * creates anything — `communicationStatus` is simply null if
 * prepareCommunication() hasn't been called yet.
 */
export async function getCommunicationForLead(tenderId) {
  const row = await loadApprovedProposal(tenderId);
  return toCommunicationShape(tenderId, row);
}

/**
 * Prepares the communication draft for an APPROVED proposal — sets
 * `communication_status = 'DRAFT_READY'`, reusing the proposal's own
 * email_subject/email_draft unchanged as the draft. Idempotent: if
 * preparation already happened and it's still DRAFT_READY, this is a
 * harmless no-op re-affirmation; if it already moved past DRAFT_READY
 * (AWAITING_SEND_APPROVAL/ON_HOLD/REJECTED via a human Communication
 * Review decision), re-running preparation must NOT regress that human
 * decision back to DRAFT_READY — it just returns the current state as-is.
 */
export async function prepareCommunication(tenderId) {
  const row = await loadApprovedProposal(tenderId);

  const alreadyDecided = Boolean(row.communication_status) && row.communication_status !== 'DRAFT_READY';
  const updated = alreadyDecided
    ? row
    : await tenderProposalRepository.recordCommunicationPreparation(row.id, { communicationStatus: 'DRAFT_READY' });

  // Only the first preparation is a decision; re-running it is a no-op.
  if (!row.communication_status) {
    await recordDecisionEvent({
      tenderId,
      eventType: 'COMMUNICATION_PREPARED',
      actorType: 'SYSTEM',
      actor: 'Communication pipeline',
      decision: 'DRAFT_READY',
    });
  }

  return toCommunicationShape(tenderId, updated);
}

/**
 * Records a human Communication Review decision (APPROVE/ON_HOLD/REJECT —
 * validated by the caller, leadController.reviewCommunication, same
 * controller-validates convention as PHASE 3). 404s if no communication
 * draft has been prepared yet (never creates one as a side effect); 409s
 * if the communication was already finalized (AWAITING_SEND_APPROVAL or
 * REJECTED) by an earlier decision. `reviewedBy` must be the real
 * authenticated caller — never fabricated.
 */
export async function reviewCommunication(tenderId, { decision, reviewComment }, reviewedBy) {
  const row = await loadApprovedProposal(tenderId);

  if (!row.communication_status) {
    throw ApiError.notFound(`No communication draft has been prepared for tender "${tenderId}" yet.`);
  }

  if (TERMINAL_COMMUNICATION_STATUSES.includes(row.communication_status)) {
    throw ApiError.conflict(
      `Communication for tender "${tenderId}" has already been finalized (status: "${row.communication_status}") and cannot be reviewed again.`
    );
  }

  const communicationStatus = COMMUNICATION_DECISION_TO_STATUS[decision];
  const updated = await tenderProposalRepository.recordCommunicationReview(row.id, { communicationStatus, reviewComment, reviewedBy });

  await recordDecisionEvent({
    tenderId,
    eventType: 'COMMUNICATION_REVIEWED',
    actorType: 'HUMAN',
    actor: reviewedBy,
    decision,
    comment: reviewComment ?? null,
    details: { resultingStatus: communicationStatus, previousStatus: row.communication_status },
  });

  return toCommunicationShape(tenderId, updated);
}