"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AssistantPanel, type AssistantPanelProps } from "@/components/assistant/AssistantPanel";
import { MapControls } from "@/components/explore/MapControls";
import { SelectedChips } from "@/components/explore/SelectedChips";
import {
  TractComparison,
  type TractNeighborhoodContext,
} from "@/components/explore/TractComparison";
import { getRecordedResponsePresentation } from "@/components/explore/tractPresentation";
import { AtlasMap } from "@/components/map";
import { MethodologyModal } from "@/components/methodology/MethodologyModal";
import { NeighborhoodPanel } from "@/components/neighborhood/NeighborhoodPanel";
import { ScenarioLab } from "@/components/scenario";
import { WorkloadPanel } from "@/components/workload/WorkloadPanel";
import type { Scenario, Workload } from "@/lib/artifacts";
import { DOMAIN_CONFIG, type WorkloadScope, type Workspace } from "@/lib/domain";
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

const WORKSPACES: readonly { key: Workspace; label: string }[] = [
  { key: "explore", label: "Explore" },
  { key: "scenario", label: "Scenario Lab" },
  { key: "workload", label: "Workload" },
];

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedCount > 0) {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[role='dialog']")) return;
        clearSelection();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, selectedCount]);

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
  const comparisonNeighborhood = useMemo<TractNeighborhoodContext | null>(() => {
    if (!state.neighborhood.enabled || !activeNeighborhood) return null;
    const values = Object.fromEntries(tracts.features.map((feature) => {
      const datum = getMapMetricDatum(
        feature.properties,
        state.activeDomain,
        state.neighborhood.metric,
      );
      return [
        feature.properties.geoid,
        typeof datum.value === "number" ? datum.value : null,
      ];
    }));
    return {
      geoid: activeNeighborhood.centerGeoid,
      metric: state.neighborhood.metric,
      radius: activeNeighborhood.radius,
      isIsland: activeNeighborhood.isIsland,
      summary: summarizeNeighborhoodMetric(
        activeNeighborhood.centerGeoid,
        activeNeighborhood.includedGeoids,
        values,
      ),
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

  const mapDomain = state.workspace === "scenario" ? state.scenario.domain : state.activeDomain;
  const neighborhoodReferenceAvailable = useMemo(() => {
    if (!state.activeGeoid) return false;
    const activeFeature = featureByGeoid.get(state.activeGeoid);
    if (!activeFeature) return false;
    return typeof getMapMetricDatum(
      activeFeature.properties,
      state.activeDomain,
      state.neighborhood.metric,
    ).value === "number";
  }, [
    featureByGeoid,
    state.activeDomain,
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

  const openWorkspace = useCallback((workspace: Workspace) => {
    state.setWorkspace(workspace);
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
          <button className="button" type="button" onClick={copyShareLink}>Share</button>
          <button
            className="button"
            type="button"
            aria-label="Open methodology"
            onClick={() => state.setMethodologyOpen(true)}
          >
            <span className="methodology-label">Methodology</span>
            <span className="methodology-label-compact" aria-hidden="true">Methods</span>
          </button>
        </div>
      </header>

      <main className={`atlas-main${state.selectedGeoids.length > 1 ? " comparison-open" : ""}`}>
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
                domain={state.activeDomain}
                metric={state.activeMapMetric}
                features={tracts.features}
                onDomainChange={state.setDomain}
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

        <aside
          id="analysis-panel"
          className={`analysis-rail${state.assistant.open ? " assistant-open" : ""}`}
          aria-label="Analysis panel"
        >
          <div className="rail-scroll">
            {state.workspace === "explore" ? (
              <>
                <header className="rail-header">
                  <div className="eyebrow">Explore workspace</div>
                  <h2 className="rail-title">{DOMAIN_CONFIG[state.activeDomain].label}</h2>
                  <p className="helper-text">Select up to five census tracts to inspect and compare the historical record.</p>
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
                  <section className="panel-section"><div className="empty-state"><h3 className="section-title">Begin with the map</h3><p className="helper-text">Click a tract or use keyboard tract selection. Complaint activity remains useful before recorded-response evidence is available.</p></div></section>
                ) : (
                  <TractComparison
                    features={tracts.features}
                    selectedGeoids={state.selectedGeoids}
                    activeGeoid={state.activeGeoid}
                    domain={state.activeDomain}
                    tractDetails={tractDetails}
                    loading={lazyStatus.tractDetails === "loading"}
                    detailError={lazyErrors.tractDetails ?? null}
                    onLoad={loadTractDetails}
                    workload={workload}
                    workloadLoading={lazyStatus.workload === "loading"}
                    workloadError={lazyErrors.workload ?? null}
                    onLoadWorkload={loadWorkload}
                    onActivate={state.activateTract}
                    onRemove={state.toggleTract}
                    neighborhoodSummary={comparisonNeighborhood}
                  />
                )}
                {state.activeGeoid ? (
                  <NeighborhoodPanel
                    enabled={state.neighborhood.enabled}
                    neighborhood={activeNeighborhood}
                    features={tracts.features}
                    domain={state.activeDomain}
                    metric={state.neighborhood.metric}
                    onEnabledChange={state.setNeighborhoodEnabled}
                    onRadiusChange={state.setNeighborhoodRadius}
                    onMetricChange={state.setNeighborhoodMetric}
                  />
                ) : null}
              </>
            ) : state.workspace === "scenario" ? (
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
                onLoad={loadScenarios}
                onControlsChange={state.setScenarioControls}
                onCurrentScenarioChange={state.setCurrentScenario}
                onPinnedScenarioChange={state.setPinnedScenario}
              />
            ) : (
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
              />
            )}
          </div>
          <AssistantPanel context={assistantContext} knownGeoids={knownGeoids} />
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
          className="workspace-tab"
          type="button"
          role="tab"
          aria-controls="analysis-panel"
          aria-selected={state.assistant.open}
          onClick={() => state.setAssistantOpen(true)}
        >
          Claude
        </button>
      </nav>

      <MethodologyModal
        open={state.methodologyOpen}
        onClose={() => state.setMethodologyOpen(false)}
        manifest={manifest}
        metadata={metadata}
        context={context}
      />
    </div>
  );
}

export function AtlasShell() {
  return <ArtifactProvider><StartupGate /></ArtifactProvider>;
}
