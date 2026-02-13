import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { supabaseAdmin } from '../../lib/supabase';
import {
  contactLeadConfidence,
  estimateEnrichmentCost,
  heuristicSegmentCompany,
  type EnrichmentMode
} from '../../lib/enrichment';

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
  const mode = (body.mode === 'deep' ? 'deep' : 'budget') as EnrichmentMode;
  const leadsPerCompany = Math.max(1, Math.min(3, Number(body.leadsPerCompany ?? 3)));
  const batchSize = Math.max(1, Math.min(200, Number(body.batchSize ?? 20)));
  const selectedLeadIds = parseLeadIds(body.selectedLeadIds);
  const scopeJobIds = parseJobIds(body.scopeJobIds, jobId);
  const spendCap = Number(body.spendCap ?? 0);

  if (!jobId) return json(400, { error: 'jobId is required' });
  if (!spendCap || spendCap <= 0) return json(400, { error: 'spendCap is required and must be > 0' });

  const { data: job, error: jobErr } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();
  if (jobErr) throw jobErr;

  let spendActual = Number(job.enrichment_spend_actual ?? 0);
  if (spendActual >= spendCap) {
    return json(200, { done: true, reason: 'spend_cap_reached', spendActual, spendCap });
  }

  await supabaseAdmin
    .from('jobs')
    .update({ enrichment_status: 'running', enrichment_spend_cap: spendCap })
    .eq('id', jobId);

  let query = supabaseAdmin
    .from('job_results')
    .select('lead_id, leads!inner(id,name,website,address,city,state)')
    .in('job_id', scopeJobIds)
    .limit(10000);

  if (selectedLeadIds.length > 0) {
    query = query.in('lead_id', selectedLeadIds);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const allRows = rows ?? [];
  const leadIds = allRows.map((r) => r.lead_id);
  const { data: existingSegmentSignals } = await supabaseAdmin
    .from('signals')
    .select('lead_id, signal_type')
    .in('lead_id', leadIds.length > 0 ? leadIds : [''])
    .eq('signal_type', 'segment_in_business_20_plus');

  const alreadyEnrichedLeadIds = new Set(
    (existingSegmentSignals ?? [])
      .map((s) => s.lead_id)
      .filter((id): id is string => typeof id === 'string')
  );

  const pendingRows = allRows.filter((row) => !alreadyEnrichedLeadIds.has(String(row.lead_id))).slice(0, batchSize);

  let processedCompanies = 0;
  let leadSignalsWritten = 0;

  for (const row of pendingRows) {
    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    if (!lead) continue;

    const estimateForOne = estimateEnrichmentCost({ companyCount: 1, leadsPerCompany, mode });
    if (spendActual + estimateForOne.estimated_cost_total_usd > spendCap) break;

    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id,full_name,title')
      .eq('lead_id', lead.id)
      .limit(25);

    const topContacts = [...(contacts ?? [])]
      .sort((a, b) => contactLeadConfidence(b.title) - contactLeadConfidence(a.title))
      .slice(0, leadsPerCompany);

    if (topContacts.length > 0) {
      await supabaseAdmin.from('signals').insert(
        topContacts.map((c) => ({
          lead_id: lead.id,
          contact_id: c.id,
          signal_type: 'enrichment_lead_confidence',
          signal_value: JSON.stringify({
            full_name: c.full_name,
            title: c.title,
            confidence: contactLeadConfidence(c.title),
            mode
          }),
          evidence_url: lead.website ?? null
        }))
      );
      leadSignalsWritten += topContacts.length;
    }

    const seg = heuristicSegmentCompany({
      leadName: lead.name,
      website: lead.website,
      address: lead.address,
      city: lead.city,
      state: lead.state
    });

    await supabaseAdmin.from('signals').insert([
      {
        lead_id: lead.id,
        signal_type: 'segment_in_business_20_plus',
        signal_value: JSON.stringify({
          value: seg.in_business_20_plus.value,
          confidence: seg.in_business_20_plus.confidence,
          mode
        }),
        evidence_url: seg.in_business_20_plus.evidence
      },
      {
        lead_id: lead.id,
        signal_type: 'segment_multi_location_medical_practice',
        signal_value: JSON.stringify({
          value: seg.multi_location_medical_practice.value,
          confidence: seg.multi_location_medical_practice.confidence,
          mode
        }),
        evidence_url: seg.multi_location_medical_practice.evidence
      }
    ]);

    spendActual += estimateForOne.estimated_cost_total_usd;
    processedCompanies += 1;

    await supabaseAdmin
      .from('job_results')
      .update({ primary_contact_id: topContacts[0]?.id ?? null })
      .eq('job_id', jobId)
      .eq('lead_id', lead.id);
  }

  const done = processedCompanies === 0 || spendActual >= spendCap || pendingRows.length === 0;

  await supabaseAdmin
    .from('jobs')
    .update({
      enrichment_status: done ? 'completed' : 'running',
      enrichment_spend_actual: Number(spendActual.toFixed(4))
    })
    .eq('id', jobId);

  return json(200, {
    done,
    processed_companies: processedCompanies,
    lead_signals_written: leadSignalsWritten,
    spendActual: Number(spendActual.toFixed(4)),
    spendCap,
    batch_size: batchSize,
    mode,
    leads_per_company: leadsPerCompany
  });
});

export { handler };
