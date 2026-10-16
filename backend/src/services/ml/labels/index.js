import { reviewDecisionLabelSource } from './reviewDecisionLabelSource.js';

// Label sources by name, as referenced from ml_models.training_config
// (labelSource). The CRM outcome feed plugs in here as a second entry.
const LABEL_SOURCES = new Map([[reviewDecisionLabelSource.name, reviewDecisionLabelSource]]);

export function getLabelSource(name) {
  const source = LABEL_SOURCES.get(name);
  if (!source) {
    throw new Error(`Unknown label source "${name}". Available: ${[...LABEL_SOURCES.keys()].join(', ')}.`);
  }
  return source;
}
