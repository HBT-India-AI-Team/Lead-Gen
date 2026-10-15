import * as tenderService from '../services/tenderService.js';
import { qualifyLead } from '../services/leadQualificationPipelineService.js';
import { generateProposal, getProposalForLead, reviewProposal } from '../services/proposalPipelineService.js';
import {
  getCommunicationForLead,
  prepareCommunication,
  reviewCommunication,
} from '../services/communication/communicationPreparationService.js';
import { getPipelineSummary } from '../services/pipelineSummaryService.js';
import { getDecisionTrail } from '../services/decisionTrailService.js';
import { listSignalCategories, listSignals } from '../services/leadSignalService.js';
import * as tenderProposalRepository from '../repositories/tenderProposalRepository.js';
import { findMissingFields } from '../utils/validators.js';
import { ApiError } from '../utils/ApiError.js';

// PHASE 3: the only review decisions a human can record on an already-
// generated proposal — matches the recommended lifecycle states from the
// PHASE 3 spec exactly. Validated here (controller layer), same convention
// as userController.changePassword's own body validation.
const REVIEW_DECISIONS = ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'ON_HOLD'];

// PHASE 4: the only decisions a human can record on a prepared
// communication draft. Deliberately distinct verb tense from
// REVIEW_DECISIONS above ("APPROVE" vs "APPROVED") — matches the PHASE 4
// spec's own request body example exactly.
const COMMUNICATION_REVIEW_DECISIONS = ['APPROVE', 'ON_HOLD', 'REJECT'];

/** Real authenticated reviewer's display name, falling back to their email — never a fabricated identity. Shared by both PHASE 3's review() and PHASE 4's reviewCommunicationHandler() below. */
function resolveReviewerIdentity(req) {
  const reviewerName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim();
  return reviewerName || req.user.email;
}

// A "lead" is a `tenders` row carrying the PHASE 1 pipeline_status/
// lead_status/qualification_* columns (see
// src/db/migrations/addLeadQualificationSchema.js) — list/lookup are thin
// pass-throughs to the existing, already-filtered tenderService so this
// never duplicates that query logic; qualify() is the one new write action.

