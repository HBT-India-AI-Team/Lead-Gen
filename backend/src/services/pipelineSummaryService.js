import * as tenderRepository from '../repositories/tenderRepository.js';
import * as tenderProposalRepository from '../repositories/tenderProposalRepository.js';

// PHASE 5 — the ONE new backend surface this phase adds. Read-only: this
// file never writes to any table, never recomputes a qualification score,
// never decides a proposal/communication outcome — it only counts real,
// already-persisted rows across three tables (tenders, tender_proposals ×2
// views) into the shape the Dashboard's Pipeline Status section needs.
//
// Why this exists at all (PHASE 5 spec §3's required justification):
// GET /api/leads already supports a `pipeline_status` filter (PHASE 3), so
// "how many leads are AWAITING_PROPOSAL_REVIEW" is answerable today with
// zero backend change. But there is no existing endpoint or filter that
// can answer "how many leads are QUALIFIED_GOOD vs HITL vs BAD" (no
// `lead_status` filter exists), and — more fundamentally — there is NO
// existing endpoint of any kind that lists or counts `tender_proposals`
// rows in bulk (confirmed in PHASE 2's own code comments: "there is no
// 'list all proposals' capability"). Getting the proposal-status and
// communication-status distributions from only the existing per-tender
// GET /api/leads/:id/proposal and GET /api/leads/:id/communication
// endpoints would require an N+1 fetch — one HTTP round trip per tender,
// against however many of the 1,901+ leads might have a generated
// proposal — which is exactly the "inefficient frontend aggregation" the
// spec explicitly says to avoid. A single small aggregation endpoint,
// backed by three parameterless GROUP BY queries, is the smaller footprint
// than either an N+1 client loop or duplicating per-status filters across
// two separate tables' worth of endpoints.

/**
 * Real qualification-outcome distribution, reshaped from
 * tenderRepository.getQualificationCounts()'s raw GROUP BY rows into named
 * fields. Every real lead_status value on `tenders`
 * (IDENTIFYING/QUALIFY/QUALIFIED_BAD/QUALIFIED_HITL/QUALIFIED_GOOD — see
 * src/db/migrations/addLeadQualificationSchema.js) is accounted for; a
 * status with zero real rows simply contributes 0, never omitted or
 * guessed.
 */
function buildQualificationSummary(rows) {
  const byStatus = Object.fromEntries(rows.map((row) => [row.leadStatus, row.count]));

  const good = byStatus.QUALIFIED_GOOD ?? 0;
  const hitl = byStatus.QUALIFIED_HITL ?? 0;
  const bad = byStatus.QUALIFIED_BAD ?? 0;
  // IDENTIFYING (never qualified) and QUALIFY (mid-qualification, would
  // only be observed if a run crashed between transitions) both mean "not
  // yet a completed qualification outcome" — grouped as one honest
  // "unqualified" bucket rather than inventing a UI category for a
  // transient state nothing currently leaves rows sitting in.
  const unqualified = (byStatus.IDENTIFYING ?? 0) + (byStatus.QUALIFY ?? 0);

  return { good, hitl, bad, unqualified, totalQualified: good + hitl + bad };
}

/**
 * Real proposal-review distribution. READY_FOR_REVIEW and
 * NEEDS_HUMAN_REVIEW (both PHASE 2 proposalStatus outcomes — see
 * proposalGenerationService.js) are combined into one `readyForReview`
 * count: both mean "a human decision is still pending", matching how
 * proposalPipelineService.js's own TERMINAL_REVIEW_STATUSES already treats
 * everything except APPROVED/REJECTED as still-open.
 *
 * `sent` (PHASE 6) reads the same real GROUP BY rows for a `SENT` status —
 * inspection of proposalPipelineService.js/communicationPreparationService.js
 * confirmed no code path anywhere ever writes a "sent" outcome to `status`
 * or `communication_status` (the closest real state,
 * `communication_status = 'AWAITING_SEND_APPROVAL'`, is explicitly still
 * pending a human send decision, not a record of an actual send). So this
 * stays honestly 0 unless a future phase adds a real send step that writes
 * it — never a hardcoded literal, just a real aggregate over a status value
 * nothing currently produces.
 */
function buildProposalSummary(rows) {
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count]));
  const generated = rows.reduce((sum, row) => sum + row.count, 0);

  return {
    generated,
    readyForReview: (byStatus.READY_FOR_REVIEW ?? 0) + (byStatus.NEEDS_HUMAN_REVIEW ?? 0),
    approved: byStatus.APPROVED ?? 0,
    changesRequested: byStatus.CHANGES_REQUESTED ?? 0,
    rejected: byStatus.REJECTED ?? 0,
    onHold: byStatus.ON_HOLD ?? 0,
    sent: byStatus.SENT ?? 0,
  };
}

