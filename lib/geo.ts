import type { ParsedPlan } from '../types/domain';

const NC_ZIP_SWEEP_DEFAULT = [
  '27601', '27603', '27604', '27606', '27607', '27609', '27610', '27612', '27613', '27615',
  '27701', '27703', '27705', '27707', '27713',
  '27513', '27518', '27519', '27539',
  '28078', '28202', '28203', '28204', '28205', '28207', '28210', '28211',
  '27101', '27103',
  '27401', '27408',
  '28401',
  '28301'
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
    const zips = plan.geo_params.zip_list && plan.geo_params.zip_list.length > 0 ? plan.geo_params.zip_list : NC_ZIP_SWEEP_DEFAULT;
    return zips.map((zip) => ({
      label: `zip:${zip}`,
      locationText: zip
    }));
  }

  // Backward compatibility for legacy state-mode jobs: sweep zip clusters instead of city clusters.
  const zips = plan.geo_params.zip_list && plan.geo_params.zip_list.length > 0 ? plan.geo_params.zip_list : NC_ZIP_SWEEP_DEFAULT;
  return zips.map((zip) => ({
    label: `state-zip:${zip}`,
    locationText: zip
  }));
};
