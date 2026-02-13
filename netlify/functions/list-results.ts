import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';

const parseJobIds = (event: Parameters<Handler>[0]): string[] => {
  const single = event.queryStringParameters?.jobId;
  const multi = event.queryStringParameters?.jobIds;
  if (multi) {
    return multi
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return single ? [single] : [];
};

const handler: Handler = withErrorHandling(async (event) => {
  const jobIds = parseJobIds(event);
  if (jobIds.length === 0) return json(400, { error: 'jobId or jobIds is required' });

  const { data, error } = await supabaseAdmin
    .from('job_results')
    .select('job_id, lead_id, leads!inner(*), contacts!job_results_primary_contact_id_fkey(*)')
    .in('job_id', jobIds)
    .limit(10000);

  if (error) throw error;

  const leadIds = (data ?? []).map((r: any) => r.lead_id);
  const { data: signals } = await supabaseAdmin.from('signals').select('*').in('lead_id', leadIds.length ? leadIds : ['']);
  const { data: contacts } = await supabaseAdmin.from('contacts').select('*').in('lead_id', leadIds.length ? leadIds : ['']);

  const signalsByLead = new Map<string, any[]>();
  const contactsByLead = new Map<string, any[]>();
  for (const s of signals ?? []) {
    const key = s.lead_id as string;
    signalsByLead.set(key, [...(signalsByLead.get(key) ?? []), s]);
  }
  for (const c of contacts ?? []) {
    const key = c.lead_id as string;
    contactsByLead.set(key, [...(contactsByLead.get(key) ?? []), c]);
  }

  const merged = (data ?? []).map((r: any) => ({
    ...r,
    signals: signalsByLead.get(r.lead_id) ?? [],
    lead_contacts: contactsByLead.get(r.lead_id) ?? []
  }));

  return json(200, { results: merged });
});

export { handler };
