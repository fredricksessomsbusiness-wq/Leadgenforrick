'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ParsedPlan } from '@/types/domain';

interface Job {
  id: string;
  status: string;
  progress_count: number;
  target_firm_count: number;
  user_prompt: string;
  parsed_plan_json: ParsedPlan;
  run_logs: Array<Record<string, unknown>>;
  error_log: string | null;
}

interface CollectBatchLog {
  [key: string]: unknown;
  event: 'collect_batch';
  query?: string;
  segment?: string;
  found?: number;
  new?: number;
  duplicate?: number;
  progress_count?: number;
  api_calls?: {
    textsearch?: number;
    details?: number;
    total?: number;
  };
  estimated_api_cost_usd?: number;
}

const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export default function JobProgressPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
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

  const cancelJob = async () => {
    setCancelBusy(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/cancel-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: params.id })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancel failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelBusy(false);
    }
  };

  const pct = useMemo(() => {
    if (!job || job.target_firm_count <= 0) return 0;
    return Math.min(100, Math.round((job.progress_count / job.target_firm_count) * 100));
  }, [job]);

  const canceled = job?.status === 'failed' && (job.error_log ?? '').includes('Canceled by user');
  const done = job?.status === 'completed' || canceled || !!(job && job.progress_count >= job.target_firm_count);

  const collectLogs = useMemo(
    () =>
      (job?.run_logs ?? []).filter(
        (item): item is CollectBatchLog => typeof item === 'object' && item !== null && item.event === 'collect_batch'
      ),
    [job]
  );

  const metrics = useMemo(() => {
    let found = 0;
    let added = 0;
    let duplicates = 0;
    let textSearchCalls = 0;
    let detailsCalls = 0;
    let totalApiCalls = 0;
    let estimatedApiCostUsd = 0;

    for (const log of collectLogs) {
      found += toNumber(log.found);
      added += toNumber(log.new);
      duplicates += toNumber(log.duplicate);
      textSearchCalls += toNumber(log.api_calls?.textsearch);
      detailsCalls += toNumber(log.api_calls?.details);
      totalApiCalls += toNumber(log.api_calls?.total);
      estimatedApiCostUsd += toNumber(log.estimated_api_cost_usd);
    }

    return {
      found,
      added,
      duplicates,
      textSearchCalls,
      detailsCalls,
      totalApiCalls,
      estimatedApiCostUsd: Number(estimatedApiCostUsd.toFixed(4))
    };
  }, [collectLogs]);

  const latestBatch = collectLogs[collectLogs.length - 1];
  const plan = job?.parsed_plan_json;

  return (
    <main>
      <h1>Collection Progress</h1>
      <div className="card">
        <p>Job: {params.id}</p>
        <p>Status: {canceled ? 'canceled' : job?.status ?? 'loading...'}</p>
        <p>
          Progress: {job?.progress_count ?? 0} / {job?.target_firm_count ?? 0} firms
        </p>
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div>
            <strong>Criteria</strong>
            <p style={{ margin: '6px 0 0' }}>{job?.user_prompt ?? 'Loading...'}</p>
            {plan && (
              <p style={{ margin: '6px 0 0' }}>
                Type: {plan.business_type} | Geo: {plan.geo_mode} | Target: {plan.target_firm_count}
              </p>
            )}
          </div>
          <div>
            <strong>Live Summary</strong>
            <p style={{ margin: '6px 0 0' }}>Found (API matches): {metrics.found}</p>
            <p style={{ margin: '6px 0 0' }}>New leads added: {metrics.added}</p>
            <p style={{ margin: '6px 0 0' }}>Duplicates skipped: {metrics.duplicates}</p>
            <p style={{ margin: '6px 0 0' }}>API calls: {metrics.totalApiCalls} (search {metrics.textSearchCalls}, details {metrics.detailsCalls})</p>
            <p style={{ margin: '6px 0 0' }}>Estimated Places API cost: ${metrics.estimatedApiCostUsd.toFixed(4)}</p>
          </div>
        </div>

        {latestBatch && (
          <p style={{ marginTop: 12 }}>
            Last batch: query "{latestBatch.query ?? ''}" | segment {latestBatch.segment ?? ''} | found {toNumber(latestBatch.found)} |
            new {toNumber(latestBatch.new)} | duplicates {toNumber(latestBatch.duplicate)}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={runBatch} disabled={busy || cancelBusy || done}>Run Next Batch</button>
          <button className="secondary" onClick={cancelJob} disabled={busy || cancelBusy || done}>
            {cancelBusy ? 'Canceling...' : 'Cancel Job'}
          </button>
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
