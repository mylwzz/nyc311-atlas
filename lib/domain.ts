export const DOMAIN_KEYS = [
  "noise",
  "housing_building",
  "sanitation_environmental",
  "street_infrastructure",
  "public_safety_quality_of_life",
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];

export const DOMAIN_CONFIG: Record<
  DomainKey,
  { label: string; shortLabel: string; propertyPrefix: string }
> = {
  noise: {
    label: "Noise",
    shortLabel: "Noise",
    propertyPrefix: "noise",
  },
  housing_building: {
    label: "Housing & Building",
    shortLabel: "Housing",
    propertyPrefix: "housingBuilding",
  },
  sanitation_environmental: {
    label: "Sanitation & Environmental",
    shortLabel: "Sanitation",
    propertyPrefix: "sanitationEnvironmental",
  },
  street_infrastructure: {
    label: "Street & Infrastructure",
    shortLabel: "Street",
    propertyPrefix: "streetInfrastructure",
  },
  public_safety_quality_of_life: {
    label: "Public Safety & Quality of Life",
    shortLabel: "Public safety",
    propertyPrefix: "publicSafetyQualityOfLife",
  },
};

export const MAP_METRICS = [
  "complaint_intensity",
  "mapped_complaint_count",
  "median_household_income",
  "allocation_eligibility",
  "recorded_closure_30d",
  "recorded_closure_180d",
  "median_recorded_days_to_closure",
  "not_recorded_closed_age_30d",
  "not_recorded_closed_age_180d",
  "mean_complete_period_arrivals",
  "median_complete_period_arrivals",
  "expected_cohort_open_age_30d",
  "expected_cohort_open_age_180d",
] as const;

export type MapMetric = (typeof MAP_METRICS)[number];

export const MAP_METRIC_LABELS: Record<MapMetric, string> = {
  complaint_intensity: "Complaints per 1,000",
  mapped_complaint_count: "Mapped complaint count",
  median_household_income: "Median household income",
  allocation_eligibility: "Allocation eligibility",
  recorded_closure_30d: "Recorded closure within 30 days",
  recorded_closure_180d: "Recorded closure within 180 days",
  median_recorded_days_to_closure: "Median recorded days to closure",
  not_recorded_closed_age_30d: "Not recorded closed by age 30",
  not_recorded_closed_age_180d: "Not recorded closed by age 180",
  mean_complete_period_arrivals: "Mean complete-period arrivals",
  median_complete_period_arrivals: "Median complete-period arrivals",
  expected_cohort_open_age_30d: "Expected cohort open at age 30",
  expected_cohort_open_age_180d: "Expected cohort open at age 180",
};

export const NEIGHBORHOOD_METRICS = [
  "complaint_intensity",
  "mapped_complaint_count",
  "recorded_closure_30d",
  "expected_cohort_open_age_30d",
] as const;

export type NeighborhoodMetric = (typeof NEIGHBORHOOD_METRICS)[number];

export const SCALING_MODES = [
  "rank_balanced",
  "magnitude_sensitive",
] as const;

export type ScalingMode = (typeof SCALING_MODES)[number];

export const K_VALUES = [25, 50, 100, 150, 200] as const;
export type KValue = (typeof K_VALUES)[number];

export const ALPHA_VALUES = [
  0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1,
] as const;
export type AlphaValue = (typeof ALPHA_VALUES)[number];

export const SAMPLE_STATUSES = [
  "no_requests",
  "no_known_timing",
  "insufficient_sample",
  "sufficient",
] as const;

export type WorkloadSampleStatus = (typeof SAMPLE_STATUSES)[number];

export type Workspace = "explore" | "scenario" | "workload";
export type WorkloadTab = "historical" | "scenario";
export type WorkloadScope =
  | "active_tract"
  | "selected_tracts"
  | "active_neighborhood"
  | "current_scenario"
  | "pinned_scenario";

export function domainField(domain: DomainKey, suffix: string): string {
  return `${DOMAIN_CONFIG[domain].propertyPrefix}${suffix}`;
}

export function isDomainKey(value: string): value is DomainKey {
  return DOMAIN_KEYS.includes(value as DomainKey);
}
