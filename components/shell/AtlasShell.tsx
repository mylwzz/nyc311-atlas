"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AssistantPanel, type AssistantPanelProps } from "@/components/assistant/AssistantPanel";
import { MapControls } from "@/components/explore/MapControls";
import { SelectedChips } from "@/components/explore/SelectedChips";
import { TractComparison } from "@/components/explore/TractComparison";
import { getRecordedResponsePresentation } from "@/components/explore/tractPresentation";
import { AtlasMap } from "@/components/map";
import {
  MethodologyModal,
  type MethodologyTopic,
} from "@/components/methodology/MethodologyModal";
import { NeighborhoodPanel } from "@/components/neighborhood/NeighborhoodPanel";
import { ScenarioLab } from "@/components/scenario";
import { WorkloadPanel } from "@/components/workload/WorkloadPanel";
import type { Scenario, Workload } from "@/lib/artifacts";
import {
  DOMAIN_CONFIG,
  type WorkloadScope,
  type Workspace,
} from "@/lib/domain";
import { getActiveDomainSummary, getMapMetricDatum } from "@/lib/map";
import { createScenarioIndex, lookupScenario } from "@/lib/scenario";
import {
  createNeighborhoodCache,
  summarizeNeighborhoodMetric,
  type QueenNeighborhood,
} from "@/lib/spatial";
import { useAtlasStore } from "@/lib/state/store";
import { parseShareableState, serializeShareableState } from "@/lib/state/url";
import { resolveExportedBaselineUncertainty } from "@/lib/uncertainty";
import { aggregateWorkloadScope, evaluateWorkload } from "@/lib/workload";

import { ArtifactProvider, useArtifacts } from "./ArtifactProvider";
import {
  DataNotes,
  type DataNotesMethodologyTopic,
} from "./DataNotes";

const WORKSPACES: readonly {
  key: Workspace;
  label: string;
  subtitle: string;
}[] = [
  {
    key: "explore",
    label: "Explore",
    subtitle: "Understand a tract and its surroundings.",
  },
  {
    key: "scenario",
    label: "Prioritize",
    subtitle: "Rank tracts using complaint intensity and lower-income priority.",
  },
  {
    key: "workload",
    label: "Model",
    subtitle: "Replay historical request flow and test explicit assumptions.",
  },
];

const RAIL_WIDTH_STORAGE_KEY = "nyc311-atlas:analysis-rail-width";
const MIN_RAIL_WIDTH = 340;
const MAX_RAIL_WIDTH = 760;

function clampRailWidth(value: number): number {
  if (typeof window === "undefined") {
    return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, value));
  }
  const available = Math.max(MIN_RAIL_WIDTH, window.innerWidth - 320);
  return Math.min(
    Math.min(MAX_RAIL_WIDTH, available),
    Math.max(MIN_RAIL_WIDTH, value),
  );
}

function blocksSpatialShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable='false']), [role='button']",
    ),
  );
}

function scenarioContext(
  scenario: Scenario | null,
  selectedGeoids: readonly string[],
): Record<string, unknown> | null {
  if (!scenario) return null;
  const selection = scenario.selection.rankedSelectedGeoids;
  return {
    id: scenario.id,
    scalingMode: scenario.scalingMode,
    domainKey: scenario.domainKey,
    priorityPortfolioSize: scenario.k,
    alphaIntensity: scenario.alphaIntensity,
    alphaLowerIncome: scenario.alphaLowerIncome,
    selectionCutoffScore: scenario.selection.selectionCutoffScore,
    selectedTractCount: selection.length,
    metrics: scenario.metrics,
    manualComparisonMembership: selectedGeoids.map((geoid) => ({
      geoid,
      selected: selection.includes(geoid),
      rank: selection.indexOf(geoid) >= 0 ? selection.indexOf(geoid) + 1 : null,
    })),
  };
}

function workloadConfig(workload: Workload) {
  return {
    periods: workload.periods,
    fullPeriodIndices: workload.fullPeriodIndices,
    ageCheckpointsDays: workload.ageCheckpointsDays,
    minimumKnownTimingSample: workload.uncertainty.minimumKnownTimingSample,
    periodDays: 30,
    replayRunoffPeriods: 6,
  } as const;
}

function StartupGate() {
  const { startupStatus, startupError, retryStartup } = useArtifacts();
  if (startupStatus === "loading") {
    return (
      <main className="startup-screen" aria-busy="true">
        <div className="startup-card">
          <div className="eyebrow">Validating artifact contract</div>
          <h1>NYC 311 Priority Atlas</h1>
          <div className="loading-line" />
          <p className="helper-text">Loading the manifest, metadata, context, and tract geometry. Analytical workspaces load only when opened.</p>
        </div>
      </main>
    );
  }
  if (startupStatus === "error") {
    return (
      <main className="startup-screen">
        <div className="startup-card error-state" role="alert">
          <div className="eyebrow">Artifact loading blocked</div>
          <h1>The validated data contract could not be opened.</h1>
          <p>{startupError?.message ?? "An unknown artifact error occurred."}</p>
          <p className="helper-text">The Atlas will not mix artifact sets or continue with an invalid schema, model, integrity digest, or fetch result.</p>
          <button className="button primary" type="button" onClick={retryStartup}>Retry artifact validation</button>
        </div>
      </main>
    );
  }
  return <AtlasWorkspace />;
}

function AtlasWorkspace() {
  const artifacts = useArtifacts();
  const {
    manifest,
    metadata,
    context,
    tracts,
    tractDetails,
    scenarios,
    workload,
    lazyStatus,
    lazyErrors,
    loadTractDetails,
    loadScenarios,
    loadWorkload,
  } = artifacts;
  const state = useAtlasStore();
  const selectedCount = state.selectedGeoids.length;
  const clearSelection = state.clearSelection;
  const setCurrentScenario = state.setCurrentScenario;
  const setPinnedScenario = state.setPinnedScenario;
  const hydrated = useRef(false);
  const [urlReady, setUrlReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [dataNotesOpen, setDataNotesOpen] = useState(false);
  const [methodologyTopic, setMethodologyTopic] =
    useState<MethodologyTopic>("overview");
  const [railWidth, setRailWidth] = useState<number | null>(null);
  const [spatialAnnouncement, setSpatialAnnouncement] = useState("");
  const railRef = useRef<HTMLElement>(null);
  const railResizeActive = useRef(false);

  if (!manifest || !metadata || !context || !tracts) {
    throw new Error("Ready artifact state is incomplete.");
  }

  const featureByGeoid = useMemo(
    () => new Map(tracts.features.map((feature) => [feature.properties.geoid, feature])),
    [tracts],
  );
  const knownGeoids = useMemo(
    () => new Set(featureByGeoid.keys()),
    [featureByGeoid],
  );
  const selectedFeatures = useMemo(
    () => state.selectedGeoids.flatMap((geoid) => {
      const feature = featureByGeoid.get(geoid);
      return feature ? [feature] : [];
    }),
    [featureByGeoid, state.selectedGeoids],
  );
  const activeFeature = state.activeGeoid
    ? featureByGeoid.get(state.activeGeoid) ?? null
    : null;

  const neighborhoodFor = useMemo(() => {
    const adjacency = Object.fromEntries(
      tracts.features.map((feature) => [
        feature.properties.geoid,
        feature.properties.queenNeighborGeoids,
      ]),
    );
    return createNeighborhoodCache(tracts.artifactSetId, adjacency);
  }, [tracts]);
  const activeNeighborhood = useMemo<QueenNeighborhood | null>(
    () => state.activeGeoid
      ? neighborhoodFor(state.activeGeoid, state.neighborhood.radius)
      : null,
    [neighborhoodFor, state.activeGeoid, state.neighborhood.radius],
  );

  const scenarioIndex = useMemo(
    () => scenarios ? createScenarioIndex(scenarios.scenarios) : null,
    [scenarios],
  );
  const currentScenario = useMemo<Scenario | null>(
    () => scenarioIndex
      ? lookupScenario(scenarioIndex, {
          scalingMode: state.scenario.scalingMode,
          domainKey: state.scenario.domain,
          k: state.scenario.k,
          alphaIntensity: state.scenario.alpha,
        }) as Scenario | null
      : null,
    [scenarioIndex, state.scenario.alpha, state.scenario.domain, state.scenario.k, state.scenario.scalingMode],
  );
  const pinnedScenario = useMemo<Scenario | null>(
    () => state.scenario.pinnedScenarioId && scenarios
      ? scenarios.scenarios.find((item) => item.id === state.scenario.pinnedScenarioId) ?? null
      : null,
    [scenarios, state.scenario.pinnedScenarioId],
  );

  const scopeGeoids = useMemo(() => {
    const byScope: Record<WorkloadScope, readonly string[]> = {
      active_tract: state.activeGeoid ? [state.activeGeoid] : [],
      selected_tracts: state.selectedGeoids,
      active_neighborhood: activeNeighborhood?.includedGeoids ?? [],
      current_scenario: currentScenario?.selection.rankedSelectedGeoids ?? [],
      pinned_scenario: pinnedScenario?.selection.rankedSelectedGeoids ?? [],
    };
    return byScope[state.workload.scope];
  }, [activeNeighborhood, currentScenario, pinnedScenario, state.activeGeoid, state.selectedGeoids, state.workload.scope]);
  const exportedBaselineUncertainty = useMemo(
    () => workload
      ? resolveExportedBaselineUncertainty({
          workload,
          domainKey: state.activeDomain,
          scope: state.workload.scope,
          scopeGeoids,
          currentScenario,
          pinnedScenario,
        })
      : null,
    [
      currentScenario,
      pinnedScenario,
      scopeGeoids,
      state.activeDomain,
      state.workload.scope,
      workload,
    ],
  );

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const parsed = parseShareableState(new URLSearchParams(window.location.search));
    const knownGeoids = new Set(tracts.features.map((feature) => feature.properties.geoid));
    const selected = (parsed.selectedGeoids ?? []).filter((geoid) => knownGeoids.has(geoid));
    if (parsed.workspace) state.setWorkspace(parsed.workspace);
    if (parsed.activeDomain) state.setDomain(parsed.activeDomain);
    if (parsed.exploreDomain) state.setExploreDomain(parsed.exploreDomain);
    if (parsed.activeMapMetric) state.setMapMetric(parsed.activeMapMetric);
    state.selectTracts(selected, parsed.activeGeoid ?? null);
    if (parsed.neighborhood) {
      state.setNeighborhoodRadius(parsed.neighborhood.radius);
      state.setNeighborhoodMetric(parsed.neighborhood.metric);
      state.setNeighborhoodEnabled(parsed.neighborhood.enabled && selected.length > 0);
    }
    if (parsed.scenario) {
      state.setScenarioControls(parsed.scenario);
      state.setCurrentScenario(parsed.scenario.currentScenarioId);
      state.setPinnedScenario(parsed.scenario.pinnedScenarioId);
    }
    if (parsed.workload) {
      state.setDemandChange(parsed.workload.demandChangePct);
      state.setClosureShift(parsed.workload.closureCurveShiftPoints);
    }
    setUrlReady(true);
  // Zustand action identities are stable; this effect intentionally hydrates once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracts]);

  const shareable = serializeShareableState(state);
  useEffect(() => {
    if (!urlReady) return;
    const next = `${window.location.pathname}${shareable ? `?${shareable}` : ""}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [shareable, urlReady]);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY));
    const frame = window.requestAnimationFrame(() => {
      if (Number.isFinite(stored) && stored > 0) {
        setRailWidth(clampRailWidth(stored));
      }
    });
    const onResize = () => {
      setRailWidth((current) =>
        current === null ? null : clampRailWidth(current),
      );
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedCount > 0) {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[role='dialog']")) return;
        clearSelection();
        return;
      }

      if (event.code !== "Space" && event.key !== " ") return;
      if (state.workspace !== "explore" || !state.activeGeoid) return;
      if (state.methodologyOpen || dataNotesOpen) return;
      if (blocksSpatialShortcut(event.target)) return;
      if (document.querySelector(".analysis-rail details[open], [role='dialog']")) {
        return;
      }

      event.preventDefault();
      const enabled = !state.neighborhood.enabled;
      state.setNeighborhoodEnabled(enabled);
      setSpatialAnnouncement(
        enabled
          ? "Nearby tract comparison on."
          : "Nearby tract comparison off.",
      );
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    clearSelection,
    dataNotesOpen,
    selectedCount,
    state.activeGeoid,
    state.methodologyOpen,
    state.neighborhood.enabled,
    state.setNeighborhoodEnabled,
    state.workspace,
    state,
  ]);

  const resizeRailFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!railResizeActive.current) return;
      const next = clampRailWidth(window.innerWidth - event.clientX);
      setRailWidth(next);
    },
    [],
  );

  const finishRailResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!railResizeActive.current) return;
      railResizeActive.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const next = clampRailWidth(
        railRef.current?.getBoundingClientRect().width ?? railWidth ?? 430,
      );
      setRailWidth(next);
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(next));
    },
    [railWidth],
  );

  useEffect(() => {
    const scenarioNeeded = state.workspace === "workload" &&
      ["current_scenario", "pinned_scenario"].includes(state.workload.scope);
    if (scenarioNeeded && !scenarios && lazyStatus.scenarios === "idle") void loadScenarios();
  }, [lazyStatus.scenarios, loadScenarios, scenarios, state.workload.scope, state.workspace]);

  useEffect(() => {
    if (!currentScenario) return;
    if (state.scenario.currentScenarioId !== currentScenario.id) {
      setCurrentScenario(currentScenario.id);
    }
  }, [currentScenario, setCurrentScenario, state.scenario.currentScenarioId]);
  useEffect(() => {
    if (scenarios && state.scenario.pinnedScenarioId && !pinnedScenario) {
      setPinnedScenario(null);
    }
  }, [pinnedScenario, scenarios, setPinnedScenario, state.scenario.pinnedScenarioId]);

  const assistantSelected = useMemo(
    () => selectedFeatures.map((feature) => {
      const properties = feature.properties;
      const domain = getActiveDomainSummary(properties, state.activeDomain);
      const response = getRecordedResponsePresentation(
        properties,
        state.activeDomain,
      );
      const responseMetrics = response.metrics;
      const mapMetric = getMapMetricDatum(
        properties,
        state.activeDomain,
        state.activeMapMetric,
      );
      const detail = tractDetails?.tracts[properties.geoid] ?? null;
      return {
        geoid: properties.geoid,
        name: `Census Tract ${properties.tractName}, ${properties.borough}`,
        population: properties.population,
        medianHouseholdIncome: properties.medianHouseholdIncome,
        allocationEligible: properties.allocationEligible,
        allocationIneligibilityReason:
          properties.allocationIneligibilityReason,
        mappedComplaintCount: domain.count,
        complaintsPer1000: domain.ratePer1000,
        responseSampleStatus: domain.sampleStatus,
        activeDomainResponse: {
          sampleStatus: response.status,
          requestCount: response.requestCount,
          knownTimingOutcomes30d: response.knownTimingOutcomes30d,
          knownTimingOutcomes180d: response.knownTimingOutcomes180d,
          validRecordedClosures: response.validRecordedClosures,
          recordedClosureWithin30dPct:
            responseMetrics?.recordedClosureWithin30dPct ?? null,
          recordedClosureWithin180dPct:
            responseMetrics?.recordedClosureWithin180dPct ?? null,
          medianRecordedDaysToClose:
            responseMetrics?.medianRecordedDaysToClose ?? null,
          notRecordedClosedWithin30dCount:
            responseMetrics?.notRecordedClosedWithin30dCount ?? null,
          notRecordedClosedWithin180dCount:
            responseMetrics?.notRecordedClosedWithin180dCount ?? null,
          notRecordedClosedWithin30dPer1000:
            responseMetrics?.notRecordedClosedWithin30dPer1000 ?? null,
          notRecordedClosedWithin180dPer1000:
            responseMetrics?.notRecordedClosedWithin180dPer1000 ?? null,
          expectedCohortOpenAt30d:
            responseMetrics?.expectedCohortOpenAt30d ?? null,
          expectedCohortOpenAt180d:
            responseMetrics?.expectedCohortOpenAt180d ?? null,
        },
        activeMapMetric: {
          key: mapMetric.metric,
          value: mapMetric.value,
          available: mapMetric.available,
          unavailableReason: mapMetric.unavailableReason,
        },
        complaintDetails: detail
          ? {
              complaintTypes: detail
                .topComplaintTypesByDomain[state.activeDomain]
                .slice(0, 5),
              agencies: detail.topAgenciesByDomain[state.activeDomain]
                .slice(0, 3),
            }
          : null,
        active: properties.geoid === state.activeGeoid,
      };
    }),
    [
      selectedFeatures,
      state.activeDomain,
      state.activeGeoid,
      state.activeMapMetric,
      tractDetails,
    ],
  );
  const assistantNeighborhood = useMemo(() => {
    if (!state.neighborhood.enabled || !activeNeighborhood) return null;
    const values = Object.fromEntries(tracts.features.map((feature) => {
      const datum = getMapMetricDatum(feature.properties, state.activeDomain, state.neighborhood.metric);
      return [feature.properties.geoid, typeof datum.value === "number" ? datum.value : null];
    }));
    return {
      radius: activeNeighborhood.radius,
      includedTractCount: activeNeighborhood.includedGeoids.length,
      isIsland: activeNeighborhood.isIsland,
      metric: state.neighborhood.metric,
      summary: summarizeNeighborhoodMetric(activeNeighborhood.centerGeoid, activeNeighborhood.includedGeoids, values),
    };
  }, [activeNeighborhood, state.activeDomain, state.neighborhood.enabled, state.neighborhood.metric, tracts.features]);
  const assistantWorkload = useMemo(() => {
    if (!workload || scopeGeoids.length === 0) return null;
    try {
      const config = workloadConfig(workload);
      const result = aggregateWorkloadScope(workload.tracts, scopeGeoids, state.activeDomain, config);
      if (result.kind === "empty_scope") return null;
      const evaluation = evaluateWorkload(result, config, {
        demandChangePct: state.workload.tab === "scenario" ? state.workload.demandChangePct : 0,
        closureCurveShiftPoints: state.workload.tab === "scenario" ? state.workload.closureCurveShiftPoints : 0,
      });
      return {
        view: state.workload.tab,
        scope: state.workload.scope,
        tractCount: result.tractCount,
        requestCount: result.requestCount,
        knownTiming: result.knownTiming,
        sampleStatus: result.sampleStatus,
        periodArrivals: evaluation.periodArrivals,
        meanCompletePeriodArrivals: evaluation.meanFullPeriodArrivals,
        assumptions: evaluation.assumptions,
        expectedOpenAtAge30: evaluation.cohortOpenAt30Days,
        expectedOpenAtAge180: evaluation.cohortOpenAt180Days,
        replay: evaluation.replay?.map((period) => ({
          periodIndex: period.periodIndex,
          newRequests: period.newRequests,
          expectedRecordedClosures: period.expectedRecordedClosures,
          expectedOpenBalance: period.expectedOpenBalance,
          netOpenChange: period.netOpenChange,
        })) ?? null,
      };
    } catch {
      return null;
    }
  }, [scopeGeoids, state.activeDomain, state.workload.closureCurveShiftPoints, state.workload.demandChangePct, state.workload.scope, state.workload.tab, workload]);

  const assistantContext = useMemo<AssistantPanelProps["context"]>(() => ({
    workspace: state.workspace,
    activeDomain: state.activeDomain,
    activeMapMetric: state.activeMapMetric,
    selectedTracts: assistantSelected,
    activeNeighborhood: assistantNeighborhood,
    currentScenario: scenarioContext(currentScenario, state.selectedGeoids),
    pinnedScenario: scenarioContext(pinnedScenario, state.selectedGeoids),
    workload: assistantWorkload,
  }), [assistantNeighborhood, assistantSelected, assistantWorkload, currentScenario, pinnedScenario, state.activeDomain, state.activeMapMetric, state.selectedGeoids, state.workspace]);

  const mapDomain = state.workspace === "scenario"
    ? state.scenario.domain
    : state.workspace === "explore"
      ? state.exploreDomain
      : state.activeDomain;
  const neighborhoodReferenceAvailable = useMemo(() => {
    if (!state.activeGeoid) return false;
    const activeFeature = featureByGeoid.get(state.activeGeoid);
    if (!activeFeature) return false;
    return typeof getMapMetricDatum(
      activeFeature.properties,
      state.exploreDomain,
      state.neighborhood.metric,
    ).value === "number";
  }, [
    featureByGeoid,
    state.exploreDomain,
    state.activeGeoid,
    state.neighborhood.metric,
  ]);
  const mapNeighborhood = useMemo(
    () => state.workspace === "explore" &&
      state.neighborhood.enabled &&
      activeNeighborhood &&
      neighborhoodReferenceAvailable
      ? {
          includedGeoids: new Set(activeNeighborhood.includedGeoids),
          metric: state.neighborhood.metric,
        }
      : null,
    [
      activeNeighborhood,
      neighborhoodReferenceAvailable,
      state.neighborhood.enabled,
      state.neighborhood.metric,
      state.workspace,
    ],
  );
  const mapScenario = useMemo(
    () => state.workspace === "scenario" && currentScenario
      ? {
          currentGeoids: new Set(currentScenario.selection.rankedSelectedGeoids),
          pinnedGeoids: pinnedScenario
            ? new Set(pinnedScenario.selection.rankedSelectedGeoids)
            : null,
        }
      : null,
    [currentScenario, pinnedScenario, state.workspace],
  );

  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNotice("Share link copied.");
    } catch {
      setShareNotice("The analytical state is encoded in the address bar.");
    }
    window.setTimeout(() => setShareNotice(null), 2400);
  }, []);

  const openMethodology = useCallback((topic: MethodologyTopic) => {
    setDataNotesOpen(false);
    setMethodologyTopic(topic);
    state.setMethodologyOpen(true);
  }, [state]);

  const openWorkspace = useCallback((workspace: Workspace) => {
    state.setWorkspace(workspace);
    setDataNotesOpen(false);
    if (window.matchMedia("(max-width: 940px)").matches) {
      state.setAssistantOpen(false);
    }
  }, [state]);

  return (
    <div className="atlas-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">NYC 311 Priority Atlas</span>
          <span className="brand-kicker">2016 historical record</span>
        </div>
        <nav
          className="workspace-tabs desktop-workspace-tabs"
          aria-label="Workspace"
          role="tablist"
        >
          {WORKSPACES.map((item) => (
            <button
              key={item.key}
              className="workspace-tab"
              type="button"
              role="tab"
              aria-selected={state.workspace === item.key}
              onClick={() => openWorkspace(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <DataNotes
            open={dataNotesOpen}
            workspace={state.workspace}
            activeFeature={activeFeature}
            activeDomain={state.exploreDomain}
            activeMapMetric={state.activeMapMetric}
            activeNeighborhood={activeNeighborhood}
            onOpenChange={setDataNotesOpen}
            onOpenMethodology={(topic: DataNotesMethodologyTopic) =>
              openMethodology(topic)
            }
          />
          <button
            className="button"
            type="button"
            aria-label="Methodology"
            onClick={() => openMethodology("overview")}
          >
            <span className="methodology-label">Methodology</span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Copy a link to this view"
            title="Copy a link to this view"
            onClick={copyShareLink}
          >
            <svg className="share-icon" aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="18" cy="5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="m8.3 10.9 7.4-4.5M8.3 13.1l7.4 4.5" />
            </svg>
          </button>
        </div>
      </header>

      <main
        className={`atlas-main${state.selectedGeoids.length > 1 ? " comparison-open" : ""}${state.workspace === "explore" && selectedCount === 0 ? " explore-empty" : ""}`}
        style={railWidth === null
          ? undefined
          : ({ "--rail-width": `${railWidth}px` } as CSSProperties)}
      >
        <div className="map-stage">
          <AtlasMap
            className="map-canvas"
            tracts={tracts}
            domain={mapDomain}
            metric={state.activeMapMetric}
            selectedGeoids={state.selectedGeoids}
            activeGeoid={state.activeGeoid}
            neighborhood={mapNeighborhood}
            scenario={mapScenario}
            onTractClick={state.toggleTract}
            onEmptyClick={state.clearSelection}
            onClearSelection={state.clearSelection}
            onMapError={(error) => setMapError(error.message)}
            showSearch={false}
          >
            {state.workspace === "explore" ? (
              <MapControls
                domain={state.exploreDomain}
                metric={state.activeMapMetric}
                features={tracts.features}
                onDomainChange={state.setDomain}
                onExploreDomainChange={state.setExploreDomain}
                onMetricChange={state.setMapMetric}
                onSelectTract={state.toggleTract}
              />
            ) : null}
          </AtlasMap>
          {mapError ? <div className="map-status toast" role="status">{mapError}</div> : null}
          {state.selectionNotice ? (
            <div className="map-status toast" role="status">
              {state.selectionNotice}{" "}
              <button className="text-button" type="button" onClick={state.clearSelectionNotice}>Dismiss</button>
            </div>
          ) : null}
          {shareNotice ? <div className="map-status toast" role="status">{shareNotice}</div> : null}
        </div>

        <div
          className="rail-resize-handle"
          role="separator"
          aria-label="Resize analysis panel"
          aria-orientation="vertical"
          aria-valuemin={MIN_RAIL_WIDTH}
          aria-valuemax={MAX_RAIL_WIDTH}
          aria-valuenow={Math.round(railWidth ?? 430)}
          tabIndex={0}
          onPointerDown={(event) => {
            if (window.matchMedia("(max-width: 940px)").matches) return;
            railResizeActive.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            const current = railRef.current?.getBoundingClientRect().width;
            if (current) setRailWidth(clampRailWidth(current));
          }}
          onPointerMove={resizeRailFromPointer}
          onPointerUp={finishRailResize}
          onPointerCancel={finishRailResize}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
              return;
            }
            event.preventDefault();
            const current =
              railRef.current?.getBoundingClientRect().width ?? railWidth ?? 430;
            const direction = event.key === "ArrowLeft" ? 1 : -1;
            const next = clampRailWidth(current + direction * 16);
            setRailWidth(next);
            window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(next));
          }}
        >
          <span aria-hidden="true" />
        </div>

        <aside
          ref={railRef}
          id="analysis-panel"
          className={`analysis-rail${state.assistant.open ? " assistant-open" : ""}`}
          aria-label="Analysis panel"
        >
          <div className="rail-scroll">
            {state.workspace === "explore" ? (
              <>
                <header className="rail-header">
                  <div className="eyebrow">Explore</div>
                  <h2 className="rail-title">Explore the historical record</h2>
                  <p className="helper-text">
                    {WORKSPACES[0].subtitle}
                  </p>
                  {selectedFeatures.length > 0 ? (
                    <SelectedChips
                      features={tracts.features}
                      selectedGeoids={state.selectedGeoids}
                      activeGeoid={state.activeGeoid}
                      onActivate={state.activateTract}
                      onRemove={state.toggleTract}
                    />
                  ) : null}
                </header>
                {selectedFeatures.length === 0 ? (
                  <section className="panel-section">
                    <div className="empty-state explore-empty-state">
                      <h3 className="section-title">Choose a tract to begin</h3>
                      <p className="helper-text">
                        Click the map or search by tract number. You can compare up
                        to five tracts.
                      </p>
                    </div>
                  </section>
                ) : (
                  <TractComparison
                    features={tracts.features}
                    selectedGeoids={state.selectedGeoids}
                    activeGeoid={state.activeGeoid}
                    domain={state.exploreDomain}
                    tractDetails={tractDetails}
                    loading={lazyStatus.tractDetails === "loading"}
                    detailError={lazyErrors.tractDetails ?? null}
                    onLoad={loadTractDetails}
                    onActivate={state.activateTract}
                    onRemove={state.toggleTract}
                    onReadPopulationMethod={() =>
                      openMethodology("map_metrics")
                    }
                  />
                )}
                {state.activeGeoid ? (
                  <NeighborhoodPanel
                    enabled={state.neighborhood.enabled}
                    neighborhood={activeNeighborhood}
                    features={tracts.features}
                    domain={state.exploreDomain}
                    metric={state.neighborhood.metric}
                    onEnabledChange={state.setNeighborhoodEnabled}
                    onRadiusChange={state.setNeighborhoodRadius}
                    onMetricChange={state.setNeighborhoodMetric}
                    onReadPopulationMethod={() =>
                      openMethodology("map_metrics")
                    }
                  />
                ) : null}
              </>
            ) : state.workspace === "scenario" ? (
              <>
                {state.exploreDomain === "collective" ? (
                  <p className="domain-boundary-note" role="note">
                    Collective is not part of the 550 validated priority
                    scenarios. Showing {DOMAIN_CONFIG[state.scenario.domain].label};
                    choose any of the five service domains below.
                  </p>
                ) : null}
                <ScenarioLab
                scenarios={scenarios}
                tradeoff={artifacts.tradeoff}
                tracts={tracts}
                loadStatus={lazyStatus.scenarios}
                loadError={lazyErrors.scenarios}
                scalingMode={state.scenario.scalingMode}
                domain={state.scenario.domain}
                k={state.scenario.k}
                alpha={state.scenario.alpha}
                currentScenarioId={state.scenario.currentScenarioId}
                pinnedScenarioId={state.scenario.pinnedScenarioId}
                initialExplanationGeoid={
                  state.activeGeoid ?? state.selectedGeoids.at(-1) ?? null
                }
                onLoad={loadScenarios}
                onControlsChange={state.setScenarioControls}
                onCurrentScenarioChange={state.setCurrentScenario}
                onPinnedScenarioChange={state.setPinnedScenario}
                onReadMethod={() => openMethodology("prioritization")}
                />
              </>
            ) : (
              <>
                {state.exploreDomain === "collective" ? (
                  <p className="domain-boundary-note" role="note">
                    Collective has no validated cross-domain workload or closure
                    curve. Showing {DOMAIN_CONFIG[state.activeDomain].label};
                    choose any of the five service domains below.
                  </p>
                ) : null}
                <WorkloadPanel
                workload={workload}
                loading={lazyStatus.workload === "loading"}
                error={lazyErrors.workload}
                onLoad={loadWorkload}
                domain={state.activeDomain}
                onDomainChange={state.setDomain}
                scope={state.workload.scope}
                scopeGeoids={scopeGeoids}
                tab={state.workload.tab}
                requestAgeDays={state.workload.requestAgeDays}
                demandChangePct={state.workload.demandChangePct}
                closureCurveShiftPoints={state.workload.closureCurveShiftPoints}
                exportedBaselineUncertainty={exportedBaselineUncertainty}
                onTabChange={state.setWorkloadTab}
                onScopeChange={state.setWorkloadScope}
                onRequestAgeChange={state.setRequestAge}
                onDemandChange={state.setDemandChange}
                onClosureShift={state.setClosureShift}
                onReadMethod={() => openMethodology("modeling")}
                />
              </>
            )}
          </div>
          <AssistantPanel
            key={
              state.workspace === "explore" && state.exploreDomain === "collective"
                ? "collective-disabled"
                : "domain-specific"
            }
            context={assistantContext}
            knownGeoids={knownGeoids}
            disabledReason={
              state.workspace === "explore" && state.exploreDomain === "collective"
                ? "Collective interpretation is unavailable because Claude's grounded contract is domain-specific. Choose one of the five service domains to interpret tract or nearby-tract results. All manual Collective controls remain active."
                : null
            }
          />
        </aside>
      </main>

      <nav
        className="workspace-tabs mobile-workspace-tabs"
        aria-label="Mobile workspace"
        role="tablist"
      >
        {WORKSPACES.map((item) => (
          <button
            key={item.key}
            className="workspace-tab"
            type="button"
            role="tab"
            aria-controls="analysis-panel"
            aria-selected={!state.assistant.open && state.workspace === item.key}
            onClick={() => openWorkspace(item.key)}
          >
            {item.label}
          </button>
        ))}
        <button
          className="workspace-tab assistant-workspace-tab"
          type="button"
          role="tab"
          aria-controls="analysis-panel"
          aria-selected={state.assistant.open}
          onClick={() => state.setAssistantOpen(true)}
        >
          <span>Interpretation</span>
          <small>with Claude</small>
        </button>
      </nav>

      <MethodologyModal
        open={state.methodologyOpen}
        onClose={() => state.setMethodologyOpen(false)}
        initialTopic={methodologyTopic}
        onTopicChange={(topic: MethodologyTopic) =>
          setMethodologyTopic(topic)
        }
        manifest={manifest}
        metadata={metadata}
        context={context}
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {spatialAnnouncement}
      </p>
    </div>
  );
}

export function AtlasShell() {
  return <ArtifactProvider><StartupGate /></ArtifactProvider>;
}
