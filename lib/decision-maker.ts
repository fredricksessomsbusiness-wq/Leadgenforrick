const PRIORITY = [
  'Managing Partner',
  'Founder',
  'Owner',
  'Principal',
  'Partner',
  'Attorney',
  'Practice Manager',
  'Office Manager',
  'Intake Coordinator'
];

export interface CandidateContact {
  id: string;
  full_name: string;
  title: string | null;
}

export const choosePrimaryContact = (contacts: CandidateContact[]): CandidateContact | null => {
  if (contacts.length === 0) return null;

  const byRank = [...contacts].sort((a, b) => {
    const aRank = a.title ? PRIORITY.indexOf(a.title) : Number.MAX_SAFE_INTEGER;
    const bRank = b.title ? PRIORITY.indexOf(b.title) : Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  });

  return byRank[0] ?? null;
};
