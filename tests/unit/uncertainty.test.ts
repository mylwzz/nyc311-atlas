import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ScenariosSchema,
  WorkloadSchema,
} from "@/lib/artifacts";
import type { DomainKey } from "@/lib/domain";
import {
  deterministicUncertainty,
  exportedBaselineInterval,
  resolveExportedBaselineUncertainty,
  uncertaintySeed,
  type UncertaintyRequest,
} from "@/lib/uncertainty";

const workload = WorkloadSchema.parse(
  JSON.parse(readFileSync("public/data/workload.json", "utf8")),
);
const scenarios = ScenariosSchema.parse(
  JSON.parse(readFileSync("public/data/scenarios.json", "utf8")),
).scenarios;

const request: UncertaintyRequest = {
  artifactSetId: "20260715T045848Z-30e0e7f5",
  baseSeed: 3112016,
  geoids: ["36081003800", "36081077907"],
  domainKey: "public_safety_quality_of_life",
  ageDays: 30,
  periodArrivals: [2, 6, 7, 8, 0, 3, 3, 3, 4, 9, 0, 3, 2],
  fullPeriodIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  knownTiming: 50,
  closedByAge: 46,
  minimumKnownTimingSample: 30,
  draws: 1000,
  demandChangePct: 0,
  closureCurveShiftPoints: 0,
};

describe("deterministic workload uncertainty", () => {
  it("returns byte-for-byte stable results for the same analytical state", () => {
    expect(deterministicUncertainty(request)).toEqual(
      deterministicUncertainty(request),
    );
  });

  it("sorts GEOIDs when deriving the deterministic seed", () => {
    expect(uncertaintySeed(request)).toBe(
      uncertaintySeed({ ...request, geoids: [...request.geoids].reverse() }),
    );
  });

  it("excludes the six-day partial period from resampling", () => {
    const changedPartial = {
      ...request,
      periodArrivals: [...request.periodArrivals.slice(0, 12), 2_000_000],
    };
    expect(deterministicUncertainty(changedPartial)).toEqual(
      deterministicUncertainty(request),
    );
  });

  it("returns null below the pooled timing threshold, not a zero interval", () => {
    expect(
      deterministicUncertainty({
        ...request,
        knownTiming: 29,
        closedByAge: 29,
      }),
    ).toBeNull();
  });

  it("applies supported assumptions and keeps all interval probabilities valid", () => {
    const result = deterministicUncertainty({
      ...request,
      demandChangePct: 50,
      closureCurveShiftPoints: 15,
    })!;
    expect(result.draws).toBe(1000);
    expect(result.open95[0]).toBeGreaterThanOrEqual(0);
    expect(result.open95[0]).toBeLessThanOrEqual(result.open80[0]);
    expect(result.open80[0]).toBeLessThanOrEqual(result.openMedian);
    expect(result.openMedian).toBeLessThanOrEqual(result.open80[1]);
    expect(result.open80[1]).toBeLessThanOrEqual(result.open95[1]);
    expect(result.closure95Pct[0]).toBeGreaterThanOrEqual(0);
    expect(result.closure95Pct[1]).toBeLessThanOrEqual(100);
  });
});

describe("exported baseline uncertainty", () => {
  it("preserves exact current and pinned Scenario Lab intervals for all 550 scenarios at both ages", () => {
    expect(scenarios).toHaveLength(550);

    for (const scenario of scenarios) {
      const shared = {
        workload,
        domainKey: scenario.domainKey,
        scopeGeoids: scenario.selection.rankedSelectedGeoids,
      } as const;
      const current = resolveExportedBaselineUncertainty({
        ...shared,
        scope: "current_scenario",
        currentScenario: scenario,
        pinnedScenario: null,
      });
      const pinned = resolveExportedBaselineUncertainty({
        ...shared,
        scope: "pinned_scenario",
        currentScenario: null,
        pinnedScenario: scenario,
      });

      expect(current?.source).toBe("scenario_export");
      expect(pinned?.source).toBe("scenario_export");
      expect(exportedBaselineInterval(current, 30, 0, 0)).toEqual(
        scenario.metrics.selectedOpenAt30dUncertainty,
      );
      expect(exportedBaselineInterval(current, 180, 0, 0)).toEqual(
        scenario.metrics.selectedOpenAt180dUncertainty,
      );
      expect(exportedBaselineInterval(pinned, 30, 0, 0)).toEqual(
        scenario.metrics.selectedOpenAt30dUncertainty,
      );
      expect(exportedBaselineInterval(pinned, 180, 0, 0)).toEqual(
        scenario.metrics.selectedOpenAt180dUncertainty,
      );
    }
  });

  it("uses exact tract exports for a one-tract scope without creating sparse zeros", () => {
    const examples = Object.entries(workload.tracts)
      .flatMap(([geoid, domains]) =>
        Object.entries(domains).map(([domainKey, record]) => ({
          geoid,
          domainKey,
          record,
        })),
      )
      .filter(({ record }) => record.sampleStatus === "sufficient")
      .slice(0, 25);

    expect(examples).toHaveLength(25);
    for (const { geoid, domainKey, record } of examples) {
      const source = resolveExportedBaselineUncertainty({
        workload,
        domainKey: domainKey as DomainKey,
        scope: "active_tract",
        scopeGeoids: [geoid],
        currentScenario: null,
        pinnedScenario: null,
      });
      expect(source?.source).toBe("tract_export");
      expect(exportedBaselineInterval(source, 30, 0, 0)).toEqual(
        record.uncertainty["30"],
      );
      expect(exportedBaselineInterval(source, 180, 0, 0)).toEqual(
        record.uncertainty["180"],
      );
    }

    const sparse = Object.entries(workload.tracts)
      .flatMap(([geoid, domains]) =>
        Object.entries(domains).map(([domainKey, record]) => ({
          geoid,
          domainKey,
          record,
        })),
      )
      .find(({ record }) => record.sampleStatus !== "sufficient")!;
    expect(
      resolveExportedBaselineUncertainty({
        workload,
        domainKey: sparse.domainKey as DomainKey,
        scope: "active_tract",
        scopeGeoids: [sparse.geoid],
        currentScenario: null,
        pinnedScenario: null,
      }),
    ).toBeNull();
  });

  it("retains worker recomputation for changed assumptions and arbitrary pooled scopes", () => {
    const scenario = scenarios[0];
    const source = resolveExportedBaselineUncertainty({
      workload,
      domainKey: scenario.domainKey,
      scope: "current_scenario",
      scopeGeoids: scenario.selection.rankedSelectedGeoids,
      currentScenario: scenario,
      pinnedScenario: null,
    });

    expect(exportedBaselineInterval(source, 30, 10, 0)).toBeNull();
    expect(exportedBaselineInterval(source, 30, 0, 5)).toBeNull();
    expect(
      resolveExportedBaselineUncertainty({
        workload,
        domainKey: scenario.domainKey,
        scope: "selected_tracts",
        scopeGeoids: scenario.selection.rankedSelectedGeoids.slice(0, 2),
        currentScenario: scenario,
        pinnedScenario: null,
      }),
    ).toBeNull();
  });
});
