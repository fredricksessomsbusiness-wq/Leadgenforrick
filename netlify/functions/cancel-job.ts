import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { appendRunLog, updateJobProgress } from '../../lib/db/jobs';

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { jobId } = JSON.parse(event.body ?? '{}');
  if (!jobId) return json(400, { error: 'jobId is required' });

  const now = new Date().toISOString();
  await updateJobProgress(jobId, {
    status: 'failed',
    error_log: 'Canceled by user',
    finished_at: now
  });
  await appendRunLog(jobId, { event: 'job_canceled', reason: 'user_request' });

  return json(200, { ok: true, jobId, canceled: true });
});

export { handler };