/**
 * Real communication distribution. `communication_status IS NULL` (a
 * generated+approved proposal that prepareCommunication() has never been
 * called for yet) is real, honest zero-state information, not an error —
 * folded into `notPrepared` rather than dropped from the total.
 */
function buildCommunicationSummary(rows) {
  const byStatus = Object.fromEntries(rows.map((row) => [row.communicationStatus, row.count]));
  const notPrepared = byStatus[null] ?? 0;
  const draftReady = byStatus.DRAFT_READY ?? 0;
  const awaitingSendApproval = byStatus.AWAITING_SEND_APPROVAL ?? 0;
  const onHold = byStatus.ON_HOLD ?? 0;
  const rejected = byStatus.REJECTED ?? 0;

  return {
    notPrepared,
    draftReady,
    awaitingSendApproval,
    onHold,
    rejected,
    // "Communication Ready" funnel stage (PHASE 5 spec §5) = has been
    // prepared at all, regardless of which way its own review later went.
    prepared: draftReady + awaitingSendApproval + onHold + rejected,
  };
}

/**
 * Assembles the full real Pipeline Status summary for the Dashboard.
 * `totalLeads` and `awaitingProposalReview` reuse tenderRepository.listTenders()
 * completely unchanged (same `pipeline_status` filter PHASE 3 already
 * added) — no new tenders-table query needed for those two numbers.
 *
 * PHASE 6 adds `awaitingHealthCheck`/`awaitingProposal`/`proposalSent`/
 * `reviewWaitingList` — the real counts behind the Dashboard's four legacy
 * KPI cards. Extends this same endpoint/service (per PHASE 6 spec §3)
 * rather than a second summary endpoint:
 *   - awaitingHealthCheck: pipeline_status = 'IDENTIFYING', the exact
 *     "new/unprocessed tender" default every row starts at before the Lead
 *     Qualification workflow (leadQualificationPipelineService.js) ever
 *     runs on it (see addLeadQualificationSchema.js's own migration
 *     comment). Uses the same listTenders({ pipelineStatus, limit: 1 })
 *     pattern as awaitingReviewResult below — one more real, filtered
 *     COUNT(*), no new query shape.
 *   - awaitingProposal: pipeline_status = 'READY_FOR_PROPOSAL', which
 *     resolvePipelineStatusFromLeadStatus() (qualificationScoringService.js)
 *     only ever sets for a QUALIFIED_GOOD lead — so this is already
 *     lead_status-exclusive of HITL/BAD by construction, no extra filter
 *     needed. Distinct from AWAITING_PROPOSAL_REVIEW (a proposal already
 *     exists there — see proposalPipelineService.js's
 *     ELIGIBLE_PIPELINE_STATUSES): this is specifically "eligible, proposal
 *     not yet generated".
 *   - proposalSent / reviewWaitingList: both derived from data already
 *     fetched below (buildProposalSummary(proposalRows).sent and
 *     awaitingReviewResult respectively) — no additional query.
 */
export async function getPipelineSummary() {
  const [totalResult, awaitingReviewResult, awaitingHealthCheckResult, awaitingProposalResult, qualificationRows, proposalRows, communicationRows] = await Promise.all([
    tenderRepository.listTenders({ limit: 1 }),
    tenderRepository.listTenders({ pipelineStatus: 'AWAITING_PROPOSAL_REVIEW', limit: 1 }),
    tenderRepository.listTenders({ pipelineStatus: 'IDENTIFYING', limit: 1 }),
    tenderRepository.listTenders({ pipelineStatus: 'READY_FOR_PROPOSAL', limit: 1 }),
    tenderRepository.getQualificationCounts(),
    tenderProposalRepository.getProposalStatusCounts(),
    tenderProposalRepository.getCommunicationStatusCounts(),
  ]);

  const proposal = buildProposalSummary(proposalRows);

  return {
    totalLeads: totalResult.pagination.total,
    awaitingProposalReview: awaitingReviewResult.pagination.total,
    awaitingHealthCheck: awaitingHealthCheckResult.pagination.total,
    awaitingProposal: awaitingProposalResult.pagination.total,
    proposalSent: proposal.sent,
    reviewWaitingList: awaitingReviewResult.pagination.total,
    qualification: buildQualificationSummary(qualificationRows),
    proposal,
    communication: buildCommunicationSummary(communicationRows),
  };
}