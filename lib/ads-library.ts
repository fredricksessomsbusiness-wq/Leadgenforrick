import { env } from './env';

export interface AdsLibraryEstimateInput {
  companyCount: number;
}

export interface AdsLibraryEstimate {
  company_count: number;
  unit_cost_usd: number;
  buffer_multiplier: number;
  estimated_cost_total_usd: number;
  generated_at: string;
}

export interface AdsLibraryLookupInput {
  companyName: string;
  website: string | null;
  city: string | null;
  state: string | null;
  periodDays: number;
}

export interface AdsLibraryLookupResult {
  provider: string;
  advertiser_name: string;
  ads_count_active: number;
  ads_count_in_period: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  evidence_url: string | null;
  period_start: string;
  period_end: string;
  raw: Record<string, unknown>;
}

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const subtractDaysIso = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

export const estimateAdsLibraryCost = ({ companyCount }: AdsLibraryEstimateInput): AdsLibraryEstimate => {
  const c = Math.max(0, companyCount);
  const estimated = c * env.adsLibraryUnitCostUsd * env.adsLibraryCostBufferMultiplier;
  return {
    company_count: c,
    unit_cost_usd: Number(env.adsLibraryUnitCostUsd.toFixed(6)),
    buffer_multiplier: Number(env.adsLibraryCostBufferMultiplier.toFixed(3)),
    estimated_cost_total_usd: Number(estimated.toFixed(6)),
    generated_at: new Date().toISOString()
  };
};

export const lookupAdsLibrary = async (input: AdsLibraryLookupInput): Promise<AdsLibraryLookupResult> => {
  const periodDays = Math.max(1, Math.min(365, input.periodDays));
  const periodStart = subtractDaysIso(periodDays);
  const periodEnd = todayIso();

  if (env.adsLibraryProvider !== 'custom_http') {
    throw new Error(
      'Ads Library provider is not configured. Set ADS_LIBRARY_PROVIDER=custom_http and ADS_LIBRARY_API_URL.'
    );
  }
  if (!env.adsLibraryApiUrl) {
    throw new Error('ADS_LIBRARY_API_URL is required when ADS_LIBRARY_PROVIDER=custom_http');
  }

  const res = await fetch(env.adsLibraryApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.adsLibraryApiKey ? { Authorization: `Bearer ${env.adsLibraryApiKey}` } : {})
    },
    body: JSON.stringify({
      company_name: input.companyName,
      website: input.website,
      city: input.city,
      state: input.state,
      period_days: periodDays
    })
  });

  const text = await res.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw_text: text };
    }
  }

  if (!res.ok) {
    const msg = typeof payload.error === 'string' ? payload.error : `Ads provider failed (${res.status})`;
    throw new Error(msg);
  }

  return {
    provider: 'custom_http',
    advertiser_name: String(payload.advertiser_name ?? input.companyName),
    ads_count_active: Math.max(0, toNumber(payload.ads_count_active)),
    ads_count_in_period: Math.max(0, toNumber(payload.ads_count_in_period)),
    first_seen_at: typeof payload.first_seen_at === 'string' ? payload.first_seen_at : null,
    last_seen_at: typeof payload.last_seen_at === 'string' ? payload.last_seen_at : null,
    evidence_url: typeof payload.evidence_url === 'string' ? payload.evidence_url : null,
    period_start: periodStart,
    period_end: periodEnd,
    raw: payload
  };
};
