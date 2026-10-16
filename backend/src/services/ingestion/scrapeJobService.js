import axios from 'axios';

// Starts and reports on the tender scrape, which runs as a Cloud Run Job
// rather than inside this service. The scrape takes hours and drives a
// headless browser; running it in the API container would block a request
// far past Cloud Run's limit and tie the API's memory to Chromium. So the
// button starts a job and returns immediately, and the UI polls status.
//
// Auth uses the service account this container already runs as: Cloud Run's
// metadata server mints the access token, so there is no key to store and
// nothing extra in .env beyond which job to run. The account needs
// roles/run.developer to execute a job.
//
// With GCP_SCRAPE_JOB unset (local development) every call reports
// "not configured" instead of failing, so the page degrades to a disabled
// button rather than an error.

const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

const JOB_NAME = process.env.GCP_SCRAPE_JOB || '';
const PROJECT_ID = process.env.GCP_PROJECT_ID || '';
const REGION = process.env.GCP_REGION || 'asia-south1';

export function isConfigured() {
  return Boolean(JOB_NAME && PROJECT_ID);
}

async function accessToken() {
  const response = await axios.get(METADATA_TOKEN_URL, {
    headers: { 'Metadata-Flavor': 'Google' },
    timeout: 5000,
  });
  return response.data.access_token;
}

function apiBase() {
  return `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}`;
}

/** Most recent executions of the scrape job, newest first. */
export async function listExecutions(limit = 5) {
  if (!isConfigured()) return { configured: false, executions: [] };

  const token = await accessToken();
  const response = await axios.get(`${apiBase()}/executions`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { labelSelector: `run.googleapis.com/job=${JOB_NAME}` },
    timeout: 15000,
  });

  const executions = (response.data.items || [])
    .map((item) => {
      const status = item.status || {};
      const conditions = status.conditions || [];
      const completed = conditions.find((condition) => condition.type === 'Completed');
      return {
        name: item.metadata?.name ?? null,
        startedAt: status.startTime ?? item.metadata?.creationTimestamp ?? null,
        completedAt: status.completionTime ?? null,
        running: (status.runningCount ?? 0) > 0,
        succeeded: (status.succeededCount ?? 0) > 0,
        failed: (status.failedCount ?? 0) > 0,
        message: completed?.message ?? null,
      };
    })
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, limit);

  return { configured: true, jobName: JOB_NAME, executions };
}

/**
 * Starts a scrape. Refuses while one is already running — two concurrent
 * scrapes would duplicate work and hit the source harder than intended.
 */
export async function startScrape() {
  if (!isConfigured()) {
    const error = new Error(
      'Scraping is not configured on this environment. Set GCP_SCRAPE_JOB and GCP_PROJECT_ID.'
    );
    error.status = 503;
    throw error;
  }

  const { executions } = await listExecutions(3);
  if (executions.some((execution) => execution.running)) {
    const error = new Error('A scrape is already running. Wait for it to finish before starting another.');
    error.status = 409;
    throw error;
  }

  const token = await accessToken();
  const response = await axios.post(
    `${apiBase()}/jobs/${JOB_NAME}:run`,
    {},
    { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
  );

  return {
    started: true,
    executionName: response.data?.metadata?.name ?? null,
    jobName: JOB_NAME,
  };
}
