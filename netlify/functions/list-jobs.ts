import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';

const handler: Handler = withErrorHandling(async () => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id,user_prompt,status,progress_count,target_firm_count,created_at,finished_at')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw error;
  return json(200, { jobs: data ?? [] });
});

export { handler };
