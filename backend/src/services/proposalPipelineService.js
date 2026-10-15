import * as tenderService from './tenderService.js';
import * as tenderRepository from '../repositories/tenderRepository.js';
import * as tenderProposalRepository from '../repositories/tenderProposalRepository.js';
import { collectProposalEvidence } from './qualification/proposalEvidenceCollectorService.js';
import { ProposalGenerationService } from './llm/proposalGenerationService.js';
import { ApiError } from '../utils/ApiError.js';
import { recordDecisionEvent } from './decisionTrailService.js';

// PHASE 2 Proposal Generation workflow entry point:
//   QUALIFIED_GOOD (READY_FOR_PROPOSAL) -> collect real evidence -> LLM
//   Proposal Agent -> validate -> persist -> AWAITING_PROPOSAL_REVIEW.
// Sibling to leadQualificationPipelineService.js (PHASE 1), same
// orchestration shape: load the real tender, enforce the deterministic gate
// (never let the LLM decide it), call the AI, persist every real result,
// return the tender as actually re-read from MySQL afterward.
//
// The deterministic qualification result (lead_status/pipeline_status/
// qualification_score) is 100% authoritative here — this file only ever
// READS those columns to decide eligibility and to feed them into the
// evidence bundle. It never writes qualification_score/lead_status, and
// pipeline_status is only ever moved forward to AWAITING_PROPOSAL_REVIEW,
// never used to re-derive or second-guess the qualification outcome.

const ELIGIBLE_PIPELINE_STATUSES = ['READY_FOR_PROPOSAL', 'AWAITING_PROPOSAL_REVIEW'];

const proposalGenerationService = new ProposalGenerationService();

/**
 * Throws a 409 ApiError (not a generic 500) when the tender's real,
 * persisted qualification state doesn't authorize proposal generation —
 * QUALIFIED_HITL and QUALIFIED_BAD leads are rejected here, per PHASE 2
 * spec §2, before any evidence is collected or the LLM is ever called.
 * AWAITING_PROPOSAL_REVIEW is also accepted (not just READY_FOR_PROPOSAL)
 * so re-generating an existing proposal for the same lead (idempotent
 * re-run, PHASE 2 spec §11) is not itself blocked by the first run's own
 * forward transition.
 */
function assertEligibleForProposal(tender) {
  const eligible = tender.lead_status === 'QUALIFIED_GOOD' && ELIGIBLE_PIPELINE_STATUSES.includes(tender.pipeline_status);

  if (!eligible) {
    throw ApiError.conflict(
      `Tender "${tender.tender_id}" is not eligible for proposal generation. ` +
      `Requires lead_status "QUALIFIED_GOOD" (current: "${tender.lead_status}") and pipeline_status ` +
      `"READY_FOR_PROPOSAL" or "AWAITING_PROPOSAL_REVIEW" (current: "${tender.pipeline_status}"). ` +
      'Run qualification first (POST /api/leads/:id/qualify) if this lead has not reached that state.'
    );
  }
}

/**
 * Runs the full PHASE 2 workflow for one tender. Throws (never persists a
 * fabricated fallback) if the tender isn't eligible, if the LLM is
 * unreachable, or if its response fails validation — see
 * proposalGenerationService.js's #validate() for the exact response
 * contract enforced. On success, persists the validated proposal
 * (creating or updating the tender's existing generated proposal — see
 * tenderProposalRepository.upsertGeneratedProposal()'s idempotency doc)
 * and advances pipeline_status to AWAITING_PROPOSAL_REVIEW without
 * touching lead_status.
 */
export async function generateProposal(tenderId) {
  const tender = await tenderService.getTenderById(tenderId);

  assertEligibleForProposal(tender);

  const evidence = await collectProposalEvidence(tender);
  const draft = await proposalGenerationService.generate(evidence);

  const { id, created } = await tenderProposalRepository.upsertGeneratedProposal(tenderId, {
    winningCompanyName: tender.winning_company_name,
    proposalSummary: draft.rationale.join(' '),
    emailBody: draft.email.body,
    emailSubject: draft.email.subject,
    recommendedProduct: draft.recommendedProduct,
    estimatedFundingRequirement: draft.estimatedFundingRequirement,
    proposalScore: draft.proposalScore,
    rationale: draft.rationale,
    missingInformation: draft.missingInformation,
    rawAiResponse: draft,
    status: draft.proposalStatus,
  });

  await tenderRepository.updatePipelineTransition(tenderId, {
    pipelineStatus: 'AWAITING_PROPOSAL_REVIEW',
    leadStatus: tender.lead_status,
  });

  await recordDecisionEvent({
    tenderId,
    eventType: 'PROPOSAL_GENERATED',
    actorType: 'AI',
    actor: proposalGenerationService.llmClient?.model ?? 'AI proposal agent',
    decision: draft.proposalStatus,
    details: {
      proposalScore: draft.proposalScore,
      recommendedProduct: draft.recommendedProduct?.name ?? null,
      missingInformation: draft.missingInformation,
      regenerated: !created,
    },
  });

  const [proposal, refreshedTender] = await Promise.all([
    tenderProposalRepository.getById(id),
    tenderService.getTenderById(tenderId),
  ]);

  return { created, proposal, tender: refreshedTender };
}

