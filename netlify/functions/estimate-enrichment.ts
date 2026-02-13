import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import { estimateEnrichmentCost, type EnrichmentMode } from '../../lib/enrichment';

const parseLeadIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const body = JSON.parse(event.body ?? '{}');
  const jobId = body.jobId as string;
  const selectedLeadIds = parseLeadIds(body.selectedLeadIds);
  const mode = (body.mode === 'deep' ? 'deep' : 'budget') as EnrichmentMode;
  const leadsPerCompany = Math.max(1, Math.min(3, Number(body.leadsPerCompany ?? 3)));

  if (!jobId) return json(400, { error: 'jobId is required' });

  let query = supabaseAdmin.from('job_results').select('lead_id').eq('job_id', jobId);
  if (selectedLeadIds.length > 0) query = query.in('lead_id', selectedLeadIds);

  const { data, error } = await query;
  if (error) throw error;

  const companyCount = data?.length ?? 0;
  const estimate = estimateEnrichmentCost({ companyCount, leadsPerCompany, mode });

  await supabaseAdmin
    .from('jobs')
    .update({ enrichment_status: 'estimated', enrichment_estimate_json: estimate })
    .eq('id', jobId);

  return json(200, { estimate, selected_count: companyCount });
});

export { handler };
