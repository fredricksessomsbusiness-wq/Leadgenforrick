import { z } from 'zod';
import type { ParsedPlan } from '../types/domain';

const NC_ZIP_SWEEP_DEFAULT = [
  '27601', '27603', '27604', '27606', '27607', '27609', '27610', '27612', '27613', '27615',
  '27701', '27703', '27705', '27707', '27713',
  '27513', '27518', '27519', '27539',
  '28078', '28202', '28203', '28204', '28205', '28207', '28210', '28211',
  '27101', '27103',
  '27401', '27408',
  '28401',
  '28301'
];

const numberFromPrompt = (prompt: string, fallback: number): number => {
  const match = prompt.match(/\b(\d{2,5})\b/);
  return match ? Number(match[1]) : fallback;
};

const extractGeoMode = (prompt: string): ParsedPlan['geo_mode'] => {
  const p = prompt.toLowerCase();
  if (/within\s+\d+\s*miles?/i.test(prompt)) return 'radius';
  if (p.includes('zip sweep') || p.includes('zip_sweep') || p.includes('zip code') || p.includes('zip')) return 'zip_sweep';
  if (p.includes('state') || p.includes('north carolina') || p.includes('nc')) return 'zip_sweep';
  return 'zip_sweep';
};

const extractRadius = (prompt: string): number => {
  const m = prompt.match(/within\s+(\d+)\s*miles?/i);
  return m ? Number(m[1]) : 25;
};

const extractCenter = (prompt: string): string => {
  const m = prompt.match(/within\s+\d+\s+miles?\s+of\s+([^,]+(?:,\s*[A-Za-z]{2})?)/i);
  return m?.[1]?.trim() ?? 'Durham, NC';
};

const extractBusinessType = (prompt: string): string => {
  const p = prompt.toLowerCase();
  if (p.includes('estate planning')) return 'estate planning law firm';
  if (p.includes('wills and trusts')) return 'wills and trusts law firm';
  return 'law firm';
};

const defaultColumns = [
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

export const plannerInputSchema = z.object({
  prompt: z.string().min(5)
});

export const parsePromptToPlan = (prompt: string): ParsedPlan => {
  const geoMode = extractGeoMode(prompt);

  const plan: ParsedPlan = {
    business_type: extractBusinessType(prompt),
    keywords: ['estate planning attorney', 'wills', 'trusts', 'probate', 'elder law'],
    geo_mode: geoMode,
    geo_params: {},
    target_firm_count: numberFromPrompt(prompt, 500),
    max_searches: 100,
    toggles_json: {
      geo_mode: geoMode,
      deep_crawl: false,
      decision_maker_only: true,
      evidence_capture: true,
      professional_hooks_generation: true,
      allow_reinclude: false
    },
    output_columns: defaultColumns,
    export_row_mode: 'firm_row'
  };

  if (geoMode === 'radius') {
    plan.geo_params = {
      radius_miles: extractRadius(prompt),
      center_city_state: extractCenter(prompt)
    };
  }

  if (geoMode === 'zip_sweep') {
    plan.geo_params = {
      zip_list: NC_ZIP_SWEEP_DEFAULT
    };
  }

  // Backward compatible fallback if an edited plan still sets geo_mode to state.
  if (geoMode === 'state') {
    const stateCode = /\bnorth carolina\b|\bnc\b/i.test(prompt) ? 'NC' : 'NC';
    plan.geo_params = {
      state_code: stateCode,
      city_cluster_strategy: 'zip_clusters',
      zip_list: NC_ZIP_SWEEP_DEFAULT
    };
  }

  return plan;
};
