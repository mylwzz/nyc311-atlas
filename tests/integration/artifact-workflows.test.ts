import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, test } from "vitest";

import {
  ARTIFACT_RELATIVE_PATHS,
  parseArtifact,
  parseManifest,
  validateCompleteArtifactSet,
  type CompleteArtifactSet,
  type Workload,
} from "@/lib/artifacts";
import { isActionSafeForKnownGeoids } from "@/lib/assistant/guardrails";
import {
  compareScenarioMembership,
  createScenarioIndex,
  lookupScenario,
} from "@/lib/scenario";
import { queenNeighborhood } from "@/lib/spatial";
import { resetAtlasStore, useAtlasStore } from "@/lib/state/store";
import { aggregateWorkloadScope, type WorkloadModelConfig } from "@/lib/workload";

import { REPRESENTATIVE_TRACTS } from "../fixtures/representative-tracts";

const root = process.cwd();

function json(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as unknown;
}

const manifest = parseManifest(json("manifest.json"));
const completeArtifacts: CompleteArtifactSet = validateCompleteArtifactSet({
  manifest,
  metadata: parseArtifact("metadata.json", json("public/data/metadata.json")),
  context: parseArtifact("context.json", json("public/data/context.json")),
  tracts: parseArtifact("tracts.geojson", json("public/data/tracts.geojson")),
  tractDetails: parseArtifact(
    "tract_details.json",
    json("public/data/tract_details.json"),
  ),
  scenarios: parseArtifact("scenarios.json", json("public/data/scenarios.json")),
  tradeoff: parseArtifact("tradeoff.json", json("public/data/tradeoff.json")),
  workload: parseArtifact("workload.json", json("public/data/workload.json")),
  knowledgeBase: parseArtifact(
    "knowledge_base.json",
    json("server/data/knowledge_base.json"),
  ),
  evidence: parseArtifact("evidence.json", json("server/data/evidence.json")),
});

const tractByGeoid = new Map(
  completeArtifacts.tracts.features.map((feature) => [
    feature.properties.geoid,
    feature,
  ]),
);
const adjacency = Object.fromEntries(
  completeArtifacts.tracts.features.map(({ properties }) => [
    properties.geoid,
    properties.queenNeighborGeoids,
  ]),
);

function workloadConfig(workload: Workload): WorkloadModelConfig {
  return {
    periods: workload.periods,
    fullPeriodIndices: workload.fullPeriodIndices,
    ageCheckpointsDays: workload.ageCheckpointsDays,
    minimumKnownTimingSample: workload.uncertainty.minimumKnownTimingSample,
    periodDays: 30,
    replayRunoffPeriods: 6,
  };
}

beforeEach(() => resetAtlasStore());

