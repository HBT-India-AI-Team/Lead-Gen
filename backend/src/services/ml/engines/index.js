import { jsLogisticEngine } from './jsLogisticEngine.js';

// Model engines by ml_models.model_type. Each engine implements
// train / predict / trainingStats / featureWeights (see
// jsLogisticEngine.js). Adding Vertex AI means registering one more entry.
const ENGINES = new Map([[jsLogisticEngine.modelType, jsLogisticEngine]]);

export function getEngine(modelType) {
  const engine = ENGINES.get(modelType);
  if (!engine) {
    throw new Error(`No model engine registered for model type "${modelType}".`);
  }
  return engine;
}
