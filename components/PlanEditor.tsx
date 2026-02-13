'use client';

import { useMemo } from 'react';
import type { ParsedPlan } from '@/types/domain';

interface Props {
  plan: ParsedPlan | null;
  raw: string;
  setRaw: (v: string) => void;
}

export function PlanEditor({ plan, raw, setRaw }: Props) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [raw]);

  return (
    <div className="card">
      <h3>Parsed Plan (Editable JSON)</h3>
      {plan ? <p>Preview, edit if needed, then run collection.</p> : <p>Generate from prompt first.</p>}
      <textarea
        rows={16}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Generated plan JSON appears here"
      />
      <p>
        JSON status:{' '}
        <span className={`badge ${parsed ? '' : 'danger'}`}>{parsed ? 'valid' : 'invalid'}</span>
      </p>
    </div>
  );
}
