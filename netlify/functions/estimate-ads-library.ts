import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import { estimateAdsLibraryCost } from '../../lib/ads-library';

const parseLeadIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};
const parseJobIds = (value: unknown, fallbackJobId: string): string[] => {
  if (!Array.isArray(value)) return [fallbackJobId];
  const parsed = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return parsed.length > 0 ? parsed : [fallbackJobId];
};

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const body = JSON.parse(event.body ?? '{}');
  const jobId = body.jobId as string;
  const selectedLeadIds = parseLeadIds(body.selectedLeadIds);
  const scopeJobIds = parseJobIds(body.scopeJobIds, jobId);
  if (!jobId) return json(400, { error: 'jobId is required' });

  let query = supabaseAdmin.from('job_results').select('lead_id').in('job_id', scopeJobIds);
  if (selectedLeadIds.length > 0) query = query.in('lead_id', selectedLeadIds);

  const { data, error } = await query;
  if (error) throw error;

  const companyCount = data?.length ?? 0;
  const estimate = estimateAdsLibraryCost({ companyCount });

  await supabaseAdmin
    .from('jobs')
    .update({ ads_scan_status: 'estimated', ads_scan_estimate_json: estimate })
    .eq('id', jobId);

  return json(200, { estimate, selected_count: companyCount });
});

export { handler };
