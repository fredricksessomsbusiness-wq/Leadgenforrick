'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlanEditor } from '@/components/PlanEditor';
import type { ParsedPlan } from '@/types/domain';

interface JobHistory {
  id: string;
  user_prompt: string;
  status: string;
  created_at: string;
  parsed_plan_json?: ParsedPlan;
}

interface JobTemplate {
  id: string;
  name: string;
  description: string | null;
  plan_json: ParsedPlan;
}

const areaSummary = (plan?: ParsedPlan): string => {
  if (!plan) return 'unknown';
  if (plan.geo_mode === 'radius') {
    return `${plan.geo_params.radius_miles ?? 25}mi around ${plan.geo_params.center_city_state ?? 'Durham, NC'}`;
  }
  if (plan.geo_mode === 'zip_sweep') {
    const zips = plan.geo_params.zip_list ?? [];
    if (zips.length === 0) return 'zip_sweep (no zips)';
    return `zip_sweep (${zips.length} zips): ${zips.slice(0, 6).join(', ')}${zips.length > 6 ? '...' : ''}`;
  }
  return `state:${plan.geo_params.state_code ?? 'NC'}`;
};

const planFootprintKey = (plan?: ParsedPlan): string => {
  if (!plan) return '';
  if (plan.geo_mode === 'zip_sweep') {
    const zips = [...(plan.geo_params.zip_list ?? [])].sort().join(',');
    return `${plan.business_type}|zip_sweep|${zips}`;
  }
  if (plan.geo_mode === 'radius') {
    return `${plan.business_type}|radius|${plan.geo_params.center_city_state ?? ''}|${plan.geo_params.radius_miles ?? 25}`;
  }
  return `${plan.business_type}|state|${plan.geo_params.state_code ?? 'NC'}`;
};

