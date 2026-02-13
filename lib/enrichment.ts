import { env } from './env';

export type EnrichmentMode = 'budget' | 'deep';

export interface EnrichmentEstimateInput {
  companyCount: number;
  leadsPerCompany: number;
  mode: EnrichmentMode;
}

export interface EnrichmentEstimate {
  mode: EnrichmentMode;
  company_count: number;
  leads_per_company: number;
  expected_leads: number;
  credit_cost_usd: number;
  credits_per_lead: number;
  credits_per_company: number;
  estimated_credits_total: number;
  estimated_cost_total_usd: number;
  estimated_cost_per_lead_usd: number;
  generated_at: string;
}

const safeRound = (n: number): number => Number(n.toFixed(6));

export const estimateEnrichmentCost = ({ companyCount, leadsPerCompany, mode }: EnrichmentEstimateInput): EnrichmentEstimate => {
  const c = Math.max(0, companyCount);
  const leads = Math.max(1, Math.min(10, leadsPerCompany));

  const creditsPerLead = env.aiArkLeadEnrichmentCredits;
  const companyBaseCredits = mode === 'deep' ? env.aiArkDeepProfileCredits : 0;
  const creditsPerCompany = leads * creditsPerLead + companyBaseCredits;
  const totalCredits = c * creditsPerCompany;
  const totalCost = totalCredits * env.aiArkCreditCostUsd;
  const expectedLeads = c * leads;
  const perLeadCost = expectedLeads > 0 ? totalCost / expectedLeads : 0;

  return {
    mode,
    company_count: c,
    leads_per_company: leads,
    expected_leads: expectedLeads,
    credit_cost_usd: safeRound(env.aiArkCreditCostUsd),
    credits_per_lead: safeRound(creditsPerLead),
    credits_per_company: safeRound(creditsPerCompany),
    estimated_credits_total: safeRound(totalCredits),
    estimated_cost_total_usd: safeRound(totalCost),
    estimated_cost_per_lead_usd: safeRound(perLeadCost),
    generated_at: new Date().toISOString()
  };
};

export interface SegmentationResult {
  in_business_20_plus: { value: boolean; confidence: number; evidence: string | null };
  multi_location_medical_practice: { value: boolean; confidence: number; evidence: string | null };
}

export const heuristicSegmentCompany = (input: {
  leadName: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}): SegmentationResult => {
  const text = [input.leadName, input.website, input.address, input.city, input.state]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const medicalKeyword = /(clinic|medical|health|pediatrics|dental|urgent care|orthopedic|wellness)/.test(text);
  const multiLocationHint = /(locations|our offices|find a location|suite\s+\d+)/.test(text);

  const inBusiness = {
    value: false,
    confidence: 0.42,
    evidence: input.website
  };

  const multiLocationMedical = {
    value: medicalKeyword && multiLocationHint,
    confidence: medicalKeyword && multiLocationHint ? 0.68 : medicalKeyword ? 0.52 : 0.28,
    evidence: input.website
  };

  return {
    in_business_20_plus: inBusiness,
    multi_location_medical_practice: multiLocationMedical
  };
};

export const contactLeadConfidence = (title: string | null): number => {
  const t = (title ?? '').toLowerCase();
  if (/(managing partner|founder|owner|principal)/.test(t)) return 0.92;
  if (/partner/.test(t)) return 0.86;
  if (/attorney/.test(t)) return 0.8;
  if (/(manager|coordinator)/.test(t)) return 0.65;
  return 0.55;
};
