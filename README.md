# Local Lead Finder (Netlify + Supabase)

Production-oriented, compliance-aware, on-demand lead generation for agencies.

## Stack
- Next.js (UI)
- Netlify Functions + Background Functions (batch jobs)
- Supabase Postgres (forever DB, dedupe across jobs)
- Providers: Google Places (collection), website crawl (derived fields), Anymail Search (optional verification)

## Core Behavior
- Prompt -> parsed plan JSON preview/edit before execution
- Collection stops when `target_firm_count` unique firms are collected
- Firm-level dedupe across all jobs by `google_place_id`, fallback firm hash
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
- `ANYMAIL_SEARCH_API_KEY` (required only for verification)
- `ANYMAIL_UNIT_COST_USD` (default `0.01`)
- `VERIFICATION_COST_BUFFER_MULTIPLIER` (default `1.15`)

## Supabase Setup
1. Create Supabase project.
2. Run migration in `supabase/migrations/20260211160000_initial.sql`.
3. Confirm tables:
   - `leads`, `contacts`, `signals`, `jobs`, `job_results`, `email_verifications`

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
- `POST /.netlify/functions/run-collect-batch-background`
- `POST /.netlify/functions/cancel-job`
- `GET /.netlify/functions/list-results?jobId=...`
- `GET /.netlify/functions/export-csv?jobId=...&columns=...`
- `POST /.netlify/functions/estimate-verification`
- `POST /.netlify/functions/run-verify-batch-background`

## Two-Phase Flow
1. Create job: enter prompt, review/edit parsed plan JSON, start collection.
2. Collection: run collect batches until target unique firm count is reached.
3. Results: inspect table, configure export columns/order, download CSV.
4. Optional verification: estimate cost, set spend cap, run verify batches.

## Notes
- V1 intentionally refuses collection when Places key is missing.
- Stored data emphasizes provider IDs + derived fields for compliance posture.
- Verification ledger (`email_verifications`) prevents double-paying on same provider+email.
