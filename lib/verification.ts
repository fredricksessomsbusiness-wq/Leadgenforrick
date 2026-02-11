import { env } from './env';

export interface VerificationResult {
  status: 'valid' | 'invalid' | 'unknown' | 'catch_all' | 'risky';
  confidence?: number;
  provider_response: Record<string, unknown>;
}

export const verifyEmail = async (email: string): Promise<VerificationResult> => {
  if (!env.anymailApiKey) {
    throw new Error('ANYMAIL_SEARCH_API_KEY is required for verification.');
  }

  const response = await fetch('https://api.anymailsearch.com/v1/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.anymailApiKey}`
    },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error(`Anymail verification failed: ${response.status}`);
  }

  const body = await response.json();

  return {
    status: (body.status ?? 'unknown') as VerificationResult['status'],
    confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
    provider_response: body
  };
};

export const buildEmailCandidates = (
  firstName: string | null,
  lastName: string | null,
  domain: string | null
): string[] => {
  if (!firstName || !lastName || !domain) return [];
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();
  const d = domain.toLowerCase();
  return [`${f}.${l}@${d}`, `${f}${l}@${d}`, `${f[0]}${l}@${d}`, `${f}@${d}`].slice(0, 6);
};

export const estimateVerificationCost = (countToVerify: number) => {
  const estimated = countToVerify * env.anymailUnitCost * env.verificationBufferMultiplier;
  return {
    count_to_verify: countToVerify,
    unit_cost: env.anymailUnitCost,
    buffer_multiplier: env.verificationBufferMultiplier,
    estimated_cost: Number(estimated.toFixed(2)),
    generated_at: new Date().toISOString()
  };
};
