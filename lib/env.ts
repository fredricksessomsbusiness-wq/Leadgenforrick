const firstDefined = (...keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  return '';
};

const supabaseUrl = firstDefined('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
const supabaseAnonKey = firstDefined('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const supabaseServiceKey = firstDefined('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

if (!supabaseUrl) {
  console.warn('Missing env var: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
}
if (!supabaseAnonKey) {
  console.warn('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');
}
if (!supabaseServiceKey) {
  console.warn('Missing env var: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)');
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceKey,
  googlePlacesApiKey: firstDefined('GOOGLE_PLACES_API_KEY'),
  googleTextSearchUnitCost: Number(firstDefined('GOOGLE_TEXTSEARCH_UNIT_COST_USD') || '0'),
  googleDetailsUnitCost: Number(firstDefined('GOOGLE_DETAILS_UNIT_COST_USD') || '0'),
  googleMonthlyFreeCreditUsd: Number(firstDefined('GOOGLE_MONTHLY_FREE_CREDIT_USD') || '0'),
  aiArkCreditCostUsd: Number(firstDefined('AI_ARK_CREDIT_COST_USD') || '0.00397'),
  aiArkLeadEnrichmentCredits: Number(firstDefined('AI_ARK_LEAD_ENRICHMENT_CREDITS') || '0.5'),
  aiArkDeepProfileCredits: Number(firstDefined('AI_ARK_DEEP_PROFILE_CREDITS') || '4.0'),
  adsLibraryProvider: firstDefined('ADS_LIBRARY_PROVIDER') || 'none',
  adsLibraryApiUrl: firstDefined('ADS_LIBRARY_API_URL'),
  adsLibraryApiKey: firstDefined('ADS_LIBRARY_API_KEY'),
  adsLibraryUnitCostUsd: Number(firstDefined('ADS_LIBRARY_UNIT_COST_USD') || '0.01'),
  adsLibraryCostBufferMultiplier: Number(firstDefined('ADS_LIBRARY_COST_BUFFER_MULTIPLIER') || '1.1'),
  anymailApiKey: firstDefined('ANYMAIL_SEARCH_API_KEY'),
  anymailUnitCost: Number(firstDefined('ANYMAIL_UNIT_COST_USD') || '0.01'),
  verificationBufferMultiplier: Number(firstDefined('VERIFICATION_COST_BUFFER_MULTIPLIER') || '1.15')
};
