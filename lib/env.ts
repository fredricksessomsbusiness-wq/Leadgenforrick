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
  anymailApiKey: firstDefined('ANYMAIL_SEARCH_API_KEY'),
  anymailUnitCost: Number(firstDefined('ANYMAIL_UNIT_COST_USD') || '0.01'),
  verificationBufferMultiplier: Number(firstDefined('VERIFICATION_COST_BUFFER_MULTIPLIER') || '1.15')
};
