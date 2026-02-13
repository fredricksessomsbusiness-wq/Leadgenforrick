import { supabaseAdmin } from '../supabase';
import { buildFallbackFirmHash } from '../dedupe';
import { choosePrimaryContact } from '../decision-maker';
import { appendRunLog } from './jobs';
import type { CrawlResult, LeadCandidate } from '../../types/domain';

const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/);
  return {
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts[parts.length - 1] : null
  };
};

export const upsertLeadAndCrawl = async (
  jobId: string,
  candidate: LeadCandidate,
  crawl: CrawlResult,
  allowReinclude: boolean
) => {
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

  const leadPayload = {
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
    fallback_firm_hash: fallbackHash,
    contact_form_url: crawl.contact_form_url
  };

  let lead: any = null;
  let leadError: any = null;

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(leadPayload)
      .eq('id', existing.id)
      .select('*')
      .single();
    lead = data;
    leadError = error;
  } else {
    const { data, error } = await supabaseAdmin.from('leads').insert(leadPayload).select('*').single();
    lead = data;
    leadError = error;
  }

  if (leadError) throw leadError;

  const contactRows = crawl.contacts.map((c) => ({
    lead_id: lead.id,
    full_name: c.full_name,
    title: c.title,
    ...splitName(c.full_name),
    email_status: 'none'
  }));

  let insertedContacts: Array<{ id: string; full_name: string; title: string | null }> = [];
  if (contactRows.length > 0) {
    const { data: contactsData, error: contactErr } = await supabaseAdmin
      .from('contacts')
      .insert(contactRows)
      .select('id,full_name,title');
    if (contactErr) throw contactErr;
    insertedContacts = contactsData ?? [];
  }

  if (crawl.emails.length > 0 && insertedContacts.length > 0) {
    await supabaseAdmin
      .from('contacts')
      .update({
        email: crawl.emails[0],
        email_status: 'unverified',
        email_source: 'found_on_site'
      })
      .eq('id', insertedContacts[0].id);
  }

  if (crawl.phones.length > 0 && insertedContacts.length > 0) {
    await supabaseAdmin.from('contacts').update({ phone_direct: crawl.phones[0] }).eq('id', insertedContacts[0].id);
  }

  if (crawl.signals.length > 0) {
    await supabaseAdmin.from('signals').insert(
      crawl.signals.map((s) => ({
        lead_id: lead.id,
        signal_type: s.signal_type,
        signal_value: s.signal_value,
        evidence_url: s.evidence_url
      }))
    );
  }

  const primary = choosePrimaryContact(insertedContacts);
  if (primary) {
    await supabaseAdmin.from('leads').update({ primary_contact_id: primary.id }).eq('id', lead.id);
    await supabaseAdmin.from('job_results').upsert({
      job_id: jobId,
      lead_id: lead.id,
      primary_contact_id: primary.id
    });
  } else {
    await supabaseAdmin.from('job_results').upsert({
      job_id: jobId,
      lead_id: lead.id,
      primary_contact_id: null
    });
  }

  return { leadId: lead.id as string, inserted: true };
};
