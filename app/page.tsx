'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlanEditor } from '@/components/PlanEditor';
import type { ParsedPlan } from '@/types/domain';

export default function CreateJobPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('Find estate planning law firms within 25 miles of Durham NC, collect 500 firms, decision makers, export CSV');
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [planRaw, setPlanRaw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parsePlan = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/plan-from-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to parse prompt');
      setPlan(json.plan);
      setPlanRaw(JSON.stringify(json.plan, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse prompt');
    } finally {
      setBusy(false);
    }
  };

  const createJob = async () => {
    setBusy(true);
    setError('');
    try {
      const editedPlan = JSON.parse(planRaw);
      const res = await fetch('/.netlify/functions/create-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, plan: editedPlan })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create job');
      router.push(`/jobs/${json.job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create job failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>Local Lead Finder</h1>
      <div className="card">
        <h3>Create Job</h3>
        <label htmlFor="prompt">English Prompt</label>
        <textarea id="prompt" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={parsePlan} disabled={busy}>Parse Prompt</button>
          <button className="secondary" onClick={createJob} disabled={busy || !planRaw}>Run Collection</button>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      <PlanEditor plan={plan} raw={planRaw} setRaw={setPlanRaw} />
    </main>
  );
}
