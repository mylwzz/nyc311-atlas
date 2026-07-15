import { describe, expect, it } from "vitest";

import {
  aggregateWorkloadScope,
  applyClosureCurveShift,
  applyDemandChange,
  evaluateWorkload,
  observedClosureCurve,
  replayWorkload,
  workloadSampleStatus,
  type WorkloadModelConfig,
  type WorkloadTractIndex,
  type WorkloadTractRecord,
} from "@/lib/workload";

const periods = Array.from({ length: 13 }, (_, index) => ({
  index,
  start: `period-${index}`,
  periodEnd: `period-${index}-end`,
  observedEnd: `period-${index}-observed-end`,
  daysObserved: index === 12 ? 6 : 30,
  isFullPeriod: index < 12,
}));

const config: WorkloadModelConfig = {
  periods,
  fullPeriodIndices: Array.from({ length: 12 }, (_, index) => index),
  ageCheckpointsDays: Array.from({ length: 19 }, (_, index) => (index + 1) * 30),
  minimumKnownTimingSample: 30,
  periodDays: 30,
  replayRunoffPeriods: 6,
};

function record(
  periodArrivals: readonly number[],
  knownTiming: number,
  closedByAge: readonly number[],
): WorkloadTractRecord {
  const requestCount = periodArrivals.reduce((total, value) => total + value, 0);
  const sampleStatus = workloadSampleStatus(requestCount, knownTiming, 30);
  const full = periodArrivals.slice(0, 12).sort((a, b) => a - b);
  const mean = periodArrivals.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  return {
    requestCount,
    periodArrivals,
    meanFullPeriodArrivals: mean,
    medianFullPeriodArrivals: (full[5] + full[6]) / 2,
    p10FullPeriodArrivals: 0,
    p90FullPeriodArrivals: 0,
    knownTiming,
    validClosures: closedByAge.at(-1) ?? 0,
    closedByAge,
    sampleStatus,
    supportsTractSpecificCurve: sampleStatus === "sufficient",
    supportsTractSpecificReplay: sampleStatus === "sufficient",
    curveSource: sampleStatus === "sufficient" ? "tract_observed" : null,
    uncertainty: { "30": null, "180": null },
  };
}

describe("workload sample states and aggregation", () => {
  it("keeps all four sparse states distinct", () => {
    expect(workloadSampleStatus(0, 0, 30)).toBe("no_requests");
    expect(workloadSampleStatus(8, 0, 30)).toBe("no_known_timing");
    expect(workloadSampleStatus(8, 8, 30)).toBe("insufficient_sample");
    expect(workloadSampleStatus(30, 30, 30)).toBe("sufficient");
  });

  it("sums arrays and raw counts before deriving a pooled curve", () => {
    const firstArrivals = [1, 5, 5, 5, 0, 2, 0, 3, 1, 5, 0, 0, 2];
    const secondArrivals = [1, 1, 2, 3, 0, 1, 3, 0, 3, 4, 0, 3, 0];
    const firstClosed = [
      27, 27, 28, 28, 28, 28, 28, 29, 29, 29, 29, 29, 29, 29, 29, 29,
      29, 29, 29,
    ];
    const secondClosed = [
      19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 20, 20, 20,
      20, 20, 20,
    ];
    const tracts: WorkloadTractIndex = {
      B: { public_safety_quality_of_life: record(secondArrivals, 21, secondClosed) },
      A: { public_safety_quality_of_life: record(firstArrivals, 29, firstClosed) },
    };

    const aggregate = aggregateWorkloadScope(
      tracts,
      ["B", "A", "A"],
      "public_safety_quality_of_life",
      config,
    );
    expect(aggregate.kind).toBe("aggregate");
    if (aggregate.kind !== "aggregate") return;
    expect(aggregate.geoids).toEqual(["A", "B"]);
    expect(aggregate.knownTiming).toBe(50);
    expect(aggregate.sampleStatus).toBe("sufficient");
    expect(aggregate.periodArrivals).toEqual(
      firstArrivals.map((value, index) => value + secondArrivals[index]),
    );
    expect(aggregate.closedByAge[0]).toBe(46);
    expect(aggregate.meanFullPeriodArrivals).toBe(4);
    expect(observedClosureCurve(aggregate, config)?.[0].closureProbability).toBe(
      0.92,
    );
  });

  it("returns an explicit empty scope and rejects unknown tracts", () => {
    expect(
      aggregateWorkloadScope({}, [], "noise", config),
    ).toEqual({ kind: "empty_scope", domainKey: "noise", geoids: [] });
    expect(() =>
      aggregateWorkloadScope({}, ["missing"], "noise", config),
    ).toThrow(/unknown GEOID/);
  });

  it("never converts unavailable closure evidence into a zero curve", () => {
    const arrivals = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const tracts: WorkloadTractIndex = {
      sparse: { noise: record(arrivals, 0, Array(19).fill(0)) },
    };
    const aggregate = aggregateWorkloadScope(tracts, ["sparse"], "noise", config);
    expect(aggregate.kind).toBe("aggregate");
    if (aggregate.kind !== "aggregate") return;
    expect(aggregate.sampleStatus).toBe("no_known_timing");
    expect(observedClosureCurve(aggregate, config)).toBeNull();
    const evaluation = evaluateWorkload(aggregate, config, {
      demandChangePct: 0,
      closureCurveShiftPoints: 0,
    });
    expect(evaluation.periodArrivals[0]).toBe(1);
    expect(evaluation.closureCurve).toBeNull();
    expect(evaluation.replay).toBeNull();
    expect(evaluation.cohortOpenAt30Days).toBeNull();
  });
});