export default function CreateJobPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('Find estate planning law firms within 25 miles of Durham NC, collect 500 firms, decision makers, export CSV');
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [planRaw, setPlanRaw] = useState('');
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    const jobsRes = await fetch('/.netlify/functions/list-jobs');
    const jobsJson = await jobsRes.json();
    if (!jobsRes.ok) throw new Error(jobsJson.error || 'Failed to load run history');
    setHistory(jobsJson.jobs ?? []);
  };

  const loadTemplates = async () => {
    const res = await fetch('/.netlify/functions/list-templates');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load templates');
    setTemplates(json.templates ?? []);
  };

  useEffect(() => {
    loadHistory().catch(() => undefined);
    loadTemplates().catch(() => undefined);
  }, []);

  const parsePlan = async () => {
    setBusy(true);
    setError('');
    try {
      const planRes = await fetch('/.netlify/functions/plan-from-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const planJson = await planRes.json();
      if (!planRes.ok) throw new Error(planJson.error || 'Failed to parse prompt');

      setPlan(planJson.plan);
      setPlanRaw(JSON.stringify(planJson.plan, null, 2));
      await loadHistory().catch(() => undefined);
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

  const parsedPlanFromEditor = useMemo(() => {
    if (!planRaw) return null;
    try {
      return JSON.parse(planRaw) as ParsedPlan;
    } catch {
      return null;
    }
  }, [planRaw]);

  const duplicateFootprintMatches = useMemo(() => {
    if (!parsedPlanFromEditor) return [];
    const targetKey = planFootprintKey(parsedPlanFromEditor);
    if (!targetKey) return [];

    return history.filter((job) => planFootprintKey(job.parsed_plan_json) === targetKey);
  }, [parsedPlanFromEditor, history]);

  const applyTemplate = () => {
    const selected = templates.find((t) => t.id === selectedTemplateId);
    if (!selected) return;

    const nextPlan = {
      ...selected.plan_json,
      max_searches: Number(selected.plan_json.max_searches ?? 100)
    } as ParsedPlan;

    setPlan(nextPlan);
    setPlanRaw(JSON.stringify(nextPlan, null, 2));
    setPrompt(`Template: ${selected.name}`);
  };

  const updateMaxSearches = (value: number) => {
    if (!parsedPlanFromEditor) return;
    const next = {
      ...parsedPlanFromEditor,
      max_searches: Number.isFinite(value) && value > 0 ? value : 100
    };
    setPlanRaw(JSON.stringify(next, null, 2));
  };

  const saveTemplate = async () => {
    setError('');
    try {
      if (!parsedPlanFromEditor) throw new Error('Parse or load a valid plan JSON before saving template.');
      if (!templateName.trim()) throw new Error('Template name is required.');

      const res = await fetch('/.netlify/functions/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          plan: parsedPlanFromEditor
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save template');

      setTemplateName('');
      setTemplateDescription('');
      await loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template');
    }
  };

  return (
    <main>
      <h1>Local Lead Finder</h1>
      <p className="page-subnav">
        <Link href="/jobs">View All Lists</Link> | <Link href="/usage">Usage Data</Link>
      </p>

      <div className="card">
        <h3>Configurations</h3>
        <div className="grid grid-2">
          <label>
            Saved Template
            <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
              <option value="">Select template...</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-actions" style={{ alignItems: 'end' }}>
            <button className="secondary" onClick={applyTemplate} disabled={!selectedTemplateId}>Load Template</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Create Job</h3>
        <label htmlFor="prompt">English Prompt</label>
        <textarea id="prompt" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="inline-actions">
          <button onClick={parsePlan} disabled={busy}>Parse Prompt</button>
          <button className="secondary" onClick={createJob} disabled={busy || !planRaw}>Run Collection</button>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      {parsedPlanFromEditor && (
        <div className="card">
          <h3>Search Budget</h3>
          <div className="grid grid-2">
            <label>
              Max Searches Per Job
              <input
                type="number"
                min={1}
                max={5000}
                value={Number(parsedPlanFromEditor.max_searches ?? 100)}
                onChange={(e) => updateMaxSearches(Number(e.target.value))}
              />
            </label>
            <p>
              One search = one keyword+segment query. Job auto-stops when this cap is reached, even if firm target is not met.
            </p>
          </div>
        </div>
      )}

      {parsedPlanFromEditor && (
        <div className="card">
          <h3>Area Re-run Check</h3>
          <p>
            Current footprint: <strong>{parsedPlanFromEditor.business_type}</strong> | <strong>{areaSummary(parsedPlanFromEditor)}</strong>
          </p>
          {duplicateFootprintMatches.length > 0 ? (
            <>
              <p style={{ color: 'var(--danger)' }}>
                This same job type + area footprint has already been run {duplicateFootprintMatches.length} time(s).
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Status</th>
                      <th>Prompt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateFootprintMatches.map((job) => (
                      <tr key={job.id}>
                        <td>{new Date(job.created_at).toLocaleString()}</td>
                        <td>{job.status}</td>
                        <td>{job.user_prompt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--success)' }}>No exact prior run found for this same type + area footprint.</p>
          )}
        </div>
      )}

      <div className="card">
        <h3>Save Current Plan as Template</h3>
        <div className="grid grid-2">
          <label>
            Template Name
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Raleigh Estate Planning Zip Sweep" />
          </label>
          <label>
            Description (optional)
            <input value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="50 firms, zip sweep, decision-makers only" />
          </label>
        </div>
        <div className="inline-actions">
          <button className="secondary" onClick={saveTemplate}>Save Template</button>
        </div>
      </div>

      <div className="card">
        <h3>Previously Run Areas</h3>
        <p>Track what has already been run to avoid duplicate territory scans.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Job Type</th>
                <th>Geo</th>
                <th>Area</th>
              </tr>
            </thead>
            <tbody>
              {history.map((job) => (
                <tr key={job.id}>
                  <td>{new Date(job.created_at).toLocaleString()}</td>
                  <td>{job.status}</td>
                  <td>{job.parsed_plan_json?.business_type ?? 'unknown'}</td>
                  <td>{job.parsed_plan_json?.geo_mode ?? 'unknown'}</td>
                  <td>{areaSummary(job.parsed_plan_json)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PlanEditor plan={plan} raw={planRaw} setRaw={setPlanRaw} />
    </main>
  );
}
