'use client';

import { useEffect, useMemo, useState } from 'react';

interface JobSummary {
  id: string;
  user_prompt: string;
  status: string;
  progress_count: number;
  target_firm_count: number;
  created_at: string;
}

interface LeadRow {
  job_id: string;
  lead_id: string;
  leads?: any;
  contacts?: any;
  signals?: any[];
  lead_contacts?: any[];
  ads_observations?: any[];
  source_job_ids?: string[];
}

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
] as const;

type ExportColumn = (typeof DEFAULT_COLUMNS)[number];

type Ternary = 'all' | 'yes' | 'no';
type SavedView = 'all' | 'export_ready' | 'needs_verification' | 'decision_makers_only' | 'ads_active';

const statusBadgeClass = (status: string | null | undefined) => {
  if (!status || status === 'none') return 'badge';
  if (status === 'valid') return 'badge';
  if (status === 'unverified' || status === 'unknown') return 'badge warn';
  if (status === 'invalid' || status === 'risky' || status === 'catch_all') return 'badge danger';
  return 'badge warn';
};

const shortPrompt = (prompt: string) => {
  if (!prompt) return 'Untitled job';
  return prompt.length > 90 ? `${prompt.slice(0, 90)}...` : prompt;
};

const csvEscape = (value: unknown): string => {
  const s = String(value ?? '');
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export default function ResultsPage({ params }: { params: { id: string } }) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([params.id]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [hasPhoneFilter, setHasPhoneFilter] = useState<Ternary>('all');
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState<Ternary>('all');
  const [hasContactFormFilter, setHasContactFormFilter] = useState<Ternary>('all');
  const [adsMinCountFilter, setAdsMinCountFilter] = useState(0);

  const [savedView, setSavedView] = useState<SavedView>('all');
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState('');

  const [columns, setColumns] = useState<ExportColumn[]>([...DEFAULT_COLUMNS]);
  const [exportScope, setExportScope] = useState<'filtered' | 'selected'>('filtered');

  const [estimate, setEstimate] = useState<any | null>(null);
  const [spendCap, setSpendCap] = useState('25');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [validOnly, setValidOnly] = useState(true);
  const [generateCandidates, setGenerateCandidates] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [batchSize, setBatchSize] = useState(20);

  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichmentMode, setEnrichmentMode] = useState<'budget' | 'deep'>('budget');
  const [enrichmentEstimate, setEnrichmentEstimate] = useState<any | null>(null);
  const [enrichmentBatchSize, setEnrichmentBatchSize] = useState(20);
  const [enrichmentLeadsPerCompany, setEnrichmentLeadsPerCompany] = useState(3);
  const [enrichmentSpendCap, setEnrichmentSpendCap] = useState('0.60');

  const [adsBusy, setAdsBusy] = useState(false);
  const [adsEstimate, setAdsEstimate] = useState<any | null>(null);
  const [adsPeriodDays, setAdsPeriodDays] = useState(30);
  const [adsMinCount, setAdsMinCount] = useState(1);
  const [adsBatchSize, setAdsBatchSize] = useState(20);
  const [adsSpendCap, setAdsSpendCap] = useState('15');

  const loadJobs = async () => {
    const res = await fetch('/.netlify/functions/list-jobs');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load jobs');
    const nextJobs = (json.jobs ?? []) as JobSummary[];
    setJobs(nextJobs);

    setSelectedJobIds((prev) => {
      if (prev.length > 0) return prev;
      if (nextJobs.some((j) => j.id === params.id)) return [params.id];
      return nextJobs.length > 0 ? [nextJobs[0].id] : [];
    });
  };

  const loadResults = async (jobIds: string[]) => {
    if (jobIds.length === 0) {
      setRows([]);
      setSelectedLeadIds([]);
      return;
    }
    const query = `jobIds=${encodeURIComponent(jobIds.join(','))}`;
    const res = await fetch(`/.netlify/functions/list-results?${query}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load results');

    const nextRows = (json.results ?? []) as LeadRow[];
    setRows(nextRows);

    setSelectedLeadIds((prev) => {
      const valid = new Set(nextRows.map((r) => String(r.lead_id)));
      return prev.filter((id) => valid.has(id));
    });
  };

  useEffect(() => {
    loadJobs().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load jobs'));
  }, [params.id]);

  useEffect(() => {
    loadResults(selectedJobIds).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load results'));
  }, [selectedJobIds]);

  const jobNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const job of jobs) map.set(job.id, shortPrompt(job.user_prompt));
    return map;
  }, [jobs]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      const leadContacts = Array.isArray(row.lead_contacts) ? row.lead_contacts : [];
      const ads = Array.isArray(row.ads_observations) ? row.ads_observations : [];
      const latestAds = ads.length
        ? [...ads].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
        : null;

      if (term) {
        const haystack = [
          lead?.name,
          lead?.city,
          lead?.state,
          lead?.zip,
          lead?.website,
          lead?.address,
          contact?.full_name,
          contact?.title,
          contact?.email,
          ...leadContacts.map((c: any) => c?.full_name),
          ...leadContacts.map((c: any) => c?.title)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (emailStatusFilter !== 'all' && String(contact?.email_status ?? 'none') !== emailStatusFilter) return false;
      if (stateFilter !== 'all' && String(lead?.state ?? '') !== stateFilter) return false;

      const hasPhone = Boolean(lead?.phone);
      if (hasPhoneFilter === 'yes' && !hasPhone) return false;
      if (hasPhoneFilter === 'no' && hasPhone) return false;

      const hasWebsite = Boolean(lead?.website);
      if (hasWebsiteFilter === 'yes' && !hasWebsite) return false;
      if (hasWebsiteFilter === 'no' && hasWebsite) return false;

      const hasContactForm = Boolean(lead?.contact_form_url);
      if (hasContactFormFilter === 'yes' && !hasContactForm) return false;
      if (hasContactFormFilter === 'no' && hasContactForm) return false;

      if (Number(adsMinCountFilter) > 0 && Number(latestAds?.ads_count_in_period ?? 0) < Number(adsMinCountFilter)) {
        return false;
      }

      if (savedView === 'decision_makers_only') {
        const title = String(contact?.title ?? '').toLowerCase();
        if (!/(managing partner|founder|owner|principal|partner|attorney|manager|coordinator)/.test(title)) {
          return false;
        }
      }

      return true;
    });
  }, [rows, searchTerm, emailStatusFilter, stateFilter, hasPhoneFilter, hasWebsiteFilter, hasContactFormFilter, adsMinCountFilter, savedView]);

  const counts = useMemo(() => {
    const selectedSet = new Set(selectedLeadIds);
    const exportReady = filteredRows.filter((row) => {
      const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      return contact?.email_status === 'valid';
    }).length;
    const verified = filteredRows.filter((row) => {
      const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      return contact?.email_status === 'valid';
    }).length;

    return {
      jobsSelected: selectedJobIds.length,
      inScope: rows.length,
      filtered: filteredRows.length,
      selected: filteredRows.filter((r) => selectedSet.has(String(r.lead_id))).length,
      exportReady,
      verified
    };
  }, [selectedJobIds.length, rows.length, filteredRows, selectedLeadIds]);

  const stateOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const row of rows) {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      if (lead?.state) unique.add(String(lead.state));
    }
    return Array.from(unique).sort();
  }, [rows]);

  const applySavedView = (view: SavedView) => {
    setSavedView(view);
    if (view === 'all') {
      setEmailStatusFilter('all');
      setHasPhoneFilter('all');
      setHasWebsiteFilter('all');
      setHasContactFormFilter('all');
      setAdsMinCountFilter(0);
      return;
    }
    if (view === 'export_ready') {
      setEmailStatusFilter('valid');
      setHasPhoneFilter('yes');
      setHasWebsiteFilter('all');
      setHasContactFormFilter('all');
      setAdsMinCountFilter(0);
      return;
    }
    if (view === 'needs_verification') {
      setEmailStatusFilter('unverified');
      setHasPhoneFilter('all');
      setHasWebsiteFilter('all');
      setHasContactFormFilter('all');
      setAdsMinCountFilter(0);
      return;
    }
    if (view === 'decision_makers_only') {
      setEmailStatusFilter('all');
      setHasPhoneFilter('all');
      setHasWebsiteFilter('all');
      setHasContactFormFilter('all');
      setAdsMinCountFilter(0);
      return;
    }
    if (view === 'ads_active') {
      setEmailStatusFilter('all');
      setHasPhoneFilter('all');
      setHasWebsiteFilter('all');
      setHasContactFormFilter('all');
      setAdsMinCountFilter(1);
    }
  };

  const toggleJobScope = (jobId: string) => {
    setSelectedJobIds((prev) => {
      if (prev.includes(jobId)) {
        const next = prev.filter((id) => id !== jobId);
        return next.length > 0 ? next : [jobId];
      }
      return [...prev, jobId];
    });
  };

  const setScopeAll = () => setSelectedJobIds(jobs.map((j) => j.id));
  const setScopeCurrent = () => setSelectedJobIds([params.id]);
  const setScopeCompleted = () => {
    const completed = jobs.filter((j) => j.status === 'completed').map((j) => j.id);
    setSelectedJobIds(completed.length > 0 ? completed : [params.id]);
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) => (prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]));
  };

  const selectVisible = () => {
    const visibleIds = filteredRows.map((r) => String(r.lead_id));
    setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const selectFilteredOnly = () => {
    setSelectedLeadIds(filteredRows.map((r) => String(r.lead_id)));
  };

  const clearSelection = () => setSelectedLeadIds([]);

  const reorderColumn = (idx: number, dir: -1 | 1) => {
    const next = [...columns];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setColumns(next);
  };

  const selectedLeadIdSet = useMemo(() => new Set(selectedLeadIds), [selectedLeadIds]);

  const getColumnValue = (row: LeadRow, column: ExportColumn): string => {
    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    const signals = Array.isArray(row.signals) ? row.signals : [];

    const hookSignals = signals.filter((s: any) => String(s.signal_type).includes('hook'));
    const evidenceUrls = signals
      .map((s: any) => s?.evidence_url)
      .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);

    switch (column) {
      case 'Firm Name':
        return String(lead?.name ?? '');
      case 'Website':
        return String(lead?.website ?? '');
      case 'Phone':
        return String(lead?.phone ?? '');
      case 'Address':
        return String(lead?.address ?? '');
      case 'City':
        return String(lead?.city ?? '');
      case 'State':
        return String(lead?.state ?? '');
      case 'Zip':
        return String(lead?.zip ?? '');
      case 'Primary Contact Name':
        return String(contact?.full_name ?? '');
      case 'Primary Contact Title':
        return String(contact?.title ?? '');
      case 'Email':
        return contact?.email_status === 'valid' ? String(contact?.email ?? '') : '';
      case 'Email Status':
        return String(contact?.email_status ?? 'none');
      case 'Google Maps URL':
        return String(lead?.google_maps_url ?? '');
      case 'Contact Form URL':
        return String(lead?.contact_form_url ?? '');
      case 'Professional Hook 1':
        return String(hookSignals[0]?.signal_value ?? '');
      case 'Professional Hook 2':
        return String(hookSignals[1]?.signal_value ?? '');
      case 'Evidence URLs':
        return evidenceUrls.join(' | ');
      case 'Notes':
        return '';
      default:
        return '';
    }
  };

  const exportRows = useMemo(() => {
    if (exportScope === 'selected') {
      return filteredRows.filter((r) => selectedLeadIdSet.has(String(r.lead_id)));
    }
    return filteredRows;
  }, [exportScope, filteredRows, selectedLeadIdSet]);

  const downloadCsv = () => {
    const header = columns.map((c) => csvEscape(c)).join(',');
    const lines = exportRows.map((row) => columns.map((c) => csvEscape(getColumnValue(row, c))).join(','));
    const csv = [header, ...lines].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const withScopePayload = (extra: Record<string, unknown>) => ({
    jobId: params.id,
    scopeJobIds: selectedJobIds,
    selectedLeadIds,
    ...extra
  });

  const runEstimate = async () => {
    setError('');
    if (selectedLeadIds.length === 0) {
      setError('Select at least one lead before estimating verification cost.');
      return;
    }
    const res = await fetch('/.netlify/functions/estimate-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withScopePayload({}))
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed estimate');
    setEstimate(json.estimate);
  };

  const runVerifyBatch = async () => {
    setVerifyBusy(true);
    setError('');
    try {
      if (selectedLeadIds.length === 0) throw new Error('Select at least one lead before running verification.');
      const res = await fetch('/.netlify/functions/run-verify-batch-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withScopePayload({
            spendCap: Number(spendCap),
            validOnly,
            generateCandidates,
            maxAttemptsPerFirm: maxAttempts,
            batchSize
          })
        )
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Verification failed');
      await loadResults(selectedJobIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifyBusy(false);
    }
  };

  const runEnrichmentEstimate = async () => {
    setError('');
    if (selectedLeadIds.length === 0) {
      setError('Select at least one lead before estimating enrichment cost.');
      return;
    }

    const res = await fetch('/.netlify/functions/estimate-enrichment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        withScopePayload({
          mode: enrichmentMode,
          leadsPerCompany: enrichmentLeadsPerCompany
        })
      )
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed enrichment estimate');
    setEnrichmentEstimate(json.estimate);
  };

  const runEnrichmentBatch = async () => {
    setEnrichBusy(true);
    setError('');
    try {
      if (selectedLeadIds.length === 0) throw new Error('Select at least one lead before running enrichment.');

      const res = await fetch('/.netlify/functions/run-enrichment-batch-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withScopePayload({
            mode: enrichmentMode,
            leadsPerCompany: enrichmentLeadsPerCompany,
            batchSize: enrichmentBatchSize,
            spendCap: Number(enrichmentSpendCap)
          })
        )
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Enrichment failed');
      await loadResults(selectedJobIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setEnrichBusy(false);
    }
  };

  const runAdsEstimate = async () => {
    setError('');
    if (selectedLeadIds.length === 0) {
      setError('Select at least one lead before estimating ads scan cost.');
      return;
    }
    const res = await fetch('/.netlify/functions/estimate-ads-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withScopePayload({}))
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed ads scan estimate');
    setAdsEstimate(json.estimate);
  };

  const runAdsBatch = async () => {
    setAdsBusy(true);
    setError('');
    try {
      if (selectedLeadIds.length === 0) throw new Error('Select at least one lead before running ads scan.');
      const res = await fetch('/.netlify/functions/run-ads-library-batch-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withScopePayload({
            periodDays: adsPeriodDays,
            minAds: adsMinCount,
            batchSize: adsBatchSize,
            spendCap: Number(adsSpendCap)
          })
        )
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ads scan failed');
      await loadResults(selectedJobIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ads scan failed');
    } finally {
      setAdsBusy(false);
    }
  };

  return (
    <main className="results-main">
      <h1>Results Workspace</h1>

      <div className="results-summary-bar">
        <span>Jobs selected: {counts.jobsSelected}</span>
        <span>In scope: {counts.inScope}</span>
        <span>After filters: {counts.filtered}</span>
        <span>Selected rows: {counts.selected}</span>
        <span>Export-ready: {counts.exportReady}</span>
      </div>

      <div className="results-layout">
        <aside className="results-left-panel">
          <div className="card tight">
            <h3>Job Scope</h3>
            <div className="inline-actions" style={{ marginTop: 6 }}>
              <button className="secondary" onClick={setScopeAll}>Select All</button>
              <button className="secondary" onClick={setScopeCompleted}>Only Completed</button>
              <button className="secondary" onClick={setScopeCurrent}>Current Job</button>
            </div>
            <div className="job-scope-list">
              {jobs.map((job) => {
                const checked = selectedJobIds.includes(job.id);
                return (
                  <label key={job.id} className="job-scope-item">
                    <input type="checkbox" checked={checked} onChange={() => toggleJobScope(job.id)} />
                    <div>
                      <strong>{shortPrompt(job.user_prompt)}</strong>
                      <div className="muted-small">
                        {new Date(job.created_at).toLocaleDateString()} | {job.status} | {job.progress_count}/
                        {job.target_firm_count}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="card tight">
            <h3>Views</h3>
            <div className="inline-actions" style={{ marginTop: 6 }}>
              <button className={savedView === 'all' ? '' : 'secondary'} onClick={() => applySavedView('all')}>All</button>
              <button className={savedView === 'export_ready' ? '' : 'secondary'} onClick={() => applySavedView('export_ready')}>
                Export Ready
              </button>
              <button
                className={savedView === 'needs_verification' ? '' : 'secondary'}
                onClick={() => applySavedView('needs_verification')}
              >
                Needs Verification
              </button>
              <button
                className={savedView === 'decision_makers_only' ? '' : 'secondary'}
                onClick={() => applySavedView('decision_makers_only')}
              >
                Decision Makers
              </button>
              <button className={savedView === 'ads_active' ? '' : 'secondary'} onClick={() => applySavedView('ads_active')}>
                Ads Active
              </button>
            </div>
          </div>

          <div className="card tight">
            <h3>Filters</h3>
            <label>
              Search
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Firm, city, contact..." />
            </label>
            <label>
              Email status
              <select value={emailStatusFilter} onChange={(e) => setEmailStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="valid">Verified</option>
                <option value="unverified">Unverified</option>
                <option value="none">None</option>
                <option value="invalid">Invalid</option>
                <option value="risky">Risky</option>
                <option value="catch_all">Catch-all</option>
              </select>
            </label>
            <label>
              State
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                <option value="all">All</option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-2">
              <label>
                Has phone
                <select value={hasPhoneFilter} onChange={(e) => setHasPhoneFilter(e.target.value as Ternary)}>
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                Has website
                <select value={hasWebsiteFilter} onChange={(e) => setHasWebsiteFilter(e.target.value as Ternary)}>
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                Has contact form
                <select value={hasContactFormFilter} onChange={(e) => setHasContactFormFilter(e.target.value as Ternary)}>
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                Min ads in period
                <input
                  type="number"
                  min={0}
                  value={adsMinCountFilter}
                  onChange={(e) => setAdsMinCountFilter(Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="card tight">
            <h3>Row Selection</h3>
            <p>Use checked rows for verify, enrich, ads scan, and export.</p>
            <div className="inline-actions">
              <button className="secondary" onClick={selectVisible}>Select Visible</button>
              <button className="secondary" onClick={selectFilteredOnly}>Select All Filtered</button>
              <button className="secondary" onClick={clearSelection}>Clear</button>
            </div>
          </div>

          <div className="card tight">
            <h3>Email Verification</h3>
            <div className="grid">
              <label>
                <input type="checkbox" checked={validOnly} onChange={(e) => setValidOnly(e.target.checked)} /> Valid-only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={generateCandidates}
                  onChange={(e) => setGenerateCandidates(e.target.checked)}
                />{' '}
                Generate candidates
              </label>
              <label>
                Max attempts per firm
                <input type="number" min={1} max={10} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
              </label>
              <label>
                Batch size
                <input type="number" min={1} max={200} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
              </label>
              <label>
                Spend cap ($)
                <input value={spendCap} onChange={(e) => setSpendCap(e.target.value)} />
              </label>
            </div>
            <div className="inline-actions">
              <button onClick={runEstimate}>Estimate</button>
              <button className="secondary" onClick={runVerifyBatch} disabled={verifyBusy}>
                {verifyBusy ? 'Running...' : 'Run Verify Batch'}
              </button>
            </div>
            {estimate && <pre>{JSON.stringify(estimate, null, 2)}</pre>}
          </div>

          <div className="card tight">
            <h3>AI Enrichment</h3>
            <div className="grid">
              <label>
                Mode
                <select value={enrichmentMode} onChange={(e) => setEnrichmentMode(e.target.value as 'budget' | 'deep')}>
                  <option value="budget">Budget</option>
                  <option value="deep">Deep</option>
                </select>
              </label>
              <label>
                Leads per company
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={enrichmentLeadsPerCompany}
                  onChange={(e) => setEnrichmentLeadsPerCompany(Number(e.target.value))}
                />
              </label>
              <label>
                Batch size
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={enrichmentBatchSize}
                  onChange={(e) => setEnrichmentBatchSize(Number(e.target.value))}
                />
              </label>
              <label>
                Spend cap ($)
                <input value={enrichmentSpendCap} onChange={(e) => setEnrichmentSpendCap(e.target.value)} />
              </label>
            </div>
            <div className="inline-actions">
              <button onClick={runEnrichmentEstimate}>Estimate</button>
              <button className="secondary" onClick={runEnrichmentBatch} disabled={enrichBusy}>
                {enrichBusy ? 'Running...' : 'Run Enrichment Batch'}
              </button>
            </div>
            {enrichmentEstimate && <pre>{JSON.stringify(enrichmentEstimate, null, 2)}</pre>}
          </div>

          <div className="card tight">
            <h3>Ads Scan</h3>
            <div className="grid">
              <label>
                Period (days)
                <input type="number" min={1} max={365} value={adsPeriodDays} onChange={(e) => setAdsPeriodDays(Number(e.target.value))} />
              </label>
              <label>
                Min ads
                <input type="number" min={0} value={adsMinCount} onChange={(e) => setAdsMinCount(Number(e.target.value))} />
              </label>
              <label>
                Batch size
                <input type="number" min={1} max={200} value={adsBatchSize} onChange={(e) => setAdsBatchSize(Number(e.target.value))} />
              </label>
              <label>
                Spend cap ($)
                <input value={adsSpendCap} onChange={(e) => setAdsSpendCap(e.target.value)} />
              </label>
            </div>
            <div className="inline-actions">
              <button onClick={runAdsEstimate}>Estimate</button>
              <button className="secondary" onClick={runAdsBatch} disabled={adsBusy}>
                {adsBusy ? 'Running...' : 'Run Ads Batch'}
              </button>
            </div>
            {adsEstimate && <pre>{JSON.stringify(adsEstimate, null, 2)}</pre>}
          </div>

          <div className="card tight">
            <h3>Export</h3>
            <label>
              Export scope
              <select value={exportScope} onChange={(e) => setExportScope(e.target.value as 'filtered' | 'selected')}>
                <option value="filtered">Filtered rows</option>
                <option value="selected">Selected rows only</option>
              </select>
            </label>
            <div className="export-list" style={{ marginTop: 10 }}>
              {columns.map((column, idx) => (
                <div key={column} className="export-row">
                  <div className="export-col-name">
                    <span className="export-index">{idx + 1}</span>
                    <span>{column}</span>
                  </div>
                  <div className="export-actions">
                    <button className="secondary" onClick={() => reorderColumn(idx, -1)} disabled={idx === 0}>
                      Up
                    </button>
                    <button
                      className="secondary"
                      onClick={() => reorderColumn(idx, 1)}
                      disabled={idx === columns.length - 1}
                    >
                      Down
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="inline-actions">
              <button className="secondary" onClick={() => setColumns([...DEFAULT_COLUMNS])}>Reset</button>
              <button onClick={downloadCsv} disabled={exportRows.length === 0}>Export CSV</button>
            </div>
          </div>

          <div className="card tight">
            <h3>Indicator Guide</h3>
            <button className="secondary" onClick={() => setShowGuide((v) => !v)}>
              {showGuide ? 'Hide Guide' : 'Show Guide'}
            </button>
            {showGuide && (
              <div style={{ marginTop: 8 }}>
                <p><strong>Verified</strong>: email confirmed deliverable.</p>
                <p><strong>Unverified</strong>: email found but not validated yet.</p>
                <p><strong>None</strong>: no email available on contact.</p>
                <p><strong>Invalid/Risky/Catch-all</strong>: low-confidence for outreach.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="results-table-panel">
          <div className="card">
            <h3>Lead Table</h3>
            <p>
              Scope: {selectedJobIds.length} job(s) | Showing {filteredRows.length} of {rows.length} leads
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Firm</th>
                    <th>City/State</th>
                    <th>Phone</th>
                    <th>Primary Contact</th>
                    <th>Title</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Ads Period</th>
                    <th>Source Jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
                    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
                    const ads = Array.isArray(row.ads_observations) ? row.ads_observations : [];
                    const latestAds = ads.length
                      ? [...ads].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
                      : null;
                    const leadId = String(row.lead_id);
                    const selected = selectedLeadIdSet.has(leadId);
                    const sourceJobIds = Array.isArray(row.source_job_ids) ? row.source_job_ids : [row.job_id];

                    return (
                      <tr key={`${leadId}-${idx}`}>
                        <td>
                          <input type="checkbox" checked={selected} onChange={() => toggleLead(leadId)} />
                        </td>
                        <td>
                          <div><strong>{lead?.name}</strong></div>
                          <div className="muted-small">{lead?.website || 'No website'}</div>
                        </td>
                        <td>{lead?.city || ''}{lead?.city && lead?.state ? ', ' : ''}{lead?.state || ''}</td>
                        <td>{lead?.phone || ''}</td>
                        <td>{contact?.full_name || ''}</td>
                        <td>{contact?.title || ''}</td>
                        <td>{contact?.email || ''}</td>
                        <td>
                          <span className={statusBadgeClass(contact?.email_status)}>{contact?.email_status || 'none'}</span>
                        </td>
                        <td>{latestAds?.ads_count_in_period ?? 0}</td>
                        <td>
                          <div className="muted-small">{sourceJobIds.length} job(s)</div>
                          <div className="muted-small">{sourceJobIds.slice(0, 2).map((id) => jobNameById.get(id) ?? id).join(' | ')}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </section>
      </div>
    </main>
  );
}
