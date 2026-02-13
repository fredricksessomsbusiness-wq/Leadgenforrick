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

const statusBadgeClass = (status: string | null | undefined) => {
  if (!status) return 'badge';
  if (status === 'valid') return 'badge';
  if (status === 'none' || status === 'unverified') return 'badge warn';
  if (status === 'invalid' || status === 'risky') return 'badge danger';
  return 'badge warn';
};

export default function ResultsPage({ params }: { params: { id: string } }) {
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [estimate, setEstimate] = useState<any | null>(null);
  const [spendCap, setSpendCap] = useState('25');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [validOnly, setValidOnly] = useState(true);
  const [generateCandidates, setGenerateCandidates] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [batchSize, setBatchSize] = useState(20);
  const [enrichmentMode, setEnrichmentMode] = useState<'budget' | 'deep'>('budget');
  const [enrichmentEstimate, setEnrichmentEstimate] = useState<any | null>(null);
  const [enrichmentBatchSize, setEnrichmentBatchSize] = useState(20);
  const [enrichmentLeadsPerCompany, setEnrichmentLeadsPerCompany] = useState(3);
  const [enrichmentSpendCap, setEnrichmentSpendCap] = useState('0.60');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState('');

  const loadResults = async () => {
    const res = await fetch(`/.netlify/functions/list-results?jobId=${params.id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load results');

    const nextRows = json.results ?? [];
    setRows(nextRows);

    setSelectedLeadIds((prev) => {
      const available = new Set<string>(
        nextRows
          .map((r: any) => r?.lead_id)
          .filter((id: unknown): id is string => typeof id === 'string')
      );
      const kept = prev.filter((id) => available.has(id));
      if (kept.length > 0 || prev.length > 0) return kept;
      return Array.from(available);
    });
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

  const selectedCount = selectedLeadIds.length;

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) => (prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]));
  };

  const selectAll = () => {
    setSelectedLeadIds(rows.map((r) => String(r.lead_id)));
  };

  const clearAll = () => {
    setSelectedLeadIds([]);
  };

  const runEstimate = async () => {
    setError('');
    if (selectedCount === 0) {
      setError('Select at least one lead before estimating verification cost.');
      return;
    }

    const res = await fetch('/.netlify/functions/estimate-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: params.id, selectedLeadIds })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed estimate');
    setEstimate(json.estimate);
  };

  const runVerifyBatch = async () => {
    setVerifyBusy(true);
    setError('');
    try {
      if (selectedCount === 0) throw new Error('Select at least one lead before running verification.');

      const res = await fetch('/.netlify/functions/run-verify-batch-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: params.id,
          selectedLeadIds,
          spendCap: Number(spendCap),
          validOnly,
          generateCandidates,
          maxAttemptsPerFirm: maxAttempts,
          batchSize
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

  const runEnrichmentEstimate = async () => {
    setError('');
    if (selectedCount === 0) {
      setError('Select at least one lead before estimating enrichment cost.');
      return;
    }

    const res = await fetch('/.netlify/functions/estimate-enrichment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: params.id,
        selectedLeadIds,
        mode: enrichmentMode,
        leadsPerCompany: enrichmentLeadsPerCompany
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed enrichment estimate');
    setEnrichmentEstimate(json.estimate);
  };

  const runEnrichmentBatch = async () => {
    setEnrichBusy(true);
    setError('');
    try {
      if (selectedCount === 0) throw new Error('Select at least one lead before running enrichment.');

      const res = await fetch('/.netlify/functions/run-enrichment-batch-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: params.id,
          selectedLeadIds,
          mode: enrichmentMode,
          leadsPerCompany: enrichmentLeadsPerCompany,
          batchSize: enrichmentBatchSize,
          spendCap: Number(enrichmentSpendCap)
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Enrichment failed');
      await loadResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setEnrichBusy(false);
    }
  };

  const contactConfidenceFromSignals = (row: any, contactId: string | null | undefined): number | null => {
    if (!contactId) return null;
    const signals = Array.isArray(row.signals) ? row.signals : [];
    const matching = signals.filter((s: any) => s.signal_type === 'enrichment_lead_confidence' && s.contact_id === contactId);
    if (matching.length === 0) return null;
    try {
      const parsed = JSON.parse(matching[matching.length - 1].signal_value);
      return typeof parsed.confidence === 'number' ? parsed.confidence : null;
    } catch {
      return null;
    }
  };

  return (
    <main>
      <h1>Results</h1>

      <div className="card">
        <h3>Indicator Guide</h3>
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <button className="secondary" onClick={() => setShowGuide((v) => !v)}>
            {showGuide ? 'Hide Indicator Guide' : 'Show Indicator Guide'}
          </button>
        </div>

        {showGuide && (
          <div className="summary-grid" style={{ marginTop: 12 }}>
            <div className="stat-tile">
              <p className="stat-k">Email Status: valid</p>
              <p style={{ margin: 0 }}>Email was verified as deliverable.</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Email Status: unverified</p>
              <p style={{ margin: 0 }}>Email found but not yet verified.</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Email Status: none</p>
              <p style={{ margin: 0 }}>No email currently stored for that contact.</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Email Status: invalid/risky/catch_all</p>
              <p style={{ margin: 0 }}>Verification checked it and marked it unsafe or uncertain.</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Found</p>
              <p style={{ margin: 0 }}>Returned by Google Places query.</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">New vs Duplicate</p>
              <p style={{ margin: 0 }}>New was inserted to your DB; duplicate already existed and was skipped.</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Lead Confidence</p>
              <p style={{ margin: 0 }}>0-1 score for how likely a selected contact is a decision-maker lead.</p>
            </div>
            <div className="stat-tile">
              <p className="stat-k">Segment Confidence</p>
              <p style={{ margin: 0 }}>0-1 score for segment labels like 20+ years and multi-location medical.</p>
            </div>
          </div>
        )}
      </div>

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
        <p>
          Selected leads: <strong>{selectedCount}</strong>. Verification runs only on selected leads.
        </p>
        <div className="inline-actions">
          <button className="secondary" onClick={selectAll}>Select All</button>
          <button className="secondary" onClick={clearAll}>Clear Selection</button>
        </div>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
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
            Verification batch size
            <input
              type="number"
              value={batchSize}
              min={1}
              max={200}
              onChange={(e) => setBatchSize(Number(e.target.value))}
            />
          </label>
          <label>
            Max spend cap ($)
            <input value={spendCap} onChange={(e) => setSpendCap(e.target.value)} />
          </label>
        </div>

        <div className="inline-actions">
          <button onClick={runEstimate}>Estimate Cost</button>
          <button className="secondary" onClick={runVerifyBatch} disabled={verifyBusy}>Run Verify Batch</button>
        </div>

        {estimate && <pre>{JSON.stringify(estimate, null, 2)}</pre>}
      </div>

      <div className="card">
        <h3>AI Enrichment (Contacts + Segmentation)</h3>
        <p>
          Mode: <strong>{enrichmentMode}</strong>. Target budget mode is tuned for about $0.002 per lead.
        </p>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <label>
            Enrichment mode
            <select value={enrichmentMode} onChange={(e) => setEnrichmentMode(e.target.value as 'budget' | 'deep')}>
              <option value="budget">Budget Mode (target-safe)</option>
              <option value="deep">Deep Mode (adds AI profile analysis)</option>
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
            Enrichment batch size
            <input
              type="number"
              min={1}
              max={200}
              value={enrichmentBatchSize}
              onChange={(e) => setEnrichmentBatchSize(Number(e.target.value))}
            />
          </label>
          <label>
            Enrichment spend cap ($)
            <input value={enrichmentSpendCap} onChange={(e) => setEnrichmentSpendCap(e.target.value)} />
          </label>
        </div>

        <div className="inline-actions">
          <button onClick={runEnrichmentEstimate}>Estimate Enrichment Cost</button>
          <button className="secondary" onClick={runEnrichmentBatch} disabled={enrichBusy}>
            {enrichBusy ? 'Running...' : 'Run Enrichment Batch'}
          </button>
        </div>

        {enrichmentEstimate && <pre>{JSON.stringify(enrichmentEstimate, null, 2)}</pre>}
      </div>

      <div className="card">
        <h3>Lead Table</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Firm</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Contact</th>
                <th>Top 3 Leads</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
                const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
                const leadContacts = Array.isArray(r.lead_contacts) ? r.lead_contacts : [];
                const leadId = String(r.lead_id);
                const selected = selectedLeadIds.includes(leadId);

                return (
                  <tr key={`${r.lead_id}-${idx}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleLead(leadId)}
                        aria-label={`Select ${lead?.name ?? 'lead'}`}
                      />
                    </td>
                    <td>{lead?.name}</td>
                    <td>{lead?.phone}</td>
                    <td>{lead?.website}</td>
                    <td>{contact?.full_name}</td>
                    <td>
                      {leadContacts.slice(0, 3).map((c: any) => {
                        const conf = contactConfidenceFromSignals(r, c.id);
                        return (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            {c.full_name || 'Unknown'} {c.title ? `(${c.title})` : ''}{' '}
                            {typeof conf === 'number' ? <span className="badge">conf {conf.toFixed(2)}</span> : null}
                          </div>
                        );
                      })}
                    </td>
                    <td>{contact?.email}</td>
                    <td>
                      <span className={statusBadgeClass(contact?.email_status)}>{contact?.email_status ?? 'none'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </main>
  );
}
