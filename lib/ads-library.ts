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

const tryDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value.length >= 10 ? value.slice(0, 10) : null;
};

const getObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const getArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const looksLikeCompanyMatch = (companyName: string, candidate: string): boolean => {
  const a = companyName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const b = candidate.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
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

  if (env.adsLibraryProvider === 'dataforseo') {
    if (!env.dataforseoLogin || !env.dataforseoPassword) {
      throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required when ADS_LIBRARY_PROVIDER=dataforseo');
    }

    const endpoint = 'https://api.dataforseo.com/v3/serp/google/ads_advertisers/live/advanced';
    const locationName = [input.city, input.state, 'United States'].filter(Boolean).join(', ');
    const body = [
      {
        keyword: input.companyName,
        location_name: locationName || 'United States',
        location_code: env.dataforseoLocationCode || 2840,
        language_name: 'English',
        depth: 100
      }
    ];

    const auth = Buffer.from(`${env.dataforseoLogin}:${env.dataforseoPassword}`).toString('base64');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
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
      const msg = typeof payload.error === 'string' ? payload.error : `DataForSEO failed (${res.status})`;
      throw new Error(msg);
    }

    const tasks = getArray(payload.tasks);
    const firstTask = getObject(tasks[0]);
    const firstResult = getObject(getArray(firstTask?.result)[0]);
    const items = getArray(firstResult?.items)
      .map(getObject)
      .filter((v): v is Record<string, unknown> => Boolean(v));

    const preferred = items.find((item) => {
      const advertiser = String(
        item.advertiser_name ?? item.advertiser ?? item.domain ?? item.title ?? ''
      );
      return looksLikeCompanyMatch(input.companyName, advertiser);
    }) ?? items[0];

    const advertiserName = String(
      preferred?.advertiser_name ?? preferred?.advertiser ?? preferred?.domain ?? input.companyName
    );
    let adsInPeriod = Math.max(
      0,
      toNumber(
        preferred?.ads_count ??
          preferred?.approx_ads_count ??
          preferred?.ads_count_in_period ??
          preferred?.ad_count ??
          preferred?.results_count ??
          0
      )
    );
    const adsActive = Math.max(
      0,
      toNumber(preferred?.ads_count_active ?? preferred?.active_ads ?? preferred?.live_ads ?? adsInPeriod)
    );

    let firstSeen = tryDate(preferred?.first_seen_at ?? preferred?.first_shown ?? preferred?.date_from);
    let lastSeen = tryDate(preferred?.last_seen_at ?? preferred?.last_shown ?? preferred?.date_to);
    const evidenceUrl =
      typeof preferred?.url === 'string'
        ? preferred.url
        : typeof preferred?.source_url === 'string'
          ? preferred.source_url
          : null;

    const domain = typeof preferred?.domain === 'string' ? preferred.domain : null;
    if (domain) {
      const adsSearchEndpoint = 'https://api.dataforseo.com/v3/serp/google/ads_search/live/advanced';
      const adsSearchBody = [
        {
          location_code: env.dataforseoLocationCode || 2840,
          language_name: 'English',
          target: domain,
          platform: 'all',
          format: 'all',
          date_from: periodStart,
          date_to: periodEnd,
          depth: 100
        }
      ];

      const adsSearchRes = await fetch(adsSearchEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(adsSearchBody)
      });
      const adsSearchText = await adsSearchRes.text();
      let adsSearchPayload: Record<string, unknown> = {};
      if (adsSearchText) {
        try {
          adsSearchPayload = JSON.parse(adsSearchText);
        } catch {
          adsSearchPayload = { raw_text: adsSearchText };
        }
      }

      if (adsSearchRes.ok) {
        const t = getObject(getArray(adsSearchPayload.tasks)[0]);
        const r = getObject(getArray(t?.result)[0]);
        const items = getArray(r?.items)
          .map(getObject)
          .filter((v): v is Record<string, unknown> => Boolean(v));
        const countFromResult = Math.max(
          toNumber(r?.items_count),
          toNumber(r?.results_count),
          items.length
        );
        if (countFromResult > 0) adsInPeriod = countFromResult;

        const dates = items
          .flatMap((it) => [
            tryDate(it.first_seen_at ?? it.first_shown ?? it.date_from),
            tryDate(it.last_seen_at ?? it.last_shown ?? it.date_to)
          ])
          .filter((v): v is string => Boolean(v))
          .sort();
        if (dates.length > 0) {
          firstSeen = dates[0];
          lastSeen = dates[dates.length - 1];
        }

        payload.ads_search = adsSearchPayload;
      }
    }

    return {
      provider: 'dataforseo',
      advertiser_name: advertiserName,
      ads_count_active: adsActive,
      ads_count_in_period: adsInPeriod,
      first_seen_at: firstSeen,
      last_seen_at: lastSeen,
      evidence_url: evidenceUrl,
      period_start: periodStart,
      period_end: periodEnd,
      raw: payload
    };
  }

  if (env.adsLibraryProvider === 'custom_http') {
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
  }

  throw new Error('Ads Library provider is not configured. Use ADS_LIBRARY_PROVIDER=dataforseo or custom_http');
};
