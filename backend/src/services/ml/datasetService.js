import { all } from '../../config/database.js';
import * as probe42Repository from '../../repositories/probe42Repository.js';
import { computeQualificationScore } from '../scoring/qualificationScoringService.js';
import { extractFeatures, segmentOf } from './featureService.js';
import { getLabelSource } from './labels/index.js';
import { TRAINING_MINIMUMS } from './mlConfig.js';

// Joins a label source's outcomes to the leads they're about and turns
// each into a training example: features (same extraction the live scoring
// path uses), the rules engine's score for the same lead (the baseline a
// candidate has to beat when no model is active yet), and its segment.
//
// Features are computed from each lead's current tender + Probe42 data.

async function loadTenders(tenderIds) {
  if (tenderIds.length === 0) return new Map();
  const rows = await all('SELECT * FROM tenders WHERE tender_id IN (?)', [tenderIds]);
  return new Map(rows.map((row) => [row.tender_id, row]));
}

/** Labels joined to their tender rows; labels whose tender no longer exists are dropped. */
export async function loadLabelledLeads(labelSourceName) {
  const labels = await getLabelSource(labelSourceName).loadLabels();
  const tenders = await loadTenders(labels.map((label) => label.tenderId));
  return labels.filter((label) => tenders.has(label.tenderId)).map((label) => ({ ...label, tender: tenders.get(label.tenderId) }));
}

/** Full training examples for the given labelled leads. */
export async function buildExamples(labelledLeads) {
  const examples = [];
  for (const lead of labelledLeads) {
    const probe42Profile = lead.tender.winning_company_name
      ? await probe42Repository.findByCompanyName(lead.tender.winning_company_name)
      : null;
    examples.push({
      tenderId: lead.tenderId,
      label: lead.label,
      labelledAt: lead.labelledAt,
      features: extractFeatures(lead.tender, probe42Profile),
      deterministicScore: computeQualificationScore(lead.tender, probe42Profile).score,
    });
  }
  return examples;
}

function counts(items) {
  const positives = items.filter((item) => item.label === 1).length;
  return { total: items.length, positives, negatives: items.length - positives };
}

/** How many outcomes exist overall and per sector — what decides whether a run can train at all. */
export async function summarizeLabels(labelSourceName) {
  const source = getLabelSource(labelSourceName);
  const leads = await loadLabelledLeads(labelSourceName);

  const bySector = new Map();
  for (const lead of leads) {
    const { sector } = segmentOf(lead.tender);
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector).push(lead);
  }

  const enough = ({ positives, negatives }) =>
    positives + negatives >= TRAINING_MINIMUMS.rows && positives >= TRAINING_MINIMUMS.rowsPerClass && negatives >= TRAINING_MINIMUMS.rowsPerClass;

  const overall = counts(leads);
  return {
    source: { name: source.name, description: source.description },
    ...overall,
    trainable: enough(overall),
    minimums: TRAINING_MINIMUMS,
    bySector: [...bySector.entries()]
      .map(([sector, items]) => {
        const sectorCounts = counts(items);
        return { sector, segmentKey: `sector=${sector}`, ...sectorCounts, trainable: enough(sectorCounts) };
      })
      .sort((a, b) => b.total - a.total),
  };
}
