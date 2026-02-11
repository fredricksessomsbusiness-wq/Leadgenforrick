import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';

const handler: Handler = withErrorHandling(async (event) => {
  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) return json(400, { error: 'jobId is required' });

  const { data, error } = await supabaseAdmin
    .from('job_results')
    .select('lead_id, leads!inner(*), contacts!job_results_primary_contact_id_fkey(*)')
    .eq('job_id', jobId)
    .limit(2000);

  if (error) throw error;

  const leadIds = (data ?? []).map((r: any) => r.lead_id);
  const { data: signals } = await supabaseAdmin.from('signals').select('*').in('lead_id', leadIds.length ? leadIds : ['']);

  const signalsByLead = new Map<string, any[]>();
  for (const s of signals ?? []) {
    const key = s.lead_id as string;
    signalsByLead.set(key, [...(signalsByLead.get(key) ?? []), s]);
  }

  const merged = (data ?? []).map((r: any) => ({
    ...r,
    signals: signalsByLead.get(r.lead_id) ?? []
  }));

  return json(200, { results: merged });
});

export { handler };
