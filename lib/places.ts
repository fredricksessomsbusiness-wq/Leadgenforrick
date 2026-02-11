import { env } from './env';
import type { LeadCandidate } from '../types/domain';

interface GoogleTextSearchResult {
  place_id: string;
  name: string;
  formatted_address?: string;
}

interface GoogleDetailsResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  website?: string;
  formatted_phone_number?: string;
  url?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
}

const endpoint = 'https://maps.googleapis.com/maps/api/place';

const getPart = (components: GoogleDetailsResult['address_components'] | undefined, type: string): string | null => {
  const c = components?.find((part) => part.types.includes(type));
  return c?.short_name ?? c?.long_name ?? null;
};

export const assertPlacesConfigured = () => {
  if (!env.googlePlacesApiKey) {
    throw new Error('Google Places API key is required. Set GOOGLE_PLACES_API_KEY before running collection.');
  }
};

export const searchPlaces = async (query: string): Promise<GoogleTextSearchResult[]> => {
  assertPlacesConfigured();
  const url = `${endpoint}/textsearch/json?query=${encodeURIComponent(query)}&key=${env.googlePlacesApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google text search failed: ${res.status}`);
  const body = await res.json();
  return body.results ?? [];
};

export const getPlaceDetails = async (placeId: string): Promise<GoogleDetailsResult | null> => {
  assertPlacesConfigured();
  const fields = [
    'place_id',
    'name',
    'formatted_address',
    'website',
    'formatted_phone_number',
    'url',
    'address_component'
  ].join(',');
  const url = `${endpoint}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${env.googlePlacesApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = await res.json();
  return body.result ?? null;
};

export const toLeadCandidate = (
  detail: GoogleDetailsResult,
  sourceQuery: string,
  geoLabel: string
): LeadCandidate => ({
  name: detail.name,
  address: detail.formatted_address ?? null,
  city: getPart(detail.address_components, 'locality'),
  state: getPart(detail.address_components, 'administrative_area_level_1'),
  zip: getPart(detail.address_components, 'postal_code'),
  phone: detail.formatted_phone_number ?? null,
  website: detail.website ?? null,
  google_place_id: detail.place_id,
  google_maps_url: detail.url ?? null,
  source_query: sourceQuery,
  source_geo_label: geoLabel
});
