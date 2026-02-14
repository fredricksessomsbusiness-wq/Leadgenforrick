# Local Lead Finder (Netlify + Supabase)

Production-oriented, compliance-aware, on-demand lead generation for agencies.

## Stack
- Next.js (UI)
- Netlify Functions + Background Functions (batch jobs)
- Supabase Postgres (forever DB, dedupe across jobs)
- Providers: Google Places (collection), website crawl (derived fields), Anymail Search (optional verification)

## Core Behavior
- Prompt -> parsed plan JSON preview/edit before execution
- Save/reuse job templates (configuration presets)
- Collection stops when `target_firm_count` unique firms are collected
- Firm-level dedupe across all jobs by `google_place_id`, fallback firm hash
- Geo collection supports zip-by-zip sweep and defaults to zip sweep for state-level prompts
- Search budget control: each job can set `max_searches` and auto-stop at that cap
- Crawl each new firm for contact paths + decision-maker data
- Export CSV with custom columns/order
- Email verification is optional and post-collection only
- Verification requires estimate + max spend cap and stops at cap

## Project Structure
- `/app` Next.js UI (Create Job, Progress, Results)
- `/netlify/functions` serverless + background endpoints
- `/lib` shared planner, provider, crawl, dedupe, verification, DB modules
- `/supabase/migrations` SQL schema

## Required Environment Variables
Copy `.env.example` -> `.env` and set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_PLACES_API_KEY` (required for Phase 1 collection)
- `GOOGLE_TEXTSEARCH_UNIT_COST_USD` (optional, for API cost estimate in progress UI)
- `GOOGLE_DETAILS_UNIT_COST_USD` (optional, for API cost estimate in progress UI)
- `GOOGLE_MONTHLY_FREE_CREDIT_USD` (optional, used by Usage Data page to estimate paid amount)
- `ANYMAIL_SEARCH_API_KEY` (required only for verification)
- `ANYMAIL_UNIT_COST_USD` (default `0.01`)
- `VERIFICATION_COST_BUFFER_MULTIPLIER` (default `1.15`)
- `ADS_LIBRARY_PROVIDER` (`none`, `custom_http`, or `dataforseo`)
- `ADS_LIBRARY_API_URL` (required when `ADS_LIBRARY_PROVIDER=custom_http`)
- `ADS_LIBRARY_API_KEY` (optional bearer token for provider)
- `DATAFORSEO_LOGIN` (required when `ADS_LIBRARY_PROVIDER=dataforseo`)
- `DATAFORSEO_PASSWORD` (required when `ADS_LIBRARY_PROVIDER=dataforseo`)
- `DATAFORSEO_LOCATION_CODE` (optional, default `2840` for US)
- `ADS_LIBRARY_UNIT_COST_USD` (default `0.01`)
- `ADS_LIBRARY_COST_BUFFER_MULTIPLIER` (default `1.10`)

## Supabase Setup
1. Create Supabase project.
2. Run migration in `supabase/migrations/20260211160000_initial.sql`.
3. Confirm tables:
   - `leads`, `contacts`, `signals`, `jobs`, `job_results`, `email_verifications`
4. Run follow-up migration:
   - `supabase/migrations/20260213083000_templates_and_search_budget.sql`
   - `supabase/migrations/20260213090000_enrichment_phase.sql`
   - `supabase/migrations/20260213100000_ads_library_module.sql`

## Netlify Setup
1. Connect repo in Netlify.
2. Configure env vars in Netlify site settings.
3. Deploy with `netlify.toml` (Next.js plugin enabled).

## Local Development
1. `npm install`
2. `npm run dev`
3. Open [http://localhost:3000](http://localhost:3000)

## Function Endpoints
- `POST /.netlify/functions/plan-from-prompt`
- `POST /.netlify/functions/create-job`
- `GET /.netlify/functions/get-job?jobId=...`
- `GET /.netlify/functions/list-jobs`
- `GET /.netlify/functions/list-templates`
- `POST /.netlify/functions/save-template`
- `GET /.netlify/functions/list-usage`
- `POST /.netlify/functions/run-collect-batch-background`
- `POST /.netlify/functions/cancel-job`
- `GET /.netlify/functions/list-results?jobId=...`
- `GET /.netlify/functions/export-csv?jobId=...&columns=...`
- `POST /.netlify/functions/estimate-verification`
- `POST /.netlify/functions/run-verify-batch-background`
- `POST /.netlify/functions/estimate-enrichment`
- `POST /.netlify/functions/run-enrichment-batch-background`
- `POST /.netlify/functions/estimate-ads-library`
- `POST /.netlify/functions/run-ads-library-batch-background`

## Two-Phase Flow
1. Create job: enter prompt, review/edit parsed plan JSON, start collection.
2. Collection: run collect batches until target unique firm count is reached.
3. Results: inspect table, configure export columns/order, download CSV.
4. Optional verification: estimate cost, set spend cap, run verify batches.
5. Verification can be run on selected leads only (checkbox selection in Results), with configurable verification batch size.
6. Optional ads scan: estimate Ads Library scan cost, set spend cap, and run batch scans by selected leads and period days.

## Execution Model (Important)
- Collection is **not** a continuous runner loop in the current version.
- Jobs can show status `running` while idle between batch triggers.
- Progress only advances when `run-collect-batch-background` is triggered (UI `Run Next Batch`).
- UI `Auto Run` repeatedly triggers batches on a timer, but only while the page is open.
- If the page is closed, auto-run stops; reopen the job and click `Auto Run` to resume from saved progress.
- Verification follows the same batch model and is not continuous auto-processing.
- Use `Cancel Job` to stop a running job early.

## Notes
- V1 intentionally refuses collection when Places key is missing.
- Stored data emphasizes provider IDs + derived fields for compliance posture.
- Verification ledger (`email_verifications`) prevents double-paying on same provider+email.
- Usage Data (`/usage`) reports aggregate API usage and estimated cost over time from run logs and configured unit costs.
- Results page includes an indicator guide toggle for status meanings (e.g., `valid`, `unverified`, `none`).
- Home page includes a run-history area tracker to avoid re-running the same job type + location footprint.
