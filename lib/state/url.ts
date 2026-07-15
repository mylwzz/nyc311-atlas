import {
  ALPHA_VALUES,
  DOMAIN_KEYS,
  K_VALUES,
  MAP_METRICS,
  NEIGHBORHOOD_METRICS,
  SCALING_MODES,
  type AlphaValue,
  type DomainKey,
  type KValue,
  type MapMetric,
  type NeighborhoodMetric,
  type ScalingMode,
  type Workspace,
} from "@/lib/domain";
import type { AtlasState } from "@/lib/state/store";

export interface ShareableState {
  workspace?: Workspace;
  activeDomain?: DomainKey;
  activeMapMetric?: MapMetric;
  selectedGeoids?: string[];
  activeGeoid?: string | null;
  neighborhood?: {
    enabled: boolean;
    radius: 1 | 2 | 3 | 4 | 5;
    metric: NeighborhoodMetric;
  };
  scenario?: {
    scalingMode: ScalingMode;
    domain: DomainKey;
    k: KValue;
    alpha: AlphaValue;
    currentScenarioId: string | null;
    pinnedScenarioId: string | null;
  };
  workload?: {
    demandChangePct: number;
    closureCurveShiftPoints: number;
  };
}

const GEOID_PATTERN = /^\d{11}$/;

function oneOf<const T extends readonly (string | number)[]>(
  value: string | null,
  allowed: T,
): T[number] | undefined {
  if (value === null) return undefined;
  const candidate = allowed.some((item) => String(item) === value);
  if (!candidate) return undefined;
  return allowed.find((item) => String(item) === value);
}

export function parseShareableState(params: URLSearchParams): ShareableState {
  const workspace = oneOf(params.get("workspace"), [
    "explore",
    "scenario",
    "workload",
  ] as const);
  const activeDomain = oneOf(params.get("domain"), DOMAIN_KEYS);
  const activeMapMetric = oneOf(params.get("metric"), MAP_METRICS);
  const selectedGeoids = (params.get("tracts") ?? "")
    .split(",")
    .filter((value) => GEOID_PATTERN.test(value))
    .slice(0, 5);
  const activeCandidate = params.get("active");
  const activeGeoid =
    activeCandidate && selectedGeoids.includes(activeCandidate)
      ? activeCandidate
      : undefined;
  const radiusNumber = Number(params.get("radius"));
  const radius = [1, 2, 3, 4, 5].includes(radiusNumber)
    ? (radiusNumber as 1 | 2 | 3 | 4 | 5)
    : 1;
  const neighborhoodMetric =
    oneOf(params.get("nearMetric"), NEIGHBORHOOD_METRICS) ??
    "complaint_intensity";
  const scalingMode =
    oneOf(params.get("mode"), SCALING_MODES) ?? "rank_balanced";
  const scenarioDomain =
    oneOf(params.get("scenarioDomain"), DOMAIN_KEYS) ??
    activeDomain ??
    "housing_building";
  const k = oneOf(params.get("k"), K_VALUES) ?? 100;
  const alpha = oneOf(params.get("alpha"), ALPHA_VALUES) ?? 0.5;
  const demand = Number(params.get("demand"));
  const closure = Number(params.get("closure"));

  return {
    workspace,
    activeDomain,
    activeMapMetric,
    selectedGeoids: selectedGeoids.length ? selectedGeoids : undefined,
    activeGeoid,
    neighborhood: {
      enabled: params.get("neighborhood") === "1" && selectedGeoids.length > 0,
      radius,
      metric: neighborhoodMetric,
    },
    scenario: {
      scalingMode,
      domain: scenarioDomain,
      k,
      alpha,
      currentScenarioId: params.get("scenario"),
      pinnedScenarioId: params.get("pinned"),
    },
    workload: {
      demandChangePct: Number.isFinite(demand)
        ? Math.min(50, Math.max(-30, demand))
        : 0,
      closureCurveShiftPoints: Number.isFinite(closure)
        ? Math.min(15, Math.max(-15, closure))
        : 0,
    },
  };
}

export function serializeShareableState(
  state: Pick<
    AtlasState,
    | "workspace"
    | "activeDomain"
    | "activeMapMetric"
    | "selectedGeoids"
    | "activeGeoid"
    | "neighborhood"
    | "scenario"
    | "workload"
  >,
): string {
  const params = new URLSearchParams();
  if (state.workspace !== "explore") params.set("workspace", state.workspace);
  if (state.activeDomain !== "housing_building")
    params.set("domain", state.activeDomain);
  if (state.activeMapMetric !== "complaint_intensity")
    params.set("metric", state.activeMapMetric);
  if (state.selectedGeoids.length)
    params.set("tracts", state.selectedGeoids.join(","));
  if (state.activeGeoid) params.set("active", state.activeGeoid);
  if (state.neighborhood.enabled) params.set("neighborhood", "1");
  if (state.neighborhood.radius !== 1)
    params.set("radius", String(state.neighborhood.radius));
  if (state.neighborhood.metric !== "complaint_intensity")
    params.set("nearMetric", state.neighborhood.metric);
  if (state.scenario.scalingMode !== "rank_balanced")
    params.set("mode", state.scenario.scalingMode);
  if (state.scenario.domain !== state.activeDomain)
    params.set("scenarioDomain", state.scenario.domain);
  if (state.scenario.k !== 100) params.set("k", String(state.scenario.k));
  if (state.scenario.alpha !== 0.5)
    params.set("alpha", String(state.scenario.alpha));
  if (state.scenario.currentScenarioId)
    params.set("scenario", state.scenario.currentScenarioId);
  if (state.scenario.pinnedScenarioId)
    params.set("pinned", state.scenario.pinnedScenarioId);
  if (state.workload.demandChangePct)
    params.set("demand", String(state.workload.demandChangePct));
  if (state.workload.closureCurveShiftPoints)
    params.set("closure", String(state.workload.closureCurveShiftPoints));
  return params.toString();
}
