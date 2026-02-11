import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { createJob } from '../../lib/db/jobs';
import { parsePromptToPlan } from '../../lib/planner';

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = JSON.parse(event.body ?? '{}');
  const prompt = String(body.prompt ?? '');
  const editedPlan = body.plan && typeof body.plan === 'object' ? body.plan : null;

  if (!prompt) return json(400, { error: 'prompt is required' });

  const plan = editedPlan ?? parsePromptToPlan(prompt);
  const job = await createJob(prompt, plan);

  return json(200, { job });
});

export { handler };
