import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import { appendRunLog } from '../../lib/db/jobs';
import { env } from '../../lib/env';
import { lookupAdsLibrary } from '../../lib/ads-library';

const parseLeadIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};
const parseJobIds = (value: unknown, fallbackJobId: string): string[] => {
  if (!Array.isArray(value)) return [fallbackJobId];
  const parsed = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return parsed.length > 0 ? parsed : [fallbackJobId];
};

const dateDaysAgoIso = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const dateTodayIso = () => new Date().toISOString().slice(0, 10);

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const body = JSON.parse(event.body ?? '{}');
  const jobId = body.jobId as string;
  const selectedLeadIds = parseLeadIds(body.selectedLeadIds);
  const scopeJobIds = parseJobIds(body.scopeJobIds, jobId);
  const periodDays = Math.max(1, Math.min(365, Number(body.periodDays ?? 30)));
  const batchSize = Math.max(1, Math.min(200, Number(body.batchSize ?? 20)));
  const minAds = Math.max(0, Number(body.minAds ?? 1));
  const spendCap = Number(body.spendCap ?? 0);

  if (!jobId) return json(400, { error: 'jobId is required' });
  if (!spendCap || spendCap <= 0) return json(400, { error: 'spendCap is required and must be > 0' });

  const { data: job, error: jobErr } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();
  if (jobErr) throw jobErr;

  let spendActual = Number(job.ads_scan_spend_actual ?? 0);
  if (spendActual >= spendCap) {
    return json(200, { done: true, reason: 'spend_cap_reached', spendActual, spendCap });
  }

  await supabaseAdmin
    .from('jobs')
    .update({ ads_scan_status: 'running', ads_scan_spend_cap: spendCap })
    .eq('id', jobId);

  let query = supabaseAdmin
    .from('job_results')
    .select('lead_id, leads!inner(id,name,website,city,state)')
    .in('job_id', scopeJobIds)
    .limit(10000);
  if (selectedLeadIds.length > 0) query = query.in('lead_id', selectedLeadIds);
  const { data: rows, error } = await query;
  if (error) throw error;

  const allRows = rows ?? [];
  const leadIds = allRows.map((r) => r.lead_id);
  const periodStart = dateDaysAgoIso(periodDays);
  const periodEnd = dateTodayIso();

  const { data: existing } = await supabaseAdmin
    .from('ads_library_observations')
    .select('lead_id')
    .in('lead_id', leadIds.length > 0 ? leadIds : [''])
    .eq('provider', env.adsLibraryProvider)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd);

  const existingLeadIds = new Set(
    (existing ?? []).map((r) => String(r.lead_id)).filter((id) => id.length > 0)
  );

  const pendingRows = allRows
    .filter((row) => !existingLeadIds.has(String(row.lead_id)))
    .filter((row) => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      return !!lead?.website;
    })
    .slice(0, batchSize);

  let processed = 0;
  let matches = 0;

  for (const row of pendingRows) {
    if (spendActual + env.adsLibraryUnitCostUsd > spendCap) break;
    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    if (!lead) continue;

    const result = await lookupAdsLibrary({
      companyName: lead.name,
      website: lead.website,
      city: lead.city,
      state: lead.state,
      periodDays
    });

    const inThreshold = result.ads_count_in_period >= minAds;
    if (inThreshold) matches += 1;

    await supabaseAdmin.from('ads_library_observations').upsert(
      {
        lead_id: lead.id,
        job_id: jobId,
        provider: result.provider,
        advertiser_name: result.advertiser_name,
        ads_count_active: result.ads_count_active,
        ads_count_in_period: result.ads_count_in_period,
        period_start: result.period_start,
        period_end: result.period_end,
        first_seen_at: result.first_seen_at,
        last_seen_at: result.last_seen_at,
        evidence_url: result.evidence_url,
        provider_response: result.raw
      },
      { onConflict: 'lead_id,provider,period_start,period_end' }
    );

    await appendRunLog(jobId, {
      event: 'ads_scan_batch',
      lead_id: lead.id,
      lead_name: lead.name,
      period_days: periodDays,
      min_ads: minAds,
      ads_count_in_period: result.ads_count_in_period,
      ads_count_active: result.ads_count_active,
      threshold_match: inThreshold
    });

    spendActual += env.adsLibraryUnitCostUsd;
    processed += 1;
  }

  const done = pendingRows.length === 0 || processed === 0 || spendActual >= spendCap;
  await supabaseAdmin
    .from('jobs')
    .update({
      ads_scan_status: done ? 'completed' : 'running',
      ads_scan_spend_actual: Number(spendActual.toFixed(4))
    })
    .eq('id', jobId);

  return json(200, {
    done,
    processed,
    threshold_matches: matches,
    spendActual: Number(spendActual.toFixed(4)),
    spendCap,
    periodDays,
    minAds,
    batchSize
  });
});

export { handler };
