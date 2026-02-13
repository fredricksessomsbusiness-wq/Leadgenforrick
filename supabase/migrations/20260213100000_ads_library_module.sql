alter table public.jobs
  add column if not exists ads_scan_status text not null default 'idle'
    check (ads_scan_status in ('idle','estimated','running','completed','failed')),
  add column if not exists ads_scan_estimate_json jsonb,
  add column if not exists ads_scan_spend_cap numeric(10,2),
  add column if not exists ads_scan_spend_actual numeric(10,2) not null default 0;

create table if not exists public.ads_library_observations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  provider text not null,
  advertiser_name text,
  ads_count_active integer not null default 0,
  ads_count_in_period integer not null default 0,
  period_start date not null,
  period_end date not null,
  first_seen_at date,
  last_seen_at date,
  evidence_url text,
  provider_response jsonb not null default '{}'::jsonb
);

create unique index if not exists ads_library_observations_unique_window
  on public.ads_library_observations (lead_id, provider, period_start, period_end);

create index if not exists ads_library_observations_lead_idx
  on public.ads_library_observations (lead_id);

create index if not exists ads_library_observations_period_ads_idx
  on public.ads_library_observations (period_start, period_end, ads_count_in_period);

create trigger ads_library_observations_set_updated_at before update on public.ads_library_observations
for each row execute function public.set_updated_at();

alter table public.ads_library_observations enable row level security;
