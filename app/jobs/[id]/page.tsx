'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface Job {
  id: string;
  status: string;
  progress_count: number;
  target_firm_count: number;
  run_logs: Array<Record<string, unknown>>;
}

export default function JobProgressPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch(`/.netlify/functions/get-job?jobId=${params.id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load job');
    setJob(json.job);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 3500);
    return () => clearInterval(timer);
  }, [params.id]);

  const runBatch = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/run-collect-batch-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: params.id })
      });
      const text = await res.text();
      let json: { error?: string } = {};
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          // Netlify background functions can return empty/non-JSON bodies.
        }
      }
      if (!res.ok) throw new Error(json.error || text || `Batch failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch failed');
    } finally {
      setBusy(false);
    }
  };

  const pct = useMemo(() => {
    if (!job || job.target_firm_count <= 0) return 0;
    return Math.min(100, Math.round((job.progress_count / job.target_firm_count) * 100));
  }, [job]);

  const done = job?.status === 'completed' || !!(job && job.progress_count >= job.target_firm_count);

  return (
    <main>
      <h1>Collection Progress</h1>
      <div className="card">
        <p>Job: {params.id}</p>
        <p>Status: {job?.status ?? 'loading...'}</p>
        <p>
          Progress: {job?.progress_count ?? 0} / {job?.target_firm_count ?? 0} firms
        </p>
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={runBatch} disabled={busy || done}>Run Next Batch</button>
          {done && (
            <Link href={`/jobs/${params.id}/results`}>
              <button className="secondary">Open Results</button>
            </Link>
          )}
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      <div className="card">
        <h3>Run Logs</h3>
        <pre>{JSON.stringify(job?.run_logs ?? [], null, 2)}</pre>
      </div>
    </main>
  );
}
