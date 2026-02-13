import { supabaseAdmin } from '../supabase';
import type { ParsedPlan } from '../../types/domain';

export const createJob = async (userPrompt: string, plan: ParsedPlan) => {
  const maxSearches = Number.isFinite(Number(plan.max_searches)) ? Number(plan.max_searches) : 100;
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .insert({
      user_prompt: userPrompt,
      parsed_plan_json: plan,
      toggles_json: plan.toggles_json,
      target_firm_count: plan.target_firm_count,
      max_searches: maxSearches,
      searches_executed: 0,
      allow_reinclude: plan.toggles_json.allow_reinclude,
      status: 'queued'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const getJob = async (jobId: string) => {
  const { data, error } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();
  if (error) throw error;
  return data;
};

export const appendRunLog = async (jobId: string, item: Record<string, unknown>) => {
  const job = await getJob(jobId);
  const logs = Array.isArray(job.run_logs) ? job.run_logs : [];
  const next = [...logs, { ts: new Date().toISOString(), ...item }];
  await supabaseAdmin.from('jobs').update({ run_logs: next }).eq('id', jobId);
};

export const updateJobProgress = async (
  jobId: string,
  patch: Record<string, string | number | boolean | null | Record<string, unknown>>
) => {
  const { error } = await supabaseAdmin.from('jobs').update(patch).eq('id', jobId);
  if (error) throw error;
};

export const countJobFirmResults = async (jobId: string) => {
  const { count, error } = await supabaseAdmin
    .from('job_results')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId);
  if (error) throw error;
  return count ?? 0;
};
