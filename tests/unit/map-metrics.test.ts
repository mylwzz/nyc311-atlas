import { describe, expect, it } from "vitest";

import type { TractFeatureProperties } from "@/lib/artifacts";
import {
  createMetricColorScale,
  getMapMetricDatum,
  quantileThresholds,
  relativeNeighborhoodDifference,
  resolveMapDisplayMetric,
} from "@/lib/map";

function properties(
  overrides: Record<string, unknown> = {},
): TractFeatureProperties {
  return {
    geoid: "36001000001",
    tractName: "1",
    borough: "Manhattan",
    county: "New York County",
    population: 1_000,
    medianHouseholdIncome: 50_000,
    incomeQuintile: "Q3",
    allocationEligible: true,
    allocationIneligibilityReason: null,
    lowerIncomePriorityZ: 0,
    lowerIncomePriorityPercentile: 0.5,
    queenNeighborGeoids: [],
    housingBuildingComplaintCount: 0,
    housingBuildingComplaintRatePer1000: 0,
    housingBuildingComplaintIntensityPercentile: 0.5,
    housingBuildingResponseSampleStatus: "sufficient",
    housingBuildingRecordedClosureWithin30dPct: 80,
    housingBuildingRecordedClosureWithin180dPct: 95,
    housingBuildingMedianRecordedDaysToClose: 5,
    housingBuildingNotRecordedClosedWithin30dCount: 4,
    housingBuildingNotRecordedClosedWithin30dPer1000: 4,
    housingBuildingNotRecordedClosedWithin180dCount: 1,
    housingBuildingNotRecordedClosedWithin180dPer1000: 1,
    housingBuildingMean30dArrivals: 8,
    housingBuildingMedian30dArrivals: 7,
    housingBuildingOpenAt30d: 1.6,
    housingBuildingOpenAt180d: 0.4,
    ...overrides,
  } as unknown as TractFeatureProperties;
}

describe("map metric access", () => {
  it("uses the neighborhood metric consistently for fill and hover", () => {
    expect(
      resolveMapDisplayMetric(
        "median_household_income",
        "recorded_closure_30d",
      ),
    ).toBe("recorded_closure_30d");
    expect(
      resolveMapDisplayMetric("median_household_income", null),
    ).toBe("median_household_income");
  });

  it("uses exported percentile for intensity fill and actual rate for display", () => {
    const datum = getMapMetricDatum(
      properties({
        housingBuildingComplaintRatePer1000: 71.4,
        housingBuildingComplaintIntensityPercentile: 0.83,
      }),
      "housing_building",
      "complaint_intensity",
    );
    expect(datum.value).toBe(71.4);
    expect(datum.scaleValue).toBe(0.83);
  });

  it("preserves a true zero mapped-request count", () => {
    const datum = getMapMetricDatum(
      properties({
        housingBuildingResponseSampleStatus: "no_requests",
        housingBuildingComplaintCount: 0,
      }),
      "housing_building",
      "mapped_complaint_count",
    );
    expect(datum.available).toBe(true);
    expect(datum.value).toBe(0);
  });

  it("never turns a sparse closure-derived numerator into zero", () => {
    const datum = getMapMetricDatum(
      properties({
        housingBuildingResponseSampleStatus: "insufficient_sample",
        housingBuildingNotRecordedClosedWithin30dCount: 0,
      }),
      "housing_building",
      "not_recorded_closed_age_30d",
    );
    expect(datum.available).toBe(false);
    expect(datum.value).toBeNull();
    expect(datum.unavailableReason).toBe("Insufficient sample");
  });

  it("keeps arrival history available for a sparse scope", () => {
    const datum = getMapMetricDatum(
      properties({
        housingBuildingResponseSampleStatus: "insufficient_sample",
        housingBuildingMean30dArrivals: 2.5,
      }),
      "housing_building",
      "mean_complete_period_arrivals",
    );
    expect(datum.value).toBe(2.5);
  });

  it("does not mislabel missing income with an unrelated response state", () => {
    const datum = getMapMetricDatum(
      properties({
        medianHouseholdIncome: null,
        housingBuildingResponseSampleStatus: "no_requests",
      }),
      "housing_building",
      "median_household_income",
    );
    expect(datum.available).toBe(false);
    expect(datum.unavailableReason).toBe("Not available");
  });
});

describe("map scales", () => {
  it("computes stable quintile thresholds", () => {
    expect(quantileThresholds([1, 2, 3, 4, 5])).toEqual([1.8, 2.6, 3.4, 4.2]);
  });

  it("uses fixed percentile thresholds for complaint intensity", () => {
    const feature = {
      type: "Feature" as const,
      properties: properties(),
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ] as [number, number][],
        ],
      },
    };
    expect(
      createMetricColorScale(
        [feature],
        "housing_building",
        "complaint_intensity",
      ).thresholds,
    ).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  it("implements the specified symmetric neighborhood difference", () => {
    expect(relativeNeighborhoodDifference(30, 10)).toBeCloseTo(0.5);
    expect(relativeNeighborhoodDifference(10, 30)).toBeCloseTo(-0.5);
  });
});
