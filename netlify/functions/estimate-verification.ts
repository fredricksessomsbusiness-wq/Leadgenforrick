import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import { estimateVerificationCost } from '../../lib/verification';

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { jobId } = JSON.parse(event.body ?? '{}');
  if (!jobId) return json(400, { error: 'jobId is required' });

  const { data, error } = await supabaseAdmin
    .from('job_results')
    .select('lead_id, leads!inner(primary_contact_id), contacts!job_results_primary_contact_id_fkey(id,email,email_status)')
    .eq('job_id', jobId);

  if (error) throw error;

  const countToVerify = (data ?? []).filter((row: any) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    return contact?.email && ['unverified', 'unknown', 'none'].includes(contact.email_status);
  }).length;

  const estimate = estimateVerificationCost(countToVerify);

  await supabaseAdmin
    .from('jobs')
    .update({ verification_status: 'estimated', verification_estimate_json: estimate })
    .eq('id', jobId);

  return json(200, { estimate });
});

export { handler };