describe("actual artifact workflow integration", () => {
  test("the complete source-of-truth set validates with declared bytes and digests", () => {
    expect(completeArtifacts.tracts.features).toHaveLength(2_167);
    expect(completeArtifacts.scenarios.scenarios).toHaveLength(550);
    expect(Object.keys(completeArtifacts.workload.tracts)).toHaveLength(2_167);

    for (const entry of manifest.files) {
      const bytes = readFileSync(resolve(root, ARTIFACT_RELATIVE_PATHS[entry.file]));
      expect(bytes.byteLength, entry.file).toBe(entry.byteSize);
      expect(createHash("sha256").update(bytes).digest("hex"), entry.file).toBe(
        entry.sha256,
      );
    }
  });

  test("map, detail, and workload artifacts coordinate representative tract states", () => {
    const representatives = [
      REPRESENTATIVE_TRACTS.high,
      REPRESENTATIVE_TRACTS.low,
      REPRESENTATIVE_TRACTS.ineligible,
      REPRESENTATIVE_TRACTS.island,
      REPRESENTATIVE_TRACTS.zeroRequest,
      REPRESENTATIVE_TRACTS.sparse,
      REPRESENTATIVE_TRACTS.sufficient,
    ];

    for (const representative of representatives) {
      const { geoid, housingBuildingResponseSampleStatus } =
        representative.properties;
      expect(tractByGeoid.has(geoid), geoid).toBe(true);
      expect(completeArtifacts.tractDetails.tracts[geoid], geoid).toBeDefined();
      expect(
        completeArtifacts.workload.tracts[geoid].housing_building.sampleStatus,
        geoid,
      ).toBe(housingBuildingResponseSampleStatus);
    }

    expect(
      REPRESENTATIVE_TRACTS.high.properties
        .housingBuildingComplaintRatePer1000,
    ).toBeGreaterThan(
      REPRESENTATIVE_TRACTS.low.properties
        .housingBuildingComplaintRatePer1000 ?? Number.POSITIVE_INFINITY,
    );
    expect(REPRESENTATIVE_TRACTS.ineligible.properties.allocationEligible).toBe(
      false,
    );
    expect(REPRESENTATIVE_TRACTS.island.properties.queenNeighborGeoids).toEqual(
      [],
    );
  });

  test("selection and Queen context preserve active map-detail coordination", () => {
    const store = useAtlasStore.getState();
    const high = REPRESENTATIVE_TRACTS.high.properties.geoid;
    const sparse = REPRESENTATIVE_TRACTS.sparse.properties.geoid;

    store.toggleTract(high);
    store.toggleTract(sparse);
    expect(useAtlasStore.getState().selectedGeoids).toEqual([high, sparse]);
    expect(useAtlasStore.getState().activeGeoid).toBe(sparse);
    expect(completeArtifacts.tractDetails.tracts[sparse]).toBeDefined();

    const radiusFive = queenNeighborhood(adjacency, sparse, 5);
    expect(radiusFive.centerGeoid).toBe(sparse);
    expect(radiusFive.includedGeoids).toContain(sparse);
    expect(radiusFive.includedGeoids.length).toBeGreaterThan(1);

    const island = queenNeighborhood(
      adjacency,
      REPRESENTATIVE_TRACTS.island.properties.geoid,
      5,
    );
    expect(island.isIsland).toBe(true);
    expect(island.includedGeoids).toEqual([
      REPRESENTATIVE_TRACTS.island.properties.geoid,
    ]);
  });

  test("scenario overlay and pinned comparison use exact artifact membership", () => {
    const index = createScenarioIndex(completeArtifacts.scenarios.scenarios);
    const current = lookupScenario(index, {
      scalingMode: "rank_balanced",
      domainKey: "housing_building",
      k: 100,
      alphaIntensity: 0.5,
    });
    const pinned = lookupScenario(index, {
      scalingMode: "rank_balanced",
      domainKey: "housing_building",
      k: 100,
      alphaIntensity: 0,
    });
    expect(current).not.toBeNull();
    expect(pinned).not.toBeNull();
    if (!current || !pinned) throw new Error("Expected actual scenarios.");

    const comparison = compareScenarioMembership(current, pinned);
    expect(current.selection.rankedSelectedGeoids).toHaveLength(100);
    expect(
      comparison.enteredGeoids.length + comparison.sharedGeoids.length,
    ).toBe(100);
    expect(
      comparison.exitedGeoids.length + comparison.sharedGeoids.length,
    ).toBe(100);
    expect(
      current.selection.rankedSelectedGeoids.every(
        (geoid) => tractByGeoid.get(geoid)?.properties.allocationEligible,
      ),
    ).toBe(true);
  });

  test("sparse singles suppress replay while an explicit pooled group earns it", () => {
    const workload = completeArtifacts.workload;
    const config = workloadConfig(workload);
    const sparseGeoid = REPRESENTATIVE_TRACTS.sparse.properties.geoid;
    const sparse = aggregateWorkloadScope(
      workload.tracts,
      [sparseGeoid],
      "housing_building",
      config,
    );
    expect(sparse.kind).toBe("aggregate");
    if (sparse.kind !== "aggregate") throw new Error("Expected sparse scope.");
    expect(sparse.sampleStatus).toBe("insufficient_sample");
    expect(sparse.supportsReplay).toBe(false);

    const pooledGeoids = REPRESENTATIVE_TRACTS.pooledSparse.map(
      ({ properties }) => properties.geoid,
    );
    const pooled = aggregateWorkloadScope(
      workload.tracts,
      pooledGeoids,
      "housing_building",
      config,
    );
    expect(pooled.kind).toBe("aggregate");
    if (pooled.kind !== "aggregate") throw new Error("Expected pooled scope.");
    expect(pooled.knownTiming).toBeGreaterThanOrEqual(30);
    expect(pooled.sampleStatus).toBe("sufficient");
    expect(pooled.supportsReplay).toBe(true);
    expect(pooled.periodArrivals.reduce((sum, value) => sum + value, 0)).toBe(
      pooled.requestCount,
    );
  });

  test("a Claude proposal cannot change actual analytical state before Apply", () => {
    const knownGeoids = new Set(tractByGeoid.keys());
    const action = {
      type: "select_tracts" as const,
      geoids: [
        REPRESENTATIVE_TRACTS.high.properties.geoid,
        REPRESENTATIVE_TRACTS.low.properties.geoid,
      ],
      activeGeoid: REPRESENTATIVE_TRACTS.low.properties.geoid,
    };
    expect(isActionSafeForKnownGeoids(action, knownGeoids)).toBe(true);

    useAtlasStore.getState().setPendingAssistantAction(action);
    expect(useAtlasStore.getState().selectedGeoids).toEqual([]);
    expect(useAtlasStore.getState().assistant.pendingAction).toEqual(action);

    useAtlasStore.getState().applyAssistantAction();
    expect(useAtlasStore.getState().selectedGeoids).toEqual(action.geoids);
    expect(useAtlasStore.getState().activeGeoid).toBe(action.activeGeoid);
    expect(useAtlasStore.getState().assistant.pendingAction).toBeNull();
  });
});
