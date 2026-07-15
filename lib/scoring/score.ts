import type {
  DomainKey,
  RankedTractScore,
  ScalingMode,
  ScoreComponents,
  ScoreSpecification,
  TractScoringProperties,
} from "./types";

export function scoreTract(
  tract: TractScoringProperties,
  specification: ScoreSpecification,
): ScoreComponents | null {
  assertAlpha(specification.alphaIntensity);

  if (!tract.allocationEligible) {
    return null;
  }

  const intensityValue = intensityComponent(
    tract,
    specification.domainKey,
    specification.scalingMode,
  );
  const lowerIncomeValue =
    specification.scalingMode === "rank_balanced"
      ? tract.lowerIncomePriorityPercentile
      : tract.lowerIncomePriorityZ;

  if (intensityValue === null || lowerIncomeValue === null) {
    throw new Error(
      `Allocation-eligible tract ${tract.geoid} is missing a scoring component.`,
    );
  }
  assertFinite(intensityValue, "complaint-intensity component");
  assertFinite(lowerIncomeValue, "lower-income-priority component");

  const alphaIntensity = specification.alphaIntensity;
  // Preserve the generation formula exactly. Using an independently serialized
  // alphaLowerIncome changes floating-point ties for some exported scenarios.
  const alphaLowerIncome = 1 - alphaIntensity;
  const intensityContribution = alphaIntensity * intensityValue;
  const lowerIncomeContribution = alphaLowerIncome * lowerIncomeValue;

  return {
    intensityValue,
    lowerIncomeValue,
    alphaIntensity,
    alphaLowerIncome,
    intensityContribution,
    lowerIncomeContribution,
    score: intensityContribution + lowerIncomeContribution,
  };
}

export function rankTracts(
  tracts: readonly TractScoringProperties[],
  specification: ScoreSpecification,
): readonly RankedTractScore[] {
  const geoids = new Set<string>();
  const rows: Array<Omit<RankedTractScore, "rank">> = [];

  for (const tract of tracts) {
    if (geoids.has(tract.geoid)) {
      throw new Error(`Duplicate scoring GEOID: ${tract.geoid}`);
    }
    geoids.add(tract.geoid);

    const components = scoreTract(tract, specification);
    if (components) {
      rows.push({ geoid: tract.geoid, ...components });
    }
  }

  rows.sort((left, right) => {
    return right.score - left.score || compareGeoids(left.geoid, right.geoid);
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function intensityComponent(
  tract: TractScoringProperties,
  domainKey: DomainKey,
  scalingMode: ScalingMode,
): number | null {
  const usePercentile = scalingMode === "rank_balanced";

  switch (domainKey) {
    case "noise":
      return usePercentile
        ? tract.noiseComplaintIntensityPercentile
        : tract.noiseComplaintIntensityZ;
    case "housing_building":
      return usePercentile
        ? tract.housingBuildingComplaintIntensityPercentile
        : tract.housingBuildingComplaintIntensityZ;
    case "sanitation_environmental":
      return usePercentile
        ? tract.sanitationEnvironmentalComplaintIntensityPercentile
        : tract.sanitationEnvironmentalComplaintIntensityZ;
    case "street_infrastructure":
      return usePercentile
        ? tract.streetInfrastructureComplaintIntensityPercentile
        : tract.streetInfrastructureComplaintIntensityZ;
    case "public_safety_quality_of_life":
      return usePercentile
        ? tract.publicSafetyQualityOfLifeComplaintIntensityPercentile
        : tract.publicSafetyQualityOfLifeComplaintIntensityZ;
  }
}

function assertAlpha(alpha: number): void {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError("alphaIntensity must be a finite number from 0 through 1.");
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
}

function compareGeoids(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
