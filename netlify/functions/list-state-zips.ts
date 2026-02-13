import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';

const STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

const USPS_ZIP_DATASET_URL =
  'https://cdn.statically.io/gh/pseudosavant/USPSZIPCodes/main/dist/ZIPCodes.json';

let cachedByState: Record<string, string[]> | null = null;

const loadZipDataset = async (): Promise<Record<string, string[]>> => {
  if (cachedByState) return cachedByState;

  const res = await fetch(USPS_ZIP_DATASET_URL);
  if (!res.ok) throw new Error(`ZIP dataset fetch failed (${res.status})`);

  const raw = (await res.json()) as Record<string, { state?: string }>;
  const map = new Map<string, Set<string>>();

  for (const [zip, detail] of Object.entries(raw)) {
    if (!/^\d{5}$/.test(zip)) continue;
    const state = String(detail?.state ?? '').toUpperCase();
    if (!STATE_CODES.has(state)) continue;
    if (!map.has(state)) map.set(state, new Set<string>());
    map.get(state)!.add(zip);
  }

  const out: Record<string, string[]> = {};
  for (const state of STATE_CODES) {
    out[state] = Array.from(map.get(state) ?? new Set<string>()).sort();
  }
  cachedByState = out;
  return out;
};

const handler: Handler = withErrorHandling(async (event) => {
  const state = String(event.queryStringParameters?.state ?? '')
    .trim()
    .toUpperCase();

  if (!state || !STATE_CODES.has(state)) {
    return json(400, { error: 'state is required and must be a 2-letter US code' });
  }

  const all = await loadZipDataset();
  return json(200, { state, zips: all[state] ?? [] });
});

export { handler };
