import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';

const handler: Handler = withErrorHandling(async () => {
  const { data, error } = await supabaseAdmin
    .from('job_templates')
    .select('id,name,description,plan_json,created_at,updated_at,is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return json(200, { templates: data ?? [] });
});

export { handler };
