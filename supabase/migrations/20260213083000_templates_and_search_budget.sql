alter table public.jobs
  add column if not exists max_searches integer,
  add column if not exists searches_executed integer not null default 0;

create table if not exists public.job_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  description text,
  plan_json jsonb not null,
  is_active boolean not null default true
);

create index if not exists job_templates_created_at_idx on public.job_templates (created_at desc);

alter table public.job_templates enable row level security;

create trigger job_templates_set_updated_at before update on public.job_templates
for each row execute function public.set_updated_at();
