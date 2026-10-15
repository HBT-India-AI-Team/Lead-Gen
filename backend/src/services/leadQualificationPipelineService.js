import * as tenderService from './tenderService.js';
import * as tenderRepository from '../repositories/tenderRepository.js';
import * as probe42Repository from '../repositories/probe42Repository.js';
import * as leadSignalRepository from '../repositories/leadSignalRepository.js';
import {
  computeQualificationScore,
  resolveLeadStatusFromScore,
  resolvePipelineStatusFromLeadStatus,
} from './scoring/qualificationScoringService.js';
import { collectQualificationEvidence } from './qualification/evidenceCollectorService.js';
import { QualificationAiAnalysisService } from './ollama/qualificationAiAnalysisService.js';

// PHASE 1 Lead Qualification workflow entry point. A "lead" is a `tenders`
// row (see src/db/migrations/addLeadQualificationSchema.js's rationale);
// this is the one clean orchestration entry point that can later be called
// automatically when a new tender is inserted — no queue/worker exists yet,
// so for now it's only invoked directly (POST /api/leads/:id/qualify).
//
// PHASE 2 addition: after the deterministic score below, real evidence is
// collected and sent to Ollama for an advisory AI analysis (reasoning,
// positive/risk signals, missing evidence). The deterministic score/
// lead_status/pipeline_status remain 100% authoritative and are computed
// first, independent of Ollama — a failed/unreachable Ollama call never
// changes them, only leaves qualification_reason.aiAnalysis marked
// unavailable. See qualificationAiAnalysisService.js's header for why.
//
// Implements the explicit transition sequence from the spec as real,
// separately persisted writes (not just a single final UPDATE), so the row
// genuinely passes through READY_FOR_QUALIFY -> QUALIFYING before landing on
// its final QUALIFIED_* / ON_HOLD state.

const qualificationAiAnalysisService = new QualificationAiAnalysisService();

/**
 * Runs the Ollama qualification analysis for one tender's real evidence.
 * Best-effort: any failure (unreachable server, invalid/unparseable
 * response, a validation failure) is caught here and reported as an
 * unavailable AI analysis — it never throws, and never invents a
 * score/classification to paper over the failure, matching the "a
 * technical failure is not a business qualification result" rule.
 */
async function runAiAnalysis(tender) {
  try {
    const evidence = await collectQualificationEvidence(tender);
    const analysis = await qualificationAiAnalysisService.analyze(evidence);
    return { status: 'AVAILABLE', ...analysis };
  } catch (error) {
    return { status: 'AI_ANALYSIS_UNAVAILABLE', error: error.message };
  }
}

/**
 * Looks up the Probe42 profile for the tender's WINNING company only — never
 * the tender-issuing buyer (tenders.company_name), which is a government/
 * institutional name, not a real lead company. Returns null (not an error)
 * when no winning company is known yet or no matching profile exists; the
 * scorer treats that as "unavailable", never as a positive or negative
 * signal.
 */
async function loadProbe42Profile(tender) {
  if (!tender.winning_company_name) return null;
  return probe42Repository.findByCompanyName(tender.winning_company_name);
}

/**
 * Runs the full deterministic PHASE 1 workflow for one tender:
 *   IDENTIFYING/* -> READY_FOR_QUALIFY -> QUALIFYING -> QUALIFIED_BAD/HITL/GOOD
 * Loads the real tender and (when available) its real Probe42 profile,
 * scores it, persists every transition, and returns the row as actually
 * stored in MySQL afterward (re-read, not just the in-memory value) so the
 * caller always sees the real persisted result.
 */
export async function qualifyLead(tenderId) {
  const tender = await tenderService.getTenderById(tenderId);

  // "When ready" transition.
  await tenderRepository.updatePipelineTransition(tenderId, {
    pipelineStatus: 'READY_FOR_QUALIFY',
    leadStatus: 'QUALIFY',
  });

  // "When qualification starts" transition.
  await tenderRepository.updatePipelineTransition(tenderId, {
    pipelineStatus: 'QUALIFYING',
    leadStatus: 'QUALIFY',
  });

  try {
    const probe42Profile = await loadProbe42Profile(tender);
    const { score, factors, reasons } = computeQualificationScore(tender, probe42Profile);
    const leadStatus = resolveLeadStatusFromScore(score);
    const pipelineStatus = resolvePipelineStatusFromLeadStatus(leadStatus);

    // Context only — never a scoring input. The persisted TENDER
    // lead_signals row (if any) for this tender is attached to the
    // qualification_reason so it's visible in the qualification context,
    // but computeQualificationScore() above already ran without it: the
    // 10-factor score/weights are completely unaffected by whether a
    // signal exists. null (no signal recorded yet) is stored as-is,
    // explicitly marked unavailable — never invented.
    const tenderSignal = await leadSignalRepository.findTenderSignal(tenderId);

    // Advisory only — computed from the same real tender row, after the
    // deterministic score/status above are already final. Never awaited
    // into leadStatus/pipelineStatus/score.
    const aiAnalysis = await runAiAnalysis(tender);

    await tenderRepository.saveQualificationResult(tenderId, {
      pipelineStatus,
      leadStatus,
      score,
      reason: {
        factors,
        reasons,
        tenderSignal: tenderSignal
          ? {
              available: true,
              id: tenderSignal.id,
              source: tenderSignal.source,
              signalDate: tenderSignal.signal_date,
              title: tenderSignal.title,
              value: tenderSignal.value,
              location: tenderSignal.location,
            }
          : { available: false },
        aiAnalysis,
      },
    });

    return tenderService.getTenderById(tenderId);
  } catch (error) {
    // Roll pipeline_status back to READY_FOR_QUALIFY (not one of the fixed
    // enum values has an explicit "error" state) so the tender can be
    // retried; lead_status stays QUALIFY (unresolved). The previous
    // successful qualification's score/reason, if any, is left untouched.
    await tenderRepository.saveQualificationResult(tenderId, {
      pipelineStatus: 'READY_FOR_QUALIFY',
      leadStatus: 'QUALIFY',
      error: error.message,
    });
    throw error;
  }
}
