alter table public.jobs
  add column if not exists enrichment_status text not null default 'idle' check (enrichment_status in ('idle','estimated','running','completed','failed')),
  add column if not exists enrichment_estimate_json jsonb,
  add column if not exists enrichment_spend_cap numeric(10,4),
  add column if not exists enrichment_spend_actual numeric(10,4) not null default 0;