describe("age-structured replay", () => {
  const baseCurve = config.ageCheckpointsDays.map((ageDays, index) => ({
    ageDays,
    observedClosedByAge: index,
    baselineClosureProbability: Math.min((index + 1) * 0.04, 0.76),
    closureProbability: Math.min((index + 1) * 0.04, 0.76),
    survivalProbability: 1 - Math.min((index + 1) * 0.04, 0.76),
  }));

  it("satisfies the balance and net-change identities in every replay period", () => {
    const replay = replayWorkload({
      periodArrivals: [10, 20, 30],
      closureCurve: baseCurve,
      periodDays: 30,
      runoffPeriods: 6,
    });
    let priorOpen = 0;
    for (const period of replay) {
      expect(
        priorOpen + period.newRequests - period.expectedRecordedClosures,
      ).toBeCloseTo(period.expectedOpenBalance, 10);
      expect(period.expectedOpenBalance - priorOpen).toBeCloseTo(
        period.netOpenChange,
        10,
      );
      priorOpen = period.expectedOpenBalance;
    }
  });

  it("reconciles every age bucket to the expected open balance", () => {
    const replay = replayWorkload({
      periodArrivals: [10, 20, 30],
      closureCurve: baseCurve,
      periodDays: 30,
    });
    for (const period of replay) {
      expect(Object.values(period.openByAge).reduce((a, b) => a + b, 0)).toBeCloseTo(
        period.expectedOpenBalance,
        12,
      );
    }
    expect(replay).toHaveLength(9);
    expect(replay.at(-1)?.openByAge["181_360"]).toBeGreaterThan(0);
  });
});

describe("assumption-based workload scenarios", () => {
  it("applies demand change to every period, including the partial period", () => {
    expect(applyDemandChange([10, 20, 6], 50)).toEqual([15, 30, 9]);
    const reduced = applyDemandChange([10, 20, 6], -30);
    expect(reduced.slice(0, 2)).toEqual([7, 14]);
    expect(reduced[2]).toBeCloseTo(4.2, 12);
  });

  it("excludes the partial period from complete-period summaries", () => {
    const arrivals = [...Array(12).fill(10), 999];
    const tracts: WorkloadTractIndex = {
      A: { noise: record(arrivals, 120, Array(19).fill(60)) },
    };
    const aggregate = aggregateWorkloadScope(tracts, ["A"], "noise", config);
    expect(aggregate.kind).toBe("aggregate");
    if (aggregate.kind !== "aggregate") return;
    expect(aggregate.meanFullPeriodArrivals).toBe(10);
    expect(aggregate.periodArrivals[12]).toBe(999);
  });

  it("adds percentage points, clamps, and preserves closure monotonicity", () => {
    const curve = config.ageCheckpointsDays.map((ageDays, index) => ({
      ageDays,
      observedClosedByAge: index,
      baselineClosureProbability: index / 18,
      closureProbability: index / 18,
      survivalProbability: 1 - index / 18,
    }));
    const increased = applyClosureCurveShift(curve, 15);
    const decreased = applyClosureCurveShift(curve, -15);
    expect(increased[0].closureProbability).toBe(0.15);
    expect(increased.at(-1)?.closureProbability).toBe(1);
    expect(decreased[0].closureProbability).toBe(0);
    for (let index = 1; index < increased.length; index += 1) {
      expect(increased[index].closureProbability).toBeGreaterThanOrEqual(
        increased[index - 1].closureProbability,
      );
      expect(decreased[index].closureProbability).toBeGreaterThanOrEqual(
        decreased[index - 1].closureProbability,
      );
    }
  });
});
