import { collectQualificationEvidence } from './evidenceCollectorService.js';

// Gathers the REAL evidence available for one tender into the structured
// object the Ollama Proposal prompt is built from (PHASE 2 spec §3). Reuses
// evidenceCollectorService.collectQualificationEvidence() unchanged for the
// company/tender/signals/financial/risk evidence (exact same real Probe42 +
// lead_signals lookups the qualification step already trusts) rather than
// re-deriving any of it — this file only adds the qualification RESULT
// itself (score/status/reason), which the qualification evidence collector
// has no reason to know about since it runs before that result exists.
// Read-only, same as its qualification counterpart — never writes to any
// table.

function parseQualificationReason(tender) {
  if (!tender.qualification_reason) return null;
  return typeof tender.qualification_reason === 'string'
    ? JSON.parse(tender.qualification_reason)
    : tender.qualification_reason;
}

/**
 * Collects real evidence for the Proposal Agent: everything
 * collectQualificationEvidence() already gathers, plus the tender's own
 * persisted qualification outcome (qualification_score/lead_status/
 * pipeline_status/qualification_reason, including the Phase 1 AI
 * analysis if one was recorded). `tender` must already carry these
 * columns — the caller (proposalPipelineService.js) only calls this after
 * confirming the tender is genuinely eligible, so a missing score here
 * would indicate a caller bug, not a data-availability question; this
 * function does not re-validate eligibility itself.
 */
export async function collectProposalEvidence(tender) {
  const qualificationEvidence = await collectQualificationEvidence(tender);

  return {
    ...qualificationEvidence,
    qualification: {
      score: tender.qualification_score ?? null,
      leadStatus: tender.lead_status ?? null,
      pipelineStatus: tender.pipeline_status ?? null,
      completedAt: tender.qualification_completed_at ?? null,
      reason: parseQualificationReason(tender),
    },
  };
}