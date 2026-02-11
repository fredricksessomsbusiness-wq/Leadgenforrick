import type { ParsedPlan } from '../types/domain';

const MAJOR_NC_CITIES = [
  'Charlotte, NC',
  'Raleigh, NC',
  'Greensboro, NC',
  'Durham, NC',
  'Winston-Salem, NC',
  'Fayetteville, NC',
  'Cary, NC',
  'Wilmington, NC'
];

export interface GeoSegment {
  label: string;
  locationText: string;
}

export const buildGeoSegments = (plan: ParsedPlan): GeoSegment[] => {
  if (plan.geo_mode === 'radius') {
    return [
      {
        label: `radius:${plan.geo_params.center_city_state ?? 'Durham, NC'}`,
        locationText: plan.geo_params.center_city_state ?? 'Durham, NC'
      }
    ];
  }

  if (plan.geo_mode === 'zip_sweep') {
    return (plan.geo_params.zip_list ?? []).map((zip) => ({
      label: `zip:${zip}`,
      locationText: zip
    }));
  }

  return MAJOR_NC_CITIES.map((city) => ({
    label: `city:${city}`,
    locationText: city
  }));
};
