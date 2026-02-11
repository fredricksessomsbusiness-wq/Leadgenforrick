import type { Handler } from '@netlify/functions';
import { withErrorHandling } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import { exportCsv } from '../../lib/csv';

const mapRow = (result: any) => {
  const lead = Array.isArray(result.leads) ? result.leads[0] : result.leads;
  const contact = Array.isArray(result.contacts) ? result.contacts[0] : result.contacts;
  const signals = Array.isArray(result.signals) ? result.signals : [];

  const hooks = signals.slice(0, 2).map((s: any) => s.signal_value);
  const evidence = signals
    .map((s: any) => s.evidence_url)
    .filter(Boolean)
    .join(' | ');

  return {
    'Firm Name': lead?.name ?? '',
    Website: lead?.website ?? '',
    Phone: lead?.phone ?? '',
    Address: lead?.address ?? '',
    City: lead?.city ?? '',
    State: lead?.state ?? '',
    Zip: lead?.zip ?? '',
    'Primary Contact Name': contact?.full_name ?? '',
    'Primary Contact Title': contact?.title ?? '',
    Email: contact?.email ?? '',
    'Email Status': contact?.email_status ?? '',
    'Google Maps URL': lead?.google_maps_url ?? '',
    'Contact Form URL': lead?.contact_form_url ?? '',
    'Professional Hook 1': hooks[0] ?? '',
    'Professional Hook 2': hooks[1] ?? '',
    'Evidence URLs': evidence,
    Notes: ''
  };
};

const handler: Handler = withErrorHandling(async (event) => {
  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) {
    return { statusCode: 400, body: 'jobId is required' };
  }

  const columns = event.queryStringParameters?.columns
    ? event.queryStringParameters.columns.split(',').map((c) => c.trim())
    : [
        'Firm Name',
        'Website',
        'Phone',
        'Address',
        'City',
        'State',
        'Zip',
        'Primary Contact Name',
        'Primary Contact Title',
        'Email',
        'Email Status',
        'Google Maps URL',
        'Contact Form URL',
        'Professional Hook 1',
        'Professional Hook 2',
        'Evidence URLs',
        'Notes'
      ];

  const { data, error } = await supabaseAdmin
    .from('job_results')
    .select('lead_id, leads!inner(*), contacts!job_results_primary_contact_id_fkey(*)')
    .eq('job_id', jobId)
    .limit(10000);

  if (error) throw error;

  const leadIds = (data ?? []).map((r: any) => r.lead_id);
  const { data: signals } = await supabaseAdmin.from('signals').select('*').in('lead_id', leadIds.length ? leadIds : ['']);

  const signalsByLead = new Map<string, any[]>();
  for (const s of signals ?? []) {
    const key = s.lead_id as string;
    signalsByLead.set(key, [...(signalsByLead.get(key) ?? []), s]);
  }

  const rows = (data ?? []).map((r: any) => mapRow({ ...r, signals: signalsByLead.get(r.lead_id) ?? [] }));
  const csv = exportCsv(rows, columns);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="local-leads-${jobId}.csv"`
    },
    body: csv
  };
});

export { handler };
