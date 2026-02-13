import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import { env } from '../../lib/env';
import { verifyEmail, buildEmailCandidates } from '../../lib/verification';

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
  const spendCap = Number(body.spendCap ?? 0);
  const generateCandidates = Boolean(body.generateCandidates ?? false);
  const validOnly = body.validOnly !== false;
  const maxAttemptsPerFirm = Number(body.maxAttemptsPerFirm ?? 3);
  const batchSize = Math.max(1, Math.min(200, Number(body.batchSize ?? 20)));
  const selectedLeadIds = parseLeadIds(body.selectedLeadIds);
  const scopeJobIds = parseJobIds(body.scopeJobIds, jobId);

  if (!jobId) return json(400, { error: 'jobId is required' });
  if (!spendCap || spendCap <= 0) return json(400, { error: 'spendCap is required and must be > 0' });

  const { data: job, error: jobErr } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();
  if (jobErr) throw jobErr;

  let spendActual = Number(job.verification_spend_actual ?? 0);
  if (spendActual >= spendCap) {
    return json(200, { done: true, reason: 'spend_cap_reached', spendActual, spendCap });
  }

  await supabaseAdmin
    .from('jobs')
    .update({ verification_status: 'running', verification_spend_cap: spendCap })
    .eq('id', jobId);

  let query = supabaseAdmin
    .from('job_results')
    .select('lead_id, leads!inner(id,website,primary_contact_id), contacts!job_results_primary_contact_id_fkey(id,first_name,last_name,email,email_status)')
    .in('job_id', scopeJobIds)
    .limit(batchSize);

  if (selectedLeadIds.length > 0) {
    query = query.in('lead_id', selectedLeadIds);
  }

  const { data: rows, error } = await query;

  if (error) throw error;

  let verifiedCount = 0;

  for (const row of rows ?? []) {
    if (spendActual >= spendCap) break;

    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    if (!contact) continue;

    const domain = lead?.website ? new URL(lead.website).hostname.replace(/^www\./, '') : null;
    const candidates = new Set<string>();
    if (contact.email) candidates.add(contact.email);
    if (generateCandidates) {
      for (const e of buildEmailCandidates(contact.first_name, contact.last_name, domain)) candidates.add(e);
    }

    let attempts = 0;
    for (const email of candidates) {
      if (attempts >= maxAttemptsPerFirm) break;
      if (spendActual + env.anymailUnitCost > spendCap) break;

      attempts += 1;
      spendActual += env.anymailUnitCost;

      const result = await verifyEmail(email);

      await supabaseAdmin.from('email_verifications').upsert(
        {
          contact_id: contact.id,
          email,
          provider: 'anymailsearch',
          status: result.status,
          confidence: result.confidence ?? null,
          provider_response: result.provider_response,
          verified_at: new Date().toISOString()
        },
        { onConflict: 'email,provider' }
      );

      const shouldStore = validOnly ? result.status === 'valid' : true;
      await supabaseAdmin
        .from('contacts')
        .update({
          email: shouldStore ? email : null,
          email_status: result.status,
          email_source: contact.email === email ? 'found_on_site' : 'generated_pattern',
          email_verified_at: new Date().toISOString()
        })
        .eq('id', contact.id);

      verifiedCount += 1;
      if (result.status === 'valid') break;
    }
  }

  const done = spendActual >= spendCap || (rows ?? []).length === 0;

  await supabaseAdmin
    .from('jobs')
    .update({
      verification_status: done ? 'completed' : 'running',
      verification_spend_actual: Number(spendActual.toFixed(2))
    })
    .eq('id', jobId);

  return json(200, {
    done,
    verifiedCount,
    spendActual: Number(spendActual.toFixed(2)),
    spendCap,
    selected_count: selectedLeadIds.length || (rows ?? []).length,
    batch_size: batchSize
  });
});

export { handler };
