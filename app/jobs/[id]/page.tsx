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

const AUTO_RUN_DELAY_MS = 2200;
const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export default function JobProgressPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(`auto_run_job_${params.id}`);
    if (saved === '1') setAutoRun(true);
  }, [params.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`auto_run_job_${params.id}`, autoRun ? '1' : '0');
  }, [params.id, autoRun]);

  const runBatch = async (triggeredByAutoRun = false) => {
    if (busy || cancelBusy) return;

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
      if (triggeredByAutoRun) setAutoRun(false);
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
      setAutoRun(false);
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
  const readyForManualNextBatch = !done && !autoRun && !busy && !cancelBusy;

  useEffect(() => {
    if (!autoRun || done || busy || cancelBusy) return;

    const timer = setTimeout(() => {
      runBatch(true).catch(() => undefined);
    }, AUTO_RUN_DELAY_MS);

    return () => clearTimeout(timer);
  }, [autoRun, done, busy, cancelBusy, job?.progress_count, job?.status]);

  useEffect(() => {
    if (!autoRun) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [autoRun]);

  useEffect(() => {
    if (done && autoRun) setAutoRun(false);
  }, [done, autoRun]);

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
      <div className="inline-actions" style={{ marginBottom: 12 }}>
        <Link href="/">
          <button className="secondary">Create Job</button>
        </Link>
        <Link href="/jobs">
          <button className="secondary">All Jobs / Lists</button>
        </Link>
        <Link href="/usage">
          <button className="secondary">Usage Data</button>
        </Link>
        <Link href={`/jobs/${params.id}/results`}>
          <button className="secondary">Current Job Results</button>
        </Link>
      </div>
      <div className="card">
        <p>Job: {params.id}</p>
        <p>
          Status:{' '}
          <span className={`badge ${canceled ? 'danger' : job?.status === 'running' ? 'warn' : ''}`}>
            {canceled ? 'canceled' : job?.status ?? 'loading...'}
          </span>
        </p>
        <p>
          Progress: {job?.progress_count ?? 0} / {job?.target_firm_count ?? 0} firms
        </p>
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>

        {!done && (
          <p style={{ marginTop: 10 }}>
            Next action:{' '}
            <span className={`badge ${autoRun ? '' : readyForManualNextBatch ? 'warn' : ''}`}>
              {autoRun
                ? 'Auto Run is handling batches'
                : readyForManualNextBatch
                  ? 'Click Run Next Batch now'
                  : busy
                    ? 'Batch is currently running'
                    : 'Waiting'}
            </span>
          </p>
        )}

        {autoRun && !done && (
          <p style={{ marginTop: 10 }}>
            Auto-run is active. Keep this page open. If you close/reload, open this job again and click Auto Run to continue.
          </p>
        )}

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
            <div className="summary-grid">
              <div className="stat-tile">
                <p className="stat-k">Found Matches</p>
                <p className="stat-v">{metrics.found}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-k">New Leads</p>
                <p className="stat-v">{metrics.added}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-k">Duplicates</p>
                <p className="stat-v">{metrics.duplicates}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-k">API Calls</p>
                <p className="stat-v">{metrics.totalApiCalls}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-k">Search Calls</p>
                <p className="stat-v">{metrics.textSearchCalls}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-k">Details Calls</p>
                <p className="stat-v">{metrics.detailsCalls}</p>
              </div>
              <div className="stat-tile">
                <p className="stat-k">Estimated Cost (Places)</p>
                <p className="stat-v">${metrics.estimatedApiCostUsd.toFixed(4)}</p>
              </div>
            </div>
          </div>
        </div>

        {latestBatch && (
          <p style={{ marginTop: 12 }}>
            Last batch: query "{latestBatch.query ?? ''}" | segment {latestBatch.segment ?? ''} | found {toNumber(latestBatch.found)} |
            new {toNumber(latestBatch.new)} | duplicates {toNumber(latestBatch.duplicate)}
          </p>
        )}

        <div className="inline-actions">
          <button onClick={() => runBatch(false)} disabled={busy || cancelBusy || done || autoRun}>Run Next Batch Now</button>
          <button className="secondary" onClick={() => setAutoRun((v) => !v)} disabled={busy || cancelBusy || done}>
            {autoRun ? 'Pause Auto Run' : 'Auto Run'}
          </button>
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
        <div className="table-wrap">
          <pre style={{ margin: 0, border: 0, borderRadius: 0 }}>{JSON.stringify(job?.run_logs ?? [], null, 2)}</pre>
        </div>
      </div>
    </main>
  );
}
