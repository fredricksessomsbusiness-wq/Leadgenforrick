import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import { env } from '../../lib/env';

interface CollectLog {
  event?: string;
  found?: number;
  new?: number;
  duplicate?: number;
  api_calls?: {
    textsearch?: number;
    details?: number;
    total?: number;
  };
  estimated_api_cost_usd?: number;
}

interface UsageJobRow {
  job_id: string;
  created_at: string;
  user_prompt: string;
  status: string;
  target_firm_count: number;
  progress_count: number;
  collect_batches: number;
  api_calls_textsearch: number;
  api_calls_details: number;
  api_calls_total: number;
  matches_found: number;
  leads_new: number;
  leads_duplicates: number;
  places_estimated_cost_usd: number;
  verification_spend_usd: number;
  total_estimated_spend_usd: number;
}

const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const monthKey = (iso: string): string => iso.slice(0, 7);

const handler: Handler = withErrorHandling(async () => {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id,created_at,user_prompt,status,target_firm_count,progress_count,run_logs,verification_spend_actual')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) throw error;

  const rows: UsageJobRow[] = (data ?? []).map((job: any) => {
    const logs: CollectLog[] = Array.isArray(job.run_logs) ? job.run_logs : [];
    const collectLogs = logs.filter((log) => log?.event === 'collect_batch');

    let found = 0;
    let newLeads = 0;
    let duplicates = 0;
    let searchCalls = 0;
    let detailsCalls = 0;
    let totalCalls = 0;
    let placesCost = 0;

    for (const log of collectLogs) {
      found += toNumber(log.found);
      newLeads += toNumber(log.new);
      duplicates += toNumber(log.duplicate);
      searchCalls += toNumber(log.api_calls?.textsearch);
      detailsCalls += toNumber(log.api_calls?.details);
      totalCalls += toNumber(log.api_calls?.total);
      placesCost += toNumber(log.estimated_api_cost_usd);
    }

    const verificationSpend = Number(job.verification_spend_actual ?? 0);

    return {
      job_id: job.id,
      created_at: job.created_at,
      user_prompt: job.user_prompt,
      status: job.status,
      target_firm_count: Number(job.target_firm_count ?? 0),
      progress_count: Number(job.progress_count ?? 0),
      collect_batches: collectLogs.length,
      api_calls_textsearch: searchCalls,
      api_calls_details: detailsCalls,
      api_calls_total: totalCalls,
      matches_found: found,
      leads_new: newLeads,
      leads_duplicates: duplicates,
      places_estimated_cost_usd: Number(placesCost.toFixed(4)),
      verification_spend_usd: Number(verificationSpend.toFixed(4)),
      total_estimated_spend_usd: Number((placesCost + verificationSpend).toFixed(4))
    };
  });

  const monthlyMap = new Map<
    string,
    {
      month: string;
      jobs: number;
      api_calls_total: number;
      leads_new: number;
      leads_duplicates: number;
      places_estimated_cost_usd: number;
      verification_spend_usd: number;
      gross_estimated_spend_usd: number;
      estimated_paid_usd: number;
    }
  >();

  for (const row of rows) {
    const key = monthKey(row.created_at);
    const existing = monthlyMap.get(key) ?? {
      month: key,
      jobs: 0,
      api_calls_total: 0,
      leads_new: 0,
      leads_duplicates: 0,
      places_estimated_cost_usd: 0,
      verification_spend_usd: 0,
      gross_estimated_spend_usd: 0,
      estimated_paid_usd: 0
    };

    existing.jobs += 1;
    existing.api_calls_total += row.api_calls_total;
    existing.leads_new += row.leads_new;
    existing.leads_duplicates += row.leads_duplicates;
    existing.places_estimated_cost_usd += row.places_estimated_cost_usd;
    existing.verification_spend_usd += row.verification_spend_usd;
    existing.gross_estimated_spend_usd += row.total_estimated_spend_usd;

    monthlyMap.set(key, existing);
  }

  const monthly = [...monthlyMap.values()]
    .map((m) => {
      const paid = Math.max(0, m.gross_estimated_spend_usd - env.googleMonthlyFreeCreditUsd);
      return {
        ...m,
        places_estimated_cost_usd: Number(m.places_estimated_cost_usd.toFixed(4)),
        verification_spend_usd: Number(m.verification_spend_usd.toFixed(4)),
        gross_estimated_spend_usd: Number(m.gross_estimated_spend_usd.toFixed(4)),
        estimated_paid_usd: Number(paid.toFixed(4))
      };
    })
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  const lifetimeGross = rows.reduce((sum, row) => sum + row.total_estimated_spend_usd, 0);
  const lifetimeCalls = rows.reduce((sum, row) => sum + row.api_calls_total, 0);
  const lifetimeNewLeads = rows.reduce((sum, row) => sum + row.leads_new, 0);

  return json(200, {
    usage: {
      free_credit_config_usd: env.googleMonthlyFreeCreditUsd,
      lifetime: {
        jobs: rows.length,
        api_calls_total: lifetimeCalls,
        leads_new: lifetimeNewLeads,
        gross_estimated_spend_usd: Number(lifetimeGross.toFixed(4))
      },
      monthly,
      jobs: rows
    }
  });
});

export { handler };