// ==================================================================
// PHASE 3 — Proposal Review (HITL): retrieve + record a human decision on
// an already-generated proposal. Qualification/proposal-generation above
// are completely untouched by anything below; this only ever reads
// tenders (to confirm it's real) and reads/writes tender_proposals rows
// that ALREADY exist — it never creates a proposal as a side effect of a
// review (PHASE 3 spec §6).
// ==================================================================

// A review decision moving a proposal to one of these is final — matches
// this app's existing "Approved" proposal UX (LeadDetails.tsx's
// HumanReviewCard already hides its action buttons once Approved); once
// APPROVED or REJECTED here, a second review attempt is rejected rather
// than silently overwriting the first reviewer's decision.
const TERMINAL_REVIEW_STATUSES = ['APPROVED', 'REJECTED'];

/**
 * Shapes a raw `tender_proposals` row into the PHASE 3 response contract
 * (spec §9) — only fields actually persisted are ever included; nothing is
 * invented for a field that's still NULL (e.g. a proposal not yet
 * reviewed has reviewComment/reviewedBy/reviewedAt all null).
 */
function toProposalReviewShape(tenderId, row) {
  return {
    tenderId,
    proposalStatus: row.status,
    recommendedProduct: row.recommended_product ?? null,
    estimatedFundingRequirement: row.estimated_funding_requirement ?? null,
    proposalScore: row.proposal_score ?? null,
    rationale: row.rationale ?? [],
    missingInformation: row.missing_information ?? [],
    emailDraft: { subject: row.email_subject ?? null, body: row.email_draft ?? null },
    reviewComment: row.review_comment ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Retrieves the real, persisted generated proposal for one tender.
 * 404s (via tenderService.getTenderById, reused unchanged) if the tender
 * itself doesn't exist; 404s separately if the tender exists but has no
 * generated proposal yet — a lead sitting at QUALIFIED_HITL/QUALIFIED_BAD,
 * or even QUALIFIED_GOOD but never proposed, correctly has nothing to
 * retrieve here (PHASE 3 spec §6).
 */
export async function getProposalForLead(tenderId) {
  await tenderService.getTenderById(tenderId);

  const row = await tenderProposalRepository.findLatestGeneratedProposalByTenderId(tenderId);
  if (!row) {
    throw ApiError.notFound(`No generated proposal exists for tender "${tenderId}".`);
  }

  return toProposalReviewShape(tenderId, row);
}

/**
 * Records a human review decision on an already-generated proposal.
 * `decision` is assumed already validated against the allowed enum by the
 * caller (leadController.reviewProposal — a 400 there for an invalid
 * value, matching this codebase's existing input-validation-lives-in-the-
 * controller convention, e.g. userController.changePassword). 404s if no
 * generated proposal exists (never creates one); 409s if the proposal was
 * already APPROVED/REJECTED by an earlier review. `reviewedBy` must be the
 * real authenticated caller's name/email — never fabricated.
 */
export async function reviewProposal(tenderId, { decision, reviewComment }, reviewedBy) {
  await tenderService.getTenderById(tenderId);

  const row = await tenderProposalRepository.findLatestGeneratedProposalByTenderId(tenderId);
  if (!row) {
    throw ApiError.notFound(`No generated proposal exists for tender "${tenderId}" to review.`);
  }

  if (TERMINAL_REVIEW_STATUSES.includes(row.status)) {
    throw ApiError.conflict(
      `Proposal for tender "${tenderId}" has already been finalized (status: "${row.status}") and cannot be reviewed again.`
    );
  }

  const updated = await tenderProposalRepository.recordProposalReview(row.id, { status: decision, reviewComment, reviewedBy });

  await recordDecisionEvent({
    tenderId,
    eventType: 'PROPOSAL_REVIEWED',
    actorType: 'HUMAN',
    actor: reviewedBy,
    decision,
    comment: reviewComment ?? null,
    details: { previousStatus: row.status },
  });

  return toProposalReviewShape(tenderId, updated);
}