"use client";

import { create } from "zustand";
import type {
  AlphaValue,
  DomainKey,
  KValue,
  MapMetric,
  NeighborhoodMetric,
  ScalingMode,
  WorkloadScope,
  WorkloadTab,
  Workspace,
} from "@/lib/domain";

export type AssistantAction =
  | { type: "set_workspace"; workspace: Workspace }
  | { type: "set_domain"; domain: DomainKey }
  | { type: "set_map_metric"; metric: MapMetric }
  | { type: "select_tracts"; geoids: string[]; activeGeoid?: string }
  | {
      type: "set_neighborhood";
      enabled: boolean;
      radius?: 1 | 2 | 3 | 4 | 5;
    }
  | {
      type: "set_scenario";
      scalingMode: ScalingMode;
      domain: DomainKey;
      k: KValue;
      alpha: AlphaValue;
    }
  | {
      type: "set_workload_assumptions";
      demandChangePct: number;
      closureCurveShiftPoints: number;
    };

export interface AtlasState {
  workspace: Workspace;
  activeDomain: DomainKey;
  activeMapMetric: MapMetric;
  selectedGeoids: string[];
  activeGeoid: string | null;
  selectionNotice: string | null;
  hoveredGeoid: string | null;
  neighborhood: {
    enabled: boolean;
    radius: 1 | 2 | 3 | 4 | 5;
    metric: NeighborhoodMetric;
  };
  scenario: {
    scalingMode: ScalingMode;
    domain: DomainKey;
    k: KValue;
    alpha: AlphaValue;
    currentScenarioId: string | null;
    pinnedScenarioId: string | null;
  };
  workload: {
    tab: WorkloadTab;
    scope: WorkloadScope;
    requestAgeDays: 30 | 180;
    demandChangePct: number;
    closureCurveShiftPoints: number;
    intervalLevel: 80 | 95;
  };
  assistant: {
    open: boolean;
    pendingAction: AssistantAction | null;
  };
  methodologyOpen: boolean;
  setWorkspace: (workspace: Workspace) => void;
  setDomain: (domain: DomainKey) => void;
  setMapMetric: (metric: MapMetric) => void;
  toggleTract: (geoid: string) => void;
  selectTracts: (geoids: string[], activeGeoid?: string | null) => void;
  activateTract: (geoid: string) => void;
  clearSelection: () => void;
  clearSelectionNotice: () => void;
  setHoveredGeoid: (geoid: string | null) => void;
  setNeighborhoodEnabled: (enabled: boolean) => void;
  setNeighborhoodRadius: (radius: 1 | 2 | 3 | 4 | 5) => void;
  setNeighborhoodMetric: (metric: NeighborhoodMetric) => void;
  setScenarioControls: (
    controls: Partial<{
      scalingMode: ScalingMode;
      domain: DomainKey;
      k: KValue;
      alpha: AlphaValue;
    }>,
  ) => void;
  setCurrentScenario: (scenarioId: string | null) => void;
  setPinnedScenario: (scenarioId: string | null) => void;
  setWorkloadTab: (tab: WorkloadTab) => void;
  setWorkloadScope: (scope: WorkloadScope) => void;
  setRequestAge: (age: 30 | 180) => void;
  setDemandChange: (pct: number) => void;
  setClosureShift: (points: number) => void;
  setIntervalLevel: (level: 80 | 95) => void;
  setAssistantOpen: (open: boolean) => void;
  setPendingAssistantAction: (action: AssistantAction | null) => void;
  applyAssistantAction: () => void;
  setMethodologyOpen: (open: boolean) => void;
}

const initialState = {
  workspace: "explore" as const,
  activeDomain: "housing_building" as const,
  activeMapMetric: "complaint_intensity" as const,
  selectedGeoids: [] as string[],
  activeGeoid: null as string | null,
  selectionNotice: null as string | null,
  hoveredGeoid: null as string | null,
  neighborhood: {
    enabled: false,
    radius: 1 as const,
    metric: "complaint_intensity" as const,
  },
  scenario: {
    scalingMode: "rank_balanced" as const,
    domain: "housing_building" as const,
    k: 100 as const,
    alpha: 0.5 as const,
    currentScenarioId: null as string | null,
    pinnedScenarioId: null as string | null,
  },
  workload: {
    tab: "historical" as const,
    scope: "active_tract" as const,
    requestAgeDays: 30 as const,
    demandChangePct: 0,
    closureCurveShiftPoints: 0,
    intervalLevel: 80 as const,
  },
  assistant: {
    open: false,
    pendingAction: null as AssistantAction | null,
  },
  methodologyOpen: false,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  ...initialState,
  setWorkspace: (workspace) => set({ workspace }),
  setDomain: (activeDomain) =>
    set((state) => ({
      activeDomain,
      scenario: { ...state.scenario, domain: activeDomain },
    })),
  setMapMetric: (activeMapMetric) => set({ activeMapMetric }),
  toggleTract: (geoid) =>
    set((state) => {
      if (state.selectedGeoids.includes(geoid)) {
        const selectedGeoids = state.selectedGeoids.filter(
          (candidate) => candidate !== geoid,
        );
        const activeGeoid =
          state.activeGeoid === geoid
            ? (selectedGeoids.at(-1) ?? null)
            : state.activeGeoid;
        return {
          selectedGeoids,
          activeGeoid,
          selectionNotice: null,
          neighborhood:
            activeGeoid === null
              ? { ...state.neighborhood, enabled: false }
              : state.neighborhood,
        };
      }

      if (state.selectedGeoids.length >= 5) {
        return { selectionNotice: "Compare up to 5 tracts at once." };
      }

      return {
        selectedGeoids: [...state.selectedGeoids, geoid],
        activeGeoid: geoid,
        selectionNotice: null,
      };
    }),
  selectTracts: (geoids, activeGeoid) => {
    const unique = [...new Set(geoids)].slice(0, 5);
    const nextActive =
      activeGeoid && unique.includes(activeGeoid)
        ? activeGeoid
        : (unique.at(-1) ?? null);
    set((state) => ({
      selectedGeoids: unique,
      activeGeoid: nextActive,
      selectionNotice:
        geoids.length > 5 ? "Compare up to 5 tracts at once." : null,
      neighborhood:
        nextActive === null
          ? { ...state.neighborhood, enabled: false }
          : state.neighborhood,
    }));
  },
  activateTract: (geoid) =>
    set((state) =>
      state.selectedGeoids.includes(geoid) ? { activeGeoid: geoid } : {},
    ),
  clearSelection: () =>
    set((state) => ({
      selectedGeoids: [],
      activeGeoid: null,
      selectionNotice: null,
      neighborhood: { ...state.neighborhood, enabled: false },
    })),
  clearSelectionNotice: () => set({ selectionNotice: null }),
  setHoveredGeoid: (hoveredGeoid) => set({ hoveredGeoid }),
  setNeighborhoodEnabled: (enabled) =>
    set((state) => ({
      neighborhood: {
        ...state.neighborhood,
        enabled: enabled && state.activeGeoid !== null,
      },
    })),
  setNeighborhoodRadius: (radius) =>
    set((state) => ({ neighborhood: { ...state.neighborhood, radius } })),
  setNeighborhoodMetric: (metric) =>
    set((state) => ({ neighborhood: { ...state.neighborhood, metric } })),
  setScenarioControls: (controls) =>
    set((state) => ({
      activeDomain: controls.domain ?? state.activeDomain,
      scenario: { ...state.scenario, ...controls },
    })),
  setCurrentScenario: (currentScenarioId) =>
    set((state) => ({ scenario: { ...state.scenario, currentScenarioId } })),
  setPinnedScenario: (pinnedScenarioId) =>
    set((state) => ({ scenario: { ...state.scenario, pinnedScenarioId } })),
  setWorkloadTab: (tab) =>
    set((state) => ({ workload: { ...state.workload, tab } })),
  setWorkloadScope: (scope) =>
    set((state) => ({ workload: { ...state.workload, scope } })),
  setRequestAge: (requestAgeDays) =>
    set((state) => ({ workload: { ...state.workload, requestAgeDays } })),
  setDemandChange: (demandChangePct) =>
    set((state) => ({
      workload: {
        ...state.workload,
        demandChangePct: clamp(demandChangePct, -30, 50),
      },
    })),
  setClosureShift: (closureCurveShiftPoints) =>
    set((state) => ({
      workload: {
        ...state.workload,
        closureCurveShiftPoints: clamp(closureCurveShiftPoints, -15, 15),
      },
    })),
  setIntervalLevel: (intervalLevel) =>
    set((state) => ({ workload: { ...state.workload, intervalLevel } })),
  setAssistantOpen: (open) =>
    set((state) => ({ assistant: { ...state.assistant, open } })),
  setPendingAssistantAction: (pendingAction) =>
    set((state) => ({ assistant: { ...state.assistant, pendingAction } })),
  applyAssistantAction: () => {
    const action = get().assistant.pendingAction;
    if (!action) return;

    switch (action.type) {
      case "set_workspace":
        get().setWorkspace(action.workspace);
        break;
      case "set_domain":
        get().setDomain(action.domain);
        break;
      case "set_map_metric":
        get().setMapMetric(action.metric);
        break;
      case "select_tracts":
        get().selectTracts(action.geoids, action.activeGeoid);
        break;
      case "set_neighborhood":
        if (action.radius) get().setNeighborhoodRadius(action.radius);
        get().setNeighborhoodEnabled(action.enabled);
        break;
      case "set_scenario":
        get().setScenarioControls({
          scalingMode: action.scalingMode,
          domain: action.domain,
          k: action.k,
          alpha: action.alpha,
        });
        get().setWorkspace("scenario");
        break;
      case "set_workload_assumptions":
        get().setDemandChange(action.demandChangePct);
        get().setClosureShift(action.closureCurveShiftPoints);
        get().setWorkloadTab("scenario");
        get().setWorkspace("workload");
        break;
    }

    set((state) => ({
      assistant: { ...state.assistant, pendingAction: null },
    }));
  },
  setMethodologyOpen: (methodologyOpen) => set({ methodologyOpen }),
}));

export function resetAtlasStore(): void {
  useAtlasStore.setState(initialState);
}
