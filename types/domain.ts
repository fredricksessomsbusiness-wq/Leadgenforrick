export type GeoMode = 'radius' | 'zip_sweep' | 'state';

export type ExportRowMode = 'firm_row' | 'contact_row';

export type EmailStatus =
  | 'valid'
  | 'invalid'
  | 'unknown'
  | 'catch_all'
  | 'risky'
  | 'unverified'
  | 'none';

export interface GeoParams {
  radius_miles?: number;
  center_city_state?: string;
  zip_list?: string[];
  state_code?: string;
  city_cluster_strategy?: 'major_cities' | 'zip_clusters';
}

export interface CollectionToggles {
  geo_mode: GeoMode;
  deep_crawl: boolean;
  decision_maker_only: boolean;
  evidence_capture: boolean;
  professional_hooks_generation: boolean;
  allow_reinclude: boolean;
}

export interface VerificationToggles {
  verify_emails: boolean;
  valid_only_enforcement: boolean;
  generate_email_candidates: boolean;
  max_verification_attempts_per_firm: number;
}

export interface ParsedPlan {
  business_type: string;
  keywords: string[];
  geo_mode: GeoMode;
  geo_params: GeoParams;
  target_firm_count: number;
  max_searches: number;
  toggles_json: CollectionToggles;
  output_columns: string[];
  export_row_mode: ExportRowMode;
}

export interface PlannerInput {
  prompt: string;
}

export interface LeadCandidate {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  google_place_id: string;
  google_maps_url: string | null;
  source_query: string;
  source_geo_label: string;
}

export interface CrawlResult {
  contact_form_url: string | null;
  emails: string[];
  phones: string[];
  contacts: Array<{ full_name: string; title: string | null }>;
  signals: Array<{ signal_type: string; signal_value: string; evidence_url: string | null }>;
}

export interface JobVerificationEstimate {
  count_to_verify: number;
  unit_cost: number;
  buffer_multiplier: number;
  estimated_cost: number;
  generated_at: string;
}
