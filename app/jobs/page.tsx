'use client';

import { useEffect, useMemo, useState } from 'react';

interface JobListItem {
  id: string;
  user_prompt: string;
  status: string;
  progress_count: number;
  target_firm_count: number;
  created_at: string;
}

interface ResultRow {
  job_id: string;
  lead_id: string;
  leads: any;
  contacts: any;
}

const headline = (prompt: string): string => {
  const text = prompt.replace(/\s+/g, ' ').trim();
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
};

export default function JobsOverviewPage() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [error, setError] = useState('');

  const loadJobs = async () => {
    const res = await fetch('/.netlify/functions/list-jobs');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load jobs');
    setJobs(json.jobs ?? []);
  };

  const loadResults = async (jobIds: string[]) => {
    if (jobIds.length === 0) {
      setRows([]);
      return;
    }
    const res = await fetch(`/.netlify/functions/list-results?jobIds=${encodeURIComponent(jobIds.join(','))}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load results');
    setRows(json.results ?? []);
  };

  useEffect(() => {
    loadJobs().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadResults(selected).catch((e) => setError(e.message));
  }, [selected]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const summary = useMemo(() => {
    const totalJobs = selected.length;
    const totalRows = rows.length;
    const uniqueLeads = new Set(rows.map((r) => r.lead_id)).size;
    return { totalJobs, totalRows, uniqueLeads };
  }, [rows, selected]);

  return (
    <main>
      <h1>All Lead Lists</h1>
      <p>Select one or multiple requests on the left. Outputs appear on the right.</p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        <div className="card" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <h3>Requests</h3>
          {jobs.map((job) => (
            <label
              key={job.id}
              style={{ display: 'block', border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}
            >
              <input
                type="checkbox"
                checked={selected.includes(job.id)}
                onChange={() => toggle(job.id)}
                style={{ marginRight: 8 }}
              />
              <strong>{headline(job.user_prompt)}</strong>
              <p style={{ margin: '6px 0 0' }}>Status: {job.status}</p>
              <p style={{ margin: '4px 0 0' }}>
                Progress: {job.progress_count}/{job.target_firm_count}
              </p>
            </label>
          ))}
        </div>

        <div className="card" style={{ overflow: 'auto' }}>
          <h3>Table Output</h3>
          <p>
            Selected requests: {summary.totalJobs} | Rows: {summary.totalRows} | Unique firms: {summary.uniqueLeads}
          </p>
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Firm</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
                const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
                return (
                  <tr key={`${r.job_id}-${r.lead_id}-${idx}`}>
                    <td>{r.job_id}</td>
                    <td>{lead?.name}</td>
                    <td>{lead?.phone}</td>
                    <td>{lead?.website}</td>
                    <td>{contact?.full_name}</td>
                    <td>{contact?.email}</td>
                    <td>{contact?.email_status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
