import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { getJob } from '../../lib/db/jobs';

const handler: Handler = withErrorHandling(async (event) => {
  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) return json(400, { error: 'jobId is required' });
  const job = await getJob(jobId);
  return json(200, { job });
});

export { handler };
