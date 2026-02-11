import { supabaseAdmin } from '../supabase';
import { buildFallbackFirmHash } from '../dedupe';
import { appendRunLog } from './jobs';
import type { LeadCandidate } from '../../types/domain';

export const upsertCollectedLead = async (jobId: string, candidate: LeadCandidate, allowReinclude: boolean) => {
  const fallbackHash = buildFallbackFirmHash(candidate);

  const { data: existingRows } = await supabaseAdmin
    .from('leads')
    .select('id')
    .or(`google_place_id.eq.${candidate.google_place_id},fallback_firm_hash.eq.${fallbackHash}`)
    .limit(1);

  const existing = existingRows?.[0];
  if (existing && !allowReinclude) {
    await appendRunLog(jobId, {
      event: 'dedupe_skip',
      google_place_id: candidate.google_place_id,
      name: candidate.name
    });
    return { leadId: existing.id as string, inserted: false };
  }

  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .upsert(
      {
        name: candidate.name,
        website: candidate.website,
        phone: candidate.phone,
        address: candidate.address,
        city: candidate.city,
        state: candidate.state,
        zip: candidate.zip,
        google_maps_url: candidate.google_maps_url,
        google_place_id: candidate.google_place_id,
        source_query: candidate.source_query,
        source_geo_label: candidate.source_geo_label,
        fallback_firm_hash: fallbackHash
      },
      { onConflict: 'google_place_id' }
    )
    .select('id')
    .single();

  if (leadError) throw leadError;

  await supabaseAdmin.from('job_results').upsert({
    job_id: jobId,
    lead_id: lead.id,
    primary_contact_id: null
  });

  return { leadId: lead.id as string, inserted: true };
};
