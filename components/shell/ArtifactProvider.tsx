"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearArtifactCache,
  loadPublicArtifact,
  loadStartupArtifacts,
} from "@/lib/artifacts/client";
import {
  ArtifactContractError,
  validateScenarioArtifactsCrossArtifact,
  validateTractDetailsCrossArtifact,
  validateWorkloadCrossArtifact,
} from "@/lib/artifacts/contract";
import type {
  Context,
  Manifest,
  Metadata,
  Scenarios,
  TractDetails,
  TractsGeoJson,
  Tradeoff,
  Workload,
} from "@/lib/artifacts/schemas";

type LazyKey = "tractDetails" | "scenarios" | "workload";

interface ArtifactContextValue {
  startupStatus: "loading" | "ready" | "error";
  startupError: Error | null;
  manifest: Manifest | null;
  metadata: Metadata | null;
  context: Context | null;
  tracts: TractsGeoJson | null;
  tractDetails: TractDetails | null;
  scenarios: Scenarios | null;
  tradeoff: Tradeoff | null;
  workload: Workload | null;
  lazyStatus: Record<LazyKey, "idle" | "loading" | "ready" | "error">;
  lazyErrors: Partial<Record<LazyKey, Error>>;
  loadTractDetails: () => Promise<TractDetails | null>;
  loadScenarios: () => Promise<
    { scenarios: Scenarios; tradeoff: Tradeoff } | null
  >;
  loadWorkload: () => Promise<Workload | null>;
  retryStartup: () => void;
}

const ArtifactContext = createContext<ArtifactContextValue | null>(null);

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Artifact loading failed.");
}

function withoutLazyError(
  errors: Partial<Record<LazyKey, Error>>,
  key: LazyKey,
) {
  const next = { ...errors };
  delete next[key];
  return next;
}

export function ArtifactProvider({ children }: { children: React.ReactNode }) {
  const [reloadToken, setReloadToken] = useState(0);
  const [startupStatus, setStartupStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [startupError, setStartupError] = useState<Error | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [tracts, setTracts] = useState<TractsGeoJson | null>(null);
  const [tractDetails, setTractDetails] = useState<TractDetails | null>(null);
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const [tradeoff, setTradeoff] = useState<Tradeoff | null>(null);
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [lazyStatus, setLazyStatus] = useState<
    Record<LazyKey, "idle" | "loading" | "ready" | "error">
  >({ tractDetails: "idle", scenarios: "idle", workload: "idle" });
  const [lazyErrors, setLazyErrors] = useState<
    Partial<Record<LazyKey, Error>>
  >({});

  useEffect(() => {
    let cancelled = false;
    loadStartupArtifacts()
      .then((startup) => {
        if (cancelled) return;
        setManifest(startup.manifest);
        setMetadata(startup.metadata);
        setContext(startup.context);
        setTracts(startup.tracts);
        setStartupStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStartupError(asError(error));
        setStartupStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const failLazy = useCallback((key: LazyKey, error: unknown) => {
    const normalized = asError(error);
    setLazyStatus((state) => ({ ...state, [key]: "error" }));
    setLazyErrors((state) => ({ ...state, [key]: normalized }));
    if (normalized instanceof ArtifactContractError) {
      setStartupError(normalized);
      setStartupStatus("error");
    }
  }, []);

  const loadTractDetails = useCallback(async () => {
    if (tractDetails) return tractDetails;
    setLazyErrors((state) => withoutLazyError(state, "tractDetails"));
    setLazyStatus((state) => ({ ...state, tractDetails: "loading" }));
    try {
      const value = await loadPublicArtifact("tract_details.json");
      if (!tracts) throw new Error("Tract geometry is unavailable for detail validation.");
      const validated = validateTractDetailsCrossArtifact(tracts, value);
      setTractDetails(validated);
      setLazyStatus((state) => ({ ...state, tractDetails: "ready" }));
      return validated;
    } catch (error) {
      failLazy("tractDetails", error);
      return null;
    }
  }, [failLazy, tractDetails, tracts]);

  const loadScenarios = useCallback(async () => {
    if (scenarios && tradeoff) return { scenarios, tradeoff };
    setLazyErrors((state) => withoutLazyError(state, "scenarios"));
    setLazyStatus((state) => ({ ...state, scenarios: "loading" }));
    try {
      const [scenarioValue, tradeoffValue] = await Promise.all([
        loadPublicArtifact("scenarios.json"),
        loadPublicArtifact("tradeoff.json"),
      ]);
      if (!tracts) throw new Error("Tract geometry is unavailable for scenario validation.");
      const validated = validateScenarioArtifactsCrossArtifact(
        tracts,
        scenarioValue,
        tradeoffValue,
      );
      setScenarios(validated.scenarios);
      setTradeoff(validated.tradeoff);
      setLazyStatus((state) => ({ ...state, scenarios: "ready" }));
      return validated;
    } catch (error) {
      failLazy("scenarios", error);
      return null;
    }
  }, [failLazy, scenarios, tradeoff, tracts]);

  const loadWorkload = useCallback(async () => {
    if (workload) return workload;
    setLazyErrors((state) => withoutLazyError(state, "workload"));
    setLazyStatus((state) => ({ ...state, workload: "loading" }));
    try {
      const value = await loadPublicArtifact("workload.json");
      if (!tracts) throw new Error("Tract geometry is unavailable for workload validation.");
      const validated = validateWorkloadCrossArtifact(tracts, value);
      setWorkload(validated);
      setLazyStatus((state) => ({ ...state, workload: "ready" }));
      return validated;
    } catch (error) {
      failLazy("workload", error);
      return null;
    }
  }, [failLazy, tracts, workload]);

  const retryStartup = useCallback(() => {
    clearArtifactCache();
    setStartupStatus("loading");
    setStartupError(null);
    setManifest(null);
    setMetadata(null);
    setContext(null);
    setTracts(null);
    setTractDetails(null);
    setScenarios(null);
    setTradeoff(null);
    setWorkload(null);
    setLazyStatus({ tractDetails: "idle", scenarios: "idle", workload: "idle" });
    setLazyErrors({});
    setReloadToken((value) => value + 1);
  }, []);

  const value = useMemo<ArtifactContextValue>(
    () => ({
      startupStatus,
      startupError,
      manifest,
      metadata,
      context,
      tracts,
      tractDetails,
      scenarios,
      tradeoff,
      workload,
      lazyStatus,
      lazyErrors,
      loadTractDetails,
      loadScenarios,
      loadWorkload,
      retryStartup,
    }),
    [
      context,
      lazyErrors,
      lazyStatus,
      loadScenarios,
      loadTractDetails,
      loadWorkload,
      manifest,
      metadata,
      scenarios,
      startupError,
      startupStatus,
      tractDetails,
      tracts,
      tradeoff,
      workload,
      retryStartup,
    ],
  );

  return (
    <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>
  );
}

export function useArtifacts(): ArtifactContextValue {
  const value = useContext(ArtifactContext);
  if (!value) throw new Error("useArtifacts must be used inside ArtifactProvider.");
  return value;
}
