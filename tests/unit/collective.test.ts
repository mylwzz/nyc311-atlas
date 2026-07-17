import { describe, expect, it } from "vitest";

import {
  getComplaintCompositionPresentation,
  getCollectiveComplaintPresentation,
} from "@/components/explore/tractPresentation";
import type {
  TractDetails,
  TractFeatureProperties,
} from "@/lib/artifacts";
import {
  empiricalPercentileRank,
  getCollectiveComplaintSummary,
  getMapMetricDatum,
  mapMetricsForExploreDomain,
} from "@/lib/map";
import { agencyFullName } from "@/lib/agencies";

function properties(
  overrides: Record<string, unknown> = {},
): TractFeatureProperties {
  return {
    geoid: "36061000100",
    population: 2_000,
    noiseComplaintCount: 10,
    noiseComplaintRatePer1000: 500,
    housingBuildingComplaintCount: 20,
    housingBuildingComplaintRatePer1000: 5,
    sanitationEnvironmentalComplaintCount: 30,
    sanitationEnvironmentalComplaintRatePer1000: 700,
    streetInfrastructureComplaintCount: 40,
    streetInfrastructureComplaintRatePer1000: 2,
    publicSafetyQualityOfLifeComplaintCount: 50,
    publicSafetyQualityOfLifeComplaintRatePer1000: 300,
    ...overrides,
  } as unknown as TractFeatureProperties;
}

function detail(): TractDetails["tracts"][string] {
  return {
    topComplaintTypesByDomain: {
      noise: [
        { complaintType: "Loud Music", count: 10, sharePct: 100 },
      ],
      housing_building: [
        { complaintType: "Heat", count: 20, sharePct: 100 },
      ],
      sanitation_environmental: [
        { complaintType: "Refuse", count: 30, sharePct: 100 },
      ],
      street_infrastructure: [
        { complaintType: "Street Light", count: 40, sharePct: 100 },
      ],
      public_safety_quality_of_life: [
        { complaintType: "Blocked Driveway", count: 50, sharePct: 100 },
      ],
    },
    topAgenciesByDomain: {
      noise: [{ agency: "NYPD", count: 10, sharePct: 100 }],
      housing_building: [{ agency: "HPD", count: 20, sharePct: 100 }],
      sanitation_environmental: [
        { agency: "DSNY", count: 30, sharePct: 100 },
      ],
      street_infrastructure: [{ agency: "DOT", count: 40, sharePct: 100 }],
      public_safety_quality_of_life: [
        { agency: "NYPD", count: 50, sharePct: 100 },
      ],
    },
  };
}

describe("Collective Explore domain", () => {
  it("sums complaint counts and recomputes the population rate without averaging domain rates", () => {
    const summary = getCollectiveComplaintSummary(properties());
    expect(summary.count).toBe(150);
    expect(summary.ratePer1000).toBe(75);
    expect(summary.ratePer1000).not.toBe((500 + 5 + 700 + 2 + 300) / 5);

    expect(getCollectiveComplaintPresentation(properties())).toMatchObject({
      domain: "collective",
      label: "Collective",
      count: 150,
      ratePer1000: 75,
    });
  });

  it("keeps the Collective rate unavailable when population is missing or invalid", () => {
    expect(
      getCollectiveComplaintSummary(properties({ population: null }))
        .ratePer1000,
    ).toBeNull();
    expect(
      getCollectiveComplaintSummary(properties({ population: 0 })).ratePer1000,
    ).toBeNull();
  });

  it("combines complaint-type counts while keeping agency detail domain-specific", () => {
    const composition = getComplaintCompositionPresentation(
      detail(),
      properties(),
      "collective",
    );
    expect(composition.complaintTypes[0]).toMatchObject({
      complaintType: "Blocked Driveway",
      domain: "public_safety_quality_of_life",
      domainLabel: "Public Safety & Quality of Life",
      count: 50,
    });
    expect(composition.complaintTypes[0]?.sharePct).toBeCloseTo(50 / 1.5);
    expect(composition.agencies).toEqual([]);

    const housing = getComplaintCompositionPresentation(
      detail(),
      properties(),
      "housing_building",
    );
    expect(housing.agencies[0]).toMatchObject({
      agency: "HPD",
      fullName: "Department of Housing Preservation and Development",
      count: 20,
      sharePct: 100,
    });
  });

  it("expands curated agency codes without inventing names for unknown codes", () => {
    expect(agencyFullName("NYPD")).toBe("New York City Police Department");
    expect(agencyFullName("UNLISTED")).toBeNull();
  });

  it("exposes only compatible map metrics and refuses response pooling", () => {
    expect(mapMetricsForExploreDomain("collective")).toEqual([
      "complaint_intensity",
      "mapped_complaint_count",
      "median_household_income",
      "allocation_eligibility",
    ]);
    const response = getMapMetricDatum(
      properties(),
      "collective",
      "recorded_closure_30d",
    );
    expect(response.available).toBe(false);
    expect(response.value).toBeNull();
    expect(response.unavailableReason).toContain("Choose a service domain");
  });

  it("derives deterministic citywide percentile ranks from Collective rates", () => {
    expect(empiricalPercentileRank([10, 20, 30], 10)).toBe(0);
    expect(empiricalPercentileRank([10, 20, 30], 20)).toBe(0.5);
    expect(empiricalPercentileRank([10, 20, 30], 30)).toBe(1);
    expect(empiricalPercentileRank([10, 20, 20, 40], 20)).toBe(0.5);
  });
});
