import type {
  Scenario,
  Workload,
  WorkloadInterval,
} from "@/lib/artifacts";
import type {
  DomainKey,
  WorkloadScope,
} from "@/lib/domain";

export interface ExportedBaselineUncertainty {
  readonly source: "tract_export" | "scenario_export";
  readonly intervals: Readonly<{
    readonly "30": WorkloadInterval;
    readonly "180": WorkloadInterval;
  }>;
}

export interface ExportedBaselineUncertaintyInput {
  readonly workload: Workload;
  readonly domainKey: DomainKey;
  readonly scope: WorkloadScope;
  readonly scopeGeoids: readonly string[];
  readonly currentScenario: Scenario | null;
  readonly pinnedScenario: Scenario | null;
}

/**
 * Resolves only intervals that are already present in the validated artifact
 * set. Arbitrary pooled scopes deliberately return null and use the workload
 * worker instead.
 */
export function resolveExportedBaselineUncertainty(
  input: ExportedBaselineUncertaintyInput,
): ExportedBaselineUncertainty | null {
  const {
    workload,
    domainKey,
    scope,
    scopeGeoids,
    currentScenario,
    pinnedScenario,
  } = input;
  const uniqueGeoids = [...new Set(scopeGeoids)];

  if (
    (scope === "active_tract" || scope === "selected_tracts") &&
    uniqueGeoids.length === 1
  ) {
    const record = workload.tracts[uniqueGeoids[0]]?.[domainKey];
    if (
      record?.sampleStatus === "sufficient" &&
      record.uncertainty["30"] &&
      record.uncertainty["180"]
    ) {
      return {
        source: "tract_export",
        intervals: {
          "30": record.uncertainty["30"],
          "180": record.uncertainty["180"],
        },
      };
    }
    return null;
  }

  const scenario = scope === "current_scenario"
    ? currentScenario
    : scope === "pinned_scenario"
      ? pinnedScenario
      : null;
  if (
    !scenario ||
    scenario.domainKey !== domainKey ||
    !sameGeoidSet(scopeGeoids, scenario.selection.rankedSelectedGeoids)
  ) {
    return null;
  }

  return {
    source: "scenario_export",
    intervals: {
      "30": scenario.metrics.selectedOpenAt30dUncertainty,
      "180": scenario.metrics.selectedOpenAt180dUncertainty,
    },
  };
}

/** Exported values are authoritative only for the unmodified baseline. */
export function exportedBaselineInterval(
  source: ExportedBaselineUncertainty | null,
  ageDays: 30 | 180,
  demandChangePct: number,
  closureCurveShiftPoints: number,
): WorkloadInterval | null {
  if (
    !source ||
    demandChangePct !== 0 ||
    closureCurveShiftPoints !== 0
  ) {
    return null;
  }
  return source.intervals[String(ageDays) as "30" | "180"];
}

function sameGeoidSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size &&
    [...leftSet].every((geoid) => rightSet.has(geoid));
}
