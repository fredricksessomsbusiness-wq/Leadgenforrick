'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_COLUMNS = [
  'Firm Name',
  'Website',
  'Phone',
  'Address',
  'City',
  'State',
  'Zip',
  'Primary Contact Name',
  'Primary Contact Title',
  'Email',
  'Email Status',
  'Google Maps URL',
  'Contact Form URL',
  'Professional Hook 1',
  'Professional Hook 2',
  'Evidence URLs',
  'Notes'
];

export default function ResultsPage({ params }: { params: { id: string } }) {
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [estimate, setEstimate] = useState<any | null>(null);
  const [spendCap, setSpendCap] = useState('25');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [validOnly, setValidOnly] = useState(true);
  const [generateCandidates, setGenerateCandidates] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [error, setError] = useState('');

  const loadResults = async () => {
    const res = await fetch(`/.netlify/functions/list-results?jobId=${params.id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load results');
    setRows(json.results ?? []);
  };

  useEffect(() => {
    loadResults().catch((e) => setError(e.message));
  }, [params.id]);

  const reorder = (idx: number, dir: -1 | 1) => {
    const next = [...columns];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setColumns(next);
  };

  const exportUrl = useMemo(
    () => `/.netlify/functions/export-csv?jobId=${params.id}&columns=${encodeURIComponent(columns.join(','))}`,
    [params.id, columns]
  );

  const runEstimate = async () => {
    setError('');
    const res = await fetch('/.netlify/functions/estimate-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: params.id })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed estimate');
    setEstimate(json.estimate);
  };

  const runVerifyBatch = async () => {
    setVerifyBusy(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/run-verify-batch-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: params.id,
          spendCap: Number(spendCap),
          validOnly,
          generateCandidates,
          maxAttemptsPerFirm: maxAttempts
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Verification failed');
      await loadResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <main>
      <h1>Results</h1>

      <div className="card">
        <h3>Export Builder</h3>
        <p>Choose columns and order.</p>
        <div className="grid grid-2">
          {columns.map((column, idx) => (
            <div key={column} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ minWidth: 190 }}>{column}</span>
              <button className="secondary" onClick={() => reorder(idx, -1)}>Up</button>
              <button className="secondary" onClick={() => reorder(idx, 1)}>Down</button>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 12 }}>
          <a href={exportUrl}>
            <button>Export CSV</button>
          </a>
        </p>
      </div>

      <div className="card">
        <h3>Verify Emails (Optional)</h3>
        <div className="grid grid-2">
          <label>
            <input type="checkbox" checked={validOnly} onChange={(e) => setValidOnly(e.target.checked)} /> Valid-only enforcement
          </label>
          <label>
            <input
              type="checkbox"
              checked={generateCandidates}
              onChange={(e) => setGenerateCandidates(e.target.checked)}
            />{' '}
            Generate candidates from patterns
          </label>
          <label>
            Max attempts per firm
            <input
              type="number"
              value={maxAttempts}
              min={1}
              max={10}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
            />
          </label>
          <label>
            Max spend cap ($)
            <input value={spendCap} onChange={(e) => setSpendCap(e.target.value)} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={runEstimate}>Estimate Cost</button>
          <button className="secondary" onClick={runVerifyBatch} disabled={verifyBusy}>Run Verify Batch</button>
        </div>

        {estimate && <pre>{JSON.stringify(estimate, null, 2)}</pre>}
      </div>

      <div className="card">
        <h3>Lead Table</h3>
        <table>
          <thead>
            <tr>
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
                <tr key={`${r.lead_id}-${idx}`}>
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
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </main>
  );
}
