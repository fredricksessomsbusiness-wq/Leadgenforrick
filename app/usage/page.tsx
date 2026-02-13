'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface MonthlyRow {
  month: string;
  jobs: number;
  api_calls_total: number;
  leads_new: number;
  leads_duplicates: number;
  places_estimated_cost_usd: number;
  verification_spend_usd: number;
  gross_estimated_spend_usd: number;
  estimated_paid_usd: number;
}

interface JobUsageRow {
  job_id: string;
  created_at: string;
  user_prompt: string;
  status: string;
  target_firm_count: number;
  progress_count: number;
  collect_batches: number;
  api_calls_total: number;
  matches_found: number;
  leads_new: number;
  leads_duplicates: number;
  places_estimated_cost_usd: number;
  verification_spend_usd: number;
  total_estimated_spend_usd: number;
}

interface UsagePayload {
  free_credit_config_usd: number;
  lifetime: {
    jobs: number;
    api_calls_total: number;
    leads_new: number;
    gross_estimated_spend_usd: number;
  };
  monthly: MonthlyRow[];
  jobs: JobUsageRow[];
}

const money = (n: number) => `$${n.toFixed(4)}`;

const shortPrompt = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 90 ? `${clean.slice(0, 90)}...` : clean;
};

export default function UsagePage() {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch('/.netlify/functions/list-usage');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load usage');
    setUsage(json.usage);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const totals = useMemo(() => {
    if (!usage) {
      return {
        estimatedPaid: 0,
        verification: 0,
        places: 0
      };
    }

    const estimatedPaid = usage.monthly.reduce((sum, row) => sum + row.estimated_paid_usd, 0);
    const verification = usage.monthly.reduce((sum, row) => sum + row.verification_spend_usd, 0);
    const places = usage.monthly.reduce((sum, row) => sum + row.places_estimated_cost_usd, 0);
    return {
      estimatedPaid,
      verification,
      places
    };
  }, [usage]);

  return (
    <main>
      <h1>Usage Data</h1>
      <p className="page-subnav">
        <Link href="/">Back to Create Job</Link> | <Link href="/jobs">All Lists</Link>
      </p>
      <p>
        Cross-project usage over time. Costs are estimates from configured unit pricing and run logs.
      </p>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="grid grid-2">
        <div className="card tight">
          <h3>Lifetime</h3>
          <div className="summary-grid">
            <div className="stat-tile">
              <p className="stat-k">Jobs</p>
              <p className="stat-v">{usage?.lifetime.jobs ?? 0}</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Total API Calls</p>
              <p className="stat-v">{usage?.lifetime.api_calls_total ?? 0}</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Total New Leads</p>
              <p className="stat-v">{usage?.lifetime.leads_new ?? 0}</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Gross Est. Spend</p>
              <p className="stat-v">{money(usage?.lifetime.gross_estimated_spend_usd ?? 0)}</p>
            </div>
          </div>
        </div>
        <div className="card tight">
          <h3>Estimated Paid</h3>
          <div className="summary-grid">
            <div className="stat-tile">
              <p className="stat-k">Configured Monthly Free Credit</p>
              <p className="stat-v">{money(usage?.free_credit_config_usd ?? 0)}</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Estimated Paid Across Months</p>
              <p className="stat-v">{money(totals.estimatedPaid)}</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Places Est. Subtotal</p>
              <p className="stat-v">{money(totals.places)}</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Verification Subtotal</p>
              <p className="stat-v">{money(totals.verification)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Monthly Breakdown</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Jobs</th>
                <th>API Calls</th>
                <th>New Leads</th>
                <th>Duplicates</th>
                <th>Places Est.</th>
                <th>Verification</th>
                <th>Gross Est.</th>
                <th>Estimated Paid</th>
              </tr>
            </thead>
            <tbody>
              {(usage?.monthly ?? []).map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{row.jobs}</td>
                  <td>{row.api_calls_total}</td>
                  <td>{row.leads_new}</td>
                  <td>{row.leads_duplicates}</td>
                  <td>{money(row.places_estimated_cost_usd)}</td>
                  <td>{money(row.verification_spend_usd)}</td>
                  <td>{money(row.gross_estimated_spend_usd)}</td>
                  <td>{money(row.estimated_paid_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Per Request (All Projects)</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Request</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Batches</th>
                <th>API Calls</th>
                <th>Found</th>
                <th>New</th>
                <th>Duplicates</th>
                <th>Places Est.</th>
                <th>Verify Spend</th>
                <th>Total Est.</th>
              </tr>
            </thead>
            <tbody>
              {(usage?.jobs ?? []).map((job) => (
                <tr key={job.job_id}>
                  <td>{new Date(job.created_at).toLocaleString()}</td>
                  <td>{shortPrompt(job.user_prompt)}</td>
                  <td>{job.status}</td>
                  <td>
                    {job.progress_count}/{job.target_firm_count}
                  </td>
                  <td>{job.collect_batches}</td>
                  <td>{job.api_calls_total}</td>
                  <td>{job.matches_found}</td>
                  <td>{job.leads_new}</td>
                  <td>{job.leads_duplicates}</td>
                  <td>{money(job.places_estimated_cost_usd)}</td>
                  <td>{money(job.verification_spend_usd)}</td>
                  <td>{money(job.total_estimated_spend_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
