import crypto from 'node:crypto';
import type { LeadCandidate } from '../types/domain';

export const buildFallbackFirmHash = (candidate: LeadCandidate): string => {
  const norm = [candidate.name, candidate.address, candidate.phone]
    .map((v) => (v ?? '').trim().toLowerCase())
    .join('|');
  return crypto.createHash('sha256').update(norm).digest('hex');
};
