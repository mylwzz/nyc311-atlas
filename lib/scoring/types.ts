export const DOMAIN_KEYS = [
  "noise",
  "housing_building",
  "sanitation_environmental",
  "street_infrastructure",
  "public_safety_quality_of_life",
] as const;

export const SCALING_MODES = ["rank_balanced", "magnitude_sensitive"] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];
export type ScalingMode = (typeof SCALING_MODES)[number];

/** The scoring subset of the exported tract GeoJSON properties. */
export interface TractScoringProperties {
  readonly geoid: string;
  readonly allocationEligible: boolean;
  readonly allocationIneligibilityReason: string | null;
  readonly lowerIncomePriorityZ: number | null;
  readonly lowerIncomePriorityPercentile: number | null;
  readonly noiseComplaintIntensityZ: number | null;
  readonly noiseComplaintIntensityPercentile: number | null;
  readonly housingBuildingComplaintIntensityZ: number | null;
  readonly housingBuildingComplaintIntensityPercentile: number | null;
  readonly sanitationEnvironmentalComplaintIntensityZ: number | null;
  readonly sanitationEnvironmentalComplaintIntensityPercentile: number | null;
  readonly streetInfrastructureComplaintIntensityZ: number | null;
  readonly streetInfrastructureComplaintIntensityPercentile: number | null;
  readonly publicSafetyQualityOfLifeComplaintIntensityZ: number | null;
  readonly publicSafetyQualityOfLifeComplaintIntensityPercentile: number | null;
}

export interface ScoreSpecification {
  readonly domainKey: DomainKey;
  readonly scalingMode: ScalingMode;
  readonly alphaIntensity: number;
}

export interface ScoreComponents {
  readonly intensityValue: number;
  readonly lowerIncomeValue: number;
  readonly alphaIntensity: number;
  readonly alphaLowerIncome: number;
  readonly intensityContribution: number;
  readonly lowerIncomeContribution: number;
  readonly score: number;
}

export interface RankedTractScore extends ScoreComponents {
  readonly geoid: string;
  readonly rank: number;
}
