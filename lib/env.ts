const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`Missing env var: ${key}`);
  }
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  anymailApiKey: process.env.ANYMAIL_SEARCH_API_KEY ?? '',
  anymailUnitCost: Number(process.env.ANYMAIL_UNIT_COST_USD ?? '0.01'),
  verificationBufferMultiplier: Number(process.env.VERIFICATION_COST_BUFFER_MULTIPLIER ?? '1.15')
};
