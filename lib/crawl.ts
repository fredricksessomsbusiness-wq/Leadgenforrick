import type { CrawlResult } from '../types/domain';

const CANDIDATE_PATHS = ['/contact', '/about', '/team', '/attorneys', '/our-team'];

const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const phoneRegex = /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;

const titles = [
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

const parseContacts = (text: string): Array<{ full_name: string; title: string | null }> => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const out: Array<{ full_name: string; title: string | null }> = [];
  for (const line of lines) {
    const nameMatch = line.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/);
    if (!nameMatch) continue;
    const title = titles.find((t) => line.toLowerCase().includes(t.toLowerCase())) ?? null;
    if (title) {
      out.push({ full_name: nameMatch[1], title });
    }
  }
  return out;
};

const extractContactForm = (html: string, baseUrl: string): string | null => {
  const formMatch = html.match(/<form[^>]*action=["']([^"']+)["']/i);
  if (!formMatch) return null;
  try {
    return new URL(formMatch[1], baseUrl).toString();
  } catch {
    return null;
  }
};

export const crawlWebsite = async (website: string, deep = false): Promise<CrawlResult> => {
  const urls = [website];
  for (const path of CANDIDATE_PATHS) {
    urls.push(new URL(path, website).toString());
  }
  if (deep) {
    urls.push(new URL('/blog', website).toString());
    urls.push(new URL('/news', website).toString());
  }

  const pages: Array<{ url: string; html: string }> = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'LocalLeadFinderBot/1.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      pages.push({ url, html });
    } catch {
      // Ignore inaccessible pages
    }
  }

  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();
  const contacts: Array<{ full_name: string; title: string | null }> = [];
  const signals: Array<{ signal_type: string; signal_value: string; evidence_url: string | null }> = [];
  let contactFormUrl: string | null = null;

  for (const page of pages) {
    for (const m of page.html.matchAll(emailRegex)) {
      emailSet.add(m[1].toLowerCase());
    }

    for (const m of page.html.matchAll(phoneRegex)) {
      phoneSet.add(m[1]);
    }

    if (!contactFormUrl) {
      contactFormUrl = extractContactForm(page.html, page.url);
    }

    contacts.push(...parseContacts(page.html));

    if (/estate planning|probate|trust/i.test(page.html)) {
      signals.push({
        signal_type: 'practice_focus',
        signal_value: 'Mentions estate planning, probate, or trusts',
        evidence_url: page.url
      });
    }
  }

  return {
    contact_form_url: contactFormUrl,
    emails: [...emailSet],
    phones: [...phoneSet],
    contacts,
    signals
  };
};
