import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { plannerInputSchema, parsePromptToPlan } from '../../lib/planner';

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const payload = plannerInputSchema.parse(JSON.parse(event.body ?? '{}'));
  const plan = parsePromptToPlan(payload.prompt);
  return json(200, { plan });
});

export { handler };