// GET /api/leads/pipeline-summary — PHASE 5: the one new read-only
// aggregation endpoint this phase adds (see pipelineSummaryService.js's
// header for exactly why it was necessary). Registered before GET /:id in
// routes/leads.js so this literal path is never swallowed by that
// single-segment wildcard.
export async function pipelineSummary(req, res, next) {
  try {
    const result = await getPipelineSummary();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/leads/signal-categories — Dashboard Lead Category dropdown
// options: real signal_type values that currently have at least one real
// lead_signals row, each with its real live count. Registered before
// GET /:id (same ordering discipline as /pipeline-summary above).
export async function signalCategories(req, res, next) {
  try {
    const categories = await listSignalCategories();
    return res.status(200).json({ categories });
  } catch (error) {
    return next(error);
  }
}

// GET /api/leads/signals — real, paginated lead_signals rows, optionally
// filtered to one signal_type (?signal_type=GST_REGISTRATION). Backs the
// Dashboard Lead Category filter's results list — never the `tenders`
// table, since a CIN-keyed signal type has no safe way to resolve back to
// one specific tender (see leadSignalRepository.js's header comment on
// this section).
export async function signals(req, res, next) {
  try {
    const { signal_type: signalType, page, limit } = req.query;
    const result = await listSignals({ signalType, page, limit });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/leads — same search/category/state/district/etc. filters as
// GET /api/tenders (tenderService.listTenders already supports them all);
// every returned row now also carries pipeline_status/lead_status/
// qualification_score/qualification_reason (plus PHASE 7's
// lead_signal_category/human_reviewed — see tenderRepository.listTenders()).
//
// Unlike tenderController.list (GET /api/tenders), this previously forwarded
// req.query as-is with NO snake_case -> camelCase remapping. That silently
// broke every Analytics Lead Records filter that only has a snake_case
// query-string name and no matching camelCase key in
// tenderRepository.listTenders()'s destructuring (lead_category, has_winner,
// amount_range, date_range, date_from, date_to) — the filter was accepted,
// parsed as "not present", and quietly ignored. pipeline_status/ai_human
// were the only two that happened to work, because they're the only ones
// tenderRepository.listTenders() also aliases by their raw snake_case key.
// Now mirrors tenderController.list's own remapping exactly, so every real
// filter tenderRepository.listTenders() supports actually reaches it here
// too — no change to that shared repository function's contract.
export async function list(req, res, next) {
  try {
    const {
      search,
      category,
      source,
      state,
      district,
      lead_category: leadCategory,
      has_winner: hasWinner,
      amount_range: amountRange,
      date_range: dateRange,
      date_from: dateFrom,
      date_to: dateTo,
      pipeline_status: pipelineStatus,
      proposal_status: proposalStatus,
      ai_human: aiHuman,
      page,
      limit,
      sort_by: sortBy,
      order,
    } = req.query;

    const result = await tenderService.listTenders({
      search,
      category,
      source,
      state,
      district,
      leadCategory,
      hasWinner,
      amountRange,
      dateRange,
      dateFrom,
      dateTo,
      pipelineStatus,
      proposalStatus,
      aiHuman,
      page,
      limit,
      sortBy,
      order,
    });

    // Analytics Lead Records' AI/Human column needs the real proposal/
    // communication funnel stage (READY_FOR_REVIEW/APPROVED/DRAFT_READY/
    // AWAITING_SEND_APPROVAL/...), which PHASE 7's human_reviewed boolean
    // can't express on its own. One batched IN (...) query for just this
    // page's tender_ids — never one call per row (see
    // tenderProposalRepository.getProposalStateByTenderIds's own header for
    // why this can never become an N+1). A tender with no real generated
    // proposal simply gets proposal_status/communication_status: null.
    const tenderIds = result.tenders.map((tender) => tender.tender_id);
    const proposalStates = await tenderProposalRepository.getProposalStateByTenderIds(tenderIds);
    const proposalStateByTenderId = new Map(proposalStates.map((row) => [row.tenderId, row]));

    const tenders = result.tenders.map((tender) => {
      const proposalState = proposalStateByTenderId.get(tender.tender_id);
      return {
        ...tender,
        proposal_status: proposalState?.status ?? null,
        communication_status: proposalState?.communicationStatus ?? null,
      };
    });

    return res.status(200).json({ ...result, tenders });
  } catch (error) {
    return next(error);
  }
}

// GET /api/leads/:id — :id is the tender's natural key (tender_id), same
// convention as GET /api/tenders/:tenderId.
export async function getById(req, res, next) {
  try {
    const lead = await tenderService.getTenderById(req.params.id);
    return res.status(200).json({ lead });
  } catch (error) {
    return next(error);
  }
}

// POST /api/leads/:id/qualify — runs the deterministic PHASE 1 workflow
// (IDENTIFYING -> READY_FOR_QUALIFY -> QUALIFYING -> QUALIFIED_BAD/HITL/GOOD)
// end to end and returns the persisted result.
export async function qualify(req, res, next) {
  try {
    const lead = await qualifyLead(req.params.id);
    return res.status(200).json({ lead });
  } catch (error) {
    return next(error);
  }
}

// POST /api/leads/:id/proposal — PHASE 2: real-evidence collection ->
// Ollama Proposal Agent -> validated JSON -> persisted proposal ->
// pipeline_status advanced to AWAITING_PROPOSAL_REVIEW. Rejects with 409
// (via proposalPipelineService.assertEligibleForProposal, surfaced by the
// global error handler) when the lead isn't QUALIFIED_GOOD — never
// generates a proposal for a QUALIFIED_HITL/QUALIFIED_BAD lead.
export async function proposal(req, res, next) {
  try {
    const result = await generateProposal(req.params.id);
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/leads/:id/proposal — PHASE 3: retrieves the real, already-
// persisted generated proposal for one tender. 404s (via
// proposalPipelineService.getProposalForLead) if the tender doesn't exist,
// or separately if it exists but has no generated proposal yet — never
// fabricates one.
export async function getProposal(req, res, next) {
  try {
    const result = await getProposalForLead(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// PATCH /api/leads/:id/proposal/review — PHASE 3: records a human decision
// (APPROVED/CHANGES_REQUESTED/REJECTED/ON_HOLD) plus an optional comment on
// an already-generated proposal. 400s on a missing/invalid decision before
// touching the database; the service layer 404s if no generated proposal
// exists and 409s if this proposal was already finalized. `reviewedBy` is
// the real authenticated caller (req.user, from the existing JWT auth
// middleware already applied to this whole router) — never invented.
export async function review(req, res, next) {
  try {
    const missing = findMissingFields(req.body, ['decision']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }

    const { decision, reviewComment } = req.body;
    if (!REVIEW_DECISIONS.includes(decision)) {
      throw ApiError.badRequest(`"decision" must be one of: ${REVIEW_DECISIONS.join(', ')}.`);
    }

    const result = await reviewProposal(req.params.id, { decision, reviewComment }, resolveReviewerIdentity(req));
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/leads/:id/communication — PHASE 4: retrieves the real
// communication draft (reused from the approved proposal's own
// email_subject/email_draft) plus its real preparation/review state.
// 404s if the tender doesn't exist or has no generated proposal; 409s if
// a proposal exists but isn't APPROVED yet — never fabricates a draft.
export async function getCommunication(req, res, next) {
  try {
    const result = await getCommunicationForLead(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// POST /api/leads/:id/communication/prepare — PHASE 4: marks an APPROVED
// proposal's communication draft as prepared (communication_status =
// DRAFT_READY). Never calls Ollama, never regenerates the proposal — reuses
// its existing email draft unchanged. Idempotent; never regresses a later
// human Communication Review decision back to DRAFT_READY.
export async function prepareCommunicationHandler(req, res, next) {
  try {
    const result = await prepareCommunication(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// PATCH /api/leads/:id/communication/review — PHASE 4: records a human
// Communication Review decision (APPROVE -> AWAITING_SEND_APPROVAL,
// ON_HOLD, or REJECT -> REJECTED) plus an optional comment. 400s on a
// missing/invalid decision; the service layer 404s if no communication
// draft has been prepared and 409s if it was already finalized.
// `reviewedBy` is the real authenticated caller — never invented.
export async function reviewCommunicationHandler(req, res, next) {
  try {
    const missing = findMissingFields(req.body, ['decision']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }

    const { decision, reviewComment } = req.body;
    if (!COMMUNICATION_REVIEW_DECISIONS.includes(decision)) {
      throw ApiError.badRequest(`"decision" must be one of: ${COMMUNICATION_REVIEW_DECISIONS.join(', ')}.`);
    }

    const result = await reviewCommunication(req.params.id, { decision, reviewComment }, resolveReviewerIdentity(req));
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/leads/:id/decision-trail — every decision taken on this lead
// (rules engine, AI advisory, AI proposal, human reviews), oldest first.
// 404s if the tender doesn't exist. See decisionTrailService.js for how
// leads that predate the audit table are back-filled.
export async function decisionTrail(req, res, next) {
  try {
    const result = await getDecisionTrail(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
