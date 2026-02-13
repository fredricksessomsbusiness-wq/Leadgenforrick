import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = JSON.parse(event.body ?? '{}');
  const name = String(body.name ?? '').trim();
  const description = body.description ? String(body.description) : null;
  const plan = body.plan;

  if (!name) return json(400, { error: 'Template name is required' });
  if (!plan || typeof plan !== 'object') return json(400, { error: 'plan object is required' });

  const { data, error } = await supabaseAdmin
    .from('job_templates')
    .insert({ name, description, plan_json: plan, is_active: true })
    .select('*')
    .single();

  if (error) throw error;
  return json(200, { template: data });
});

export { handler };
