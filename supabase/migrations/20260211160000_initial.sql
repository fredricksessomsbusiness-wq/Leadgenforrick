create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  website text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  google_maps_url text,
  google_place_id text,
  source_query text,
  source_geo_label text,
  tags text[] default '{}',
  primary_contact_id uuid,
  contact_form_url text,
  fallback_firm_hash text,
  exported_at timestamptz,
  contacted_at timestamptz,
  do_not_contact boolean not null default false,
  bounced boolean not null default false,
  duplicate_of uuid references public.leads(id)
);

create unique index if not exists leads_google_place_id_uidx
  on public.leads (google_place_id)
  where google_place_id is not null;

create unique index if not exists leads_fallback_hash_uidx
  on public.leads (fallback_firm_hash)
  where fallback_firm_hash is not null;

create index if not exists leads_city_state_idx on public.leads (city, state);
create index if not exists leads_zip_idx on public.leads (zip);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  full_name text,
  first_name text,
  last_name text,
  title text,
  email text,
  email_status text not null default 'none' check (email_status in ('valid','invalid','unknown','catch_all','risky','unverified','none')),
  email_source text,
  email_verified_at timestamptz,
  phone_direct text,
  linkedin_url text
);

create index if not exists contacts_lead_id_idx on public.contacts (lead_id);
create index if not exists contacts_email_idx on public.contacts (email);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  signal_type text not null,
  signal_value text not null,
  evidence_url text
);

create index if not exists signals_lead_id_idx on public.signals (lead_id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'draft' check (status in ('draft','queued','running','completed','failed')),
  user_prompt text not null,
  parsed_plan_json jsonb not null,
  toggles_json jsonb not null,
  target_firm_count integer not null,
  progress_count integer not null default 0,
  current_segment_offset integer not null default 0,
  current_keyword_offset integer not null default 0,
  current_place_offset integer not null default 0,
  allow_reinclude boolean not null default false,
  error_log text,
  run_logs jsonb not null default '[]'::jsonb,
  verification_status text not null default 'idle' check (verification_status in ('idle','estimated','running','completed','failed')),
  verification_estimate_json jsonb,
  verification_spend_cap numeric(10,2),
  verification_spend_actual numeric(10,2) not null default 0
);

create table if not exists public.job_results (
  job_id uuid not null references public.jobs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_id, lead_id)
);

create index if not exists job_results_job_id_idx on public.job_results (job_id);

create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid references public.contacts(id) on delete cascade,
  email text not null,
  provider text not null,
  status text not null,
  confidence numeric(5,4),
  provider_response jsonb not null,
  verified_at timestamptz not null default now(),
  unique (email, provider)
);

alter table public.leads
  add constraint leads_primary_contact_fk
  foreign key (primary_contact_id)
  references public.contacts(id)
  on delete set null;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();

create trigger contacts_set_updated_at before update on public.contacts
for each row execute function public.set_updated_at();

-- Enable RLS with conservative defaults (service role for backend writes).
alter table public.leads enable row level security;
alter table public.contacts enable row level security;
alter table public.signals enable row level security;
alter table public.jobs enable row level security;
alter table public.job_results enable row level security;
alter table public.email_verifications enable row level security;
