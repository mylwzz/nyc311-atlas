export const SCHEMA_VERSION = "4.0.0" as const;
export const MODEL_VERSION = "atlas" as const;

export const DOMAIN_KEYS = [
  "noise",
  "housing_building",
  "sanitation_environmental",
  "street_infrastructure",
  "public_safety_quality_of_life",
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];

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

export const WORKLOAD_SAMPLE_STATUSES = [
  "no_requests",
  "no_known_timing",
  "insufficient_sample",
  "sufficient",
] as const;

export type WorkloadSampleStatus =
  (typeof WORKLOAD_SAMPLE_STATUSES)[number];

export const BOROUGHS = [
  "Bronx",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Staten Island",
] as const;

export type Borough = (typeof BOROUGHS)[number];

export const COUNTY_NAMES = [
  "Bronx County",
  "Kings County",
  "New York County",
  "Queens County",
  "Richmond County",
] as const;

export type CountyName = (typeof COUNTY_NAMES)[number];

export const INCOME_QUINTILES = [
  "Q1_low",
  "Q2",
  "Q3",
  "Q4",
  "Q5_high",
] as const;

export type IncomeQuintile = (typeof INCOME_QUINTILES)[number];

export const DOMAIN_PROPERTY_PREFIXES = {
  noise: "noise",
  housing_building: "housingBuilding",
  sanitation_environmental: "sanitationEnvironmental",
  street_infrastructure: "streetInfrastructure",
  public_safety_quality_of_life: "publicSafetyQualityOfLife",
} as const satisfies Record<DomainKey, string>;

export const DOMAIN_LABELS = {
  noise: "Noise",
  housing_building: "Housing & Building",
  sanitation_environmental: "Sanitation & Environmental",
  street_infrastructure: "Street & Infrastructure",
  public_safety_quality_of_life: "Public Safety & Quality of Life",
} as const satisfies Record<DomainKey, string>;

export const DOMAIN_COUNT_METRICS = {
  noise: "Noise Complaints",
  housing_building: "Housing and Building Complaints",
  sanitation_environmental: "Sanitation and Environmental Complaints",
  street_infrastructure: "Street and Infrastructure Complaints",
  public_safety_quality_of_life:
    "Public Safety and Quality of Life Complaints",
} as const satisfies Record<DomainKey, string>;

export const DOMAIN_INTENSITY_METRICS = {
  noise: "Noise Complaints_Per_1000_People",
  housing_building:
    "Housing and Building Complaints_Per_1000_People",
  sanitation_environmental:
    "Sanitation and Environmental Complaints_Per_1000_People",
  street_infrastructure:
    "Street and Infrastructure Complaints_Per_1000_People",
  public_safety_quality_of_life:
    "Public Safety and Quality of Life Complaints_Per_1000_People",
} as const satisfies Record<DomainKey, string>;

export const AGE_CHECKPOINTS_DAYS = [
  30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420,
  450, 480, 510, 540, 570,
] as const;

export const FULL_PERIOD_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export const PUBLIC_ARTIFACT_FILES = [
  "metadata.json",
  "context.json",
  "tracts.geojson",
  "tract_details.json",
  "scenarios.json",
  "tradeoff.json",
  "workload.json",
] as const;

export type PublicArtifactFile = (typeof PUBLIC_ARTIFACT_FILES)[number];

export const SERVER_ARTIFACT_FILES = [
  "knowledge_base.json",
  "evidence.json",
] as const;

export type ServerArtifactFile = (typeof SERVER_ARTIFACT_FILES)[number];

export const ARTIFACT_FILES = [
  "tracts.geojson",
  "tract_details.json",
  "scenarios.json",
  "tradeoff.json",
  "context.json",
  "workload.json",
  "metadata.json",
  "knowledge_base.json",
  "evidence.json",
] as const;

export type ArtifactFile = (typeof ARTIFACT_FILES)[number];

export const ARTIFACT_RELATIVE_PATHS = {
  "tracts.geojson": "public/data/tracts.geojson",
  "tract_details.json": "public/data/tract_details.json",
  "scenarios.json": "public/data/scenarios.json",
  "tradeoff.json": "public/data/tradeoff.json",
  "context.json": "public/data/context.json",
  "workload.json": "public/data/workload.json",
  "metadata.json": "public/data/metadata.json",
  "knowledge_base.json": "server/data/knowledge_base.json",
  "evidence.json": "server/data/evidence.json",
} as const satisfies Record<ArtifactFile, string>;

export const PUBLIC_ARTIFACT_URLS = {
  "metadata.json": "/data/metadata.json",
  "context.json": "/data/context.json",
  "tracts.geojson": "/data/tracts.geojson",
  "tract_details.json": "/data/tract_details.json",
  "scenarios.json": "/data/scenarios.json",
  "tradeoff.json": "/data/tradeoff.json",
  "workload.json": "/data/workload.json",
} as const satisfies Record<PublicArtifactFile, string>;

export type DomainRecord<T> = { [Key in DomainKey]: T };
export type BoroughRecord<T> = { [Key in Borough]: T };
export type IncomeQuintileRecord<T> = { [Key in IncomeQuintile]: T };
