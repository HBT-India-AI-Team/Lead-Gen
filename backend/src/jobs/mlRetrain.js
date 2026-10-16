import path from 'path';
import { fileURLToPath } from 'url';
import { ensureMlModelMaintenanceSchema } from '../db/migrations/addMlModelMaintenanceSchema.js';
import { startTrainingRun } from '../services/ml/retrainingService.js';
import { POOLED_SEGMENT } from '../services/ml/mlConfig.js';

const __filename = fileURLToPath(import.meta.url);

// Scheduled retraining entry point (Cloud Scheduler -> Cloud Run Job):
//   node src/jobs/mlRetrain.js [segmentKey]
// Runs one retraining attempt with trigger 'schedule'. Like a manual run it
// can only ever *propose* a candidate; promotion still needs an admin.

export async function runScheduledRetrain(segmentKey = POOLED_SEGMENT) {
  await ensureMlModelMaintenanceSchema();
  const run = await startTrainingRun({ segmentKey, trigger: 'schedule', requestedBy: 'Scheduler' });
  console.log(`[ML Retrain] Run #${run.id} for ${run.segment_key}: ${run.status}${run.error_text ? ` — ${run.error_text}` : ''}`);
  return run;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  runScheduledRetrain(process.argv[2])
    .then((run) => process.exit(run.status === 'failed' ? 1 : 0))
    .catch((error) => {
      console.error('[ML Retrain] Fatal error:', error);
      process.exit(1);
    });
}
