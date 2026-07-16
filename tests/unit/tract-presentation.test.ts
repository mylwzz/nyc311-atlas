import { describe, expect, it } from "vitest";

import type {
  TractFeatureProperties,
  TractWorkloadRecord,
} from "@/lib/artifacts";
import {
  getRecordedResponsePresentation,
  getTractUncertaintyPresentation,
} from "@/components/explore/tractPresentation";

function properties(
  values: Record<string, unknown>,
): TractFeatureProperties {
  return {
    geoid: "36081003700",
    ...values,
  } as unknown as TractFeatureProperties;
}

describe("tract recorded-response presentation", () => {
  it("keeps insufficient response metrics suppressed instead of displaying zero", () => {
    const response = getRecordedResponsePresentation(
      properties({
        housingBuildingResponseSampleStatus: "insufficient_sample",
        housingBuildingComplaintCount: 18,
        housingBuildingKnownClosureTimingOutcomes30d: 18,
        housingBuildingKnownClosureTimingOutcomes180d: 18,
        housingBuildingValidRecordedClosures: 12,
        // Even a malformed, unvalidated caller cannot leak a zero closure value
        // through the sparse presentation branch.
        housingBuildingRecordedClosureWithin30dPct: 0,
        housingBuildingOpenAt30d: 0,
      }),
      "housing_building",
    );

    expect(response.status).toBe("insufficient_sample");
    expect(response.metrics).toBeNull();
    expect(response.title).toBe("Small response sample");
    expect(response).not.toHaveProperty("recordedClosureWithin30dPct");
  });

  it("distinguishes no requests from a supported numeric zero", () => {
    const response = getRecordedResponsePresentation(
      properties({
        housingBuildingResponseSampleStatus: "no_requests",
        housingBuildingComplaintCount: 0,
        housingBuildingKnownClosureTimingOutcomes30d: 0,
        housingBuildingKnownClosureTimingOutcomes180d: 0,
        housingBuildingValidRecordedClosures: 0,
      }),
      "housing_building",
    );

    expect(response.status).toBe("no_requests");
    expect(response.requestCount).toBe(0);
    expect(response.metrics).toBeNull();
    expect(response).not.toHaveProperty("recordedClosureWithin30dPct");
  });

  it("preserves supported numeric zeros for a sufficient sample", () => {
    const response = getRecordedResponsePresentation(
      properties({
        housingBuildingResponseSampleStatus: "sufficient",
        housingBuildingComplaintCount: 40,
        housingBuildingKnownClosureTimingOutcomes30d: 40,
        housingBuildingKnownClosureTimingOutcomes180d: 40,
        housingBuildingValidRecordedClosures: 40,
        housingBuildingRecordedClosureWithin30dPct: 100,
        housingBuildingRecordedClosureWithin180dPct: 100,
        housingBuildingMedianRecordedDaysToClose: 0.2,
        housingBuildingNotRecordedClosedWithin30dCount: 0,
        housingBuildingNotRecordedClosedWithin180dCount: 0,
        housingBuildingNotRecordedClosedWithin30dPer1000: 0,
        housingBuildingNotRecordedClosedWithin180dPer1000: 0,
        housingBuildingOpenAt30d: 0,
        housingBuildingOpenAt180d: 0,
      }),
      "housing_building",
    );

    expect(response.metrics).not.toBeNull();
    expect(response.metrics?.notRecordedClosedWithin30dCount).toBe(0);
    expect(response.metrics?.expectedCohortOpenAt30d).toBe(0);
  });
});

describe("tract uncertainty presentation", () => {
  it("suppresses every interval for a sparse workload record", () => {
    const uncertainty = getTractUncertaintyPresentation({
      sampleStatus: "insufficient_sample",
      uncertainty: { "30": null, "180": null },
    } as unknown as TractWorkloadRecord);

    expect(uncertainty.title).toBe("Small response sample");
    expect(uncertainty.age30).toBeNull();
    expect(uncertainty.age180).toBeNull();
  });

  it("preserves exported supported zeros instead of treating them as missing", () => {
    const zeroInterval = {
      openMedian: 0,
      open80: [0, 0] as [number, number],
      open95: [0, 0] as [number, number],
      closureMedianPct: 100,
      closure80Pct: [100, 100] as [number, number],
      closure95Pct: [100, 100] as [number, number],
    };
    const uncertainty = getTractUncertaintyPresentation({
      sampleStatus: "sufficient",
      uncertainty: { "30": zeroInterval, "180": zeroInterval },
    } as unknown as TractWorkloadRecord);

    expect(uncertainty.status).toBe("sufficient");
    expect(uncertainty.age30?.openMedian).toBe(0);
    expect(uncertainty.age180?.closureMedianPct).toBe(100);
  });
});
