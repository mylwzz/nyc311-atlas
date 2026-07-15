import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ARTIFACT_FILES,
  DOMAIN_KEYS,
  DOMAIN_PROPERTY_PREFIXES,
  ArtifactContractError,
  ManifestSchema,
  TractFeaturePropertiesSchema,
  TractWorkloadRecordSchema,
  createArtifactLoader,
  parseArtifact,
  parseManifest,
  validateCompleteArtifactSet,
  validateScenarioArtifactsCrossArtifact,
  validateStartupArtifacts,
  validateWorkloadCrossArtifact,
  type ArtifactDataByFile,
  type ArtifactFile,
  type CompleteArtifactSet,
  type Manifest,
  type TractFeatureProperties,
} from "@/lib/artifacts";

const root = process.cwd();
let cachedArtifacts: CompleteArtifactSet | undefined;

function json(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function loadValidatedArtifacts(): CompleteArtifactSet {
  if (cachedArtifacts) return cachedArtifacts;
  const manifest = parseManifest(json("manifest.json"));
  const metadata = parseArtifact("metadata.json", json("public/data/metadata.json"));
  const context = parseArtifact("context.json", json("public/data/context.json"));
  const tracts = parseArtifact("tracts.geojson", json("public/data/tracts.geojson"));
  const tractDetails = parseArtifact(
    "tract_details.json",
    json("public/data/tract_details.json"),
  );
  const scenarios = parseArtifact(
    "scenarios.json",
    json("public/data/scenarios.json"),
  );
  const tradeoff = parseArtifact("tradeoff.json", json("public/data/tradeoff.json"));
  const workload = parseArtifact("workload.json", json("public/data/workload.json"));
  const knowledgeBase = parseArtifact(
    "knowledge_base.json",
    json("server/data/knowledge_base.json"),
  );
  const evidence = parseArtifact("evidence.json", json("server/data/evidence.json"));
  cachedArtifacts = validateCompleteArtifactSet({
    manifest,
    metadata,
    context,
    tracts,
    tractDetails,
    scenarios,
    tradeoff,
    workload,
    knowledgeBase,
    evidence,
  });
  return cachedArtifacts;
}

describe("artifact contract", () => {
  it("validates all nine artifacts, their manifest integrity, and cross-artifact sets", () => {
    const artifacts = loadValidatedArtifacts();
    expect(artifacts.manifest.files).toHaveLength(9);
    expect(artifacts.tracts.features).toHaveLength(2167);
    expect(artifacts.scenarios.scenarios).toHaveLength(550);
    expect(Object.keys(artifacts.workload.tracts).length * DOMAIN_KEYS.length)
      .toBe(10835);

    for (const entry of artifacts.manifest.files) {
      const bytes = readFileSync(path.join(root, entry.relativePath));
      expect(bytes.byteLength, entry.file).toBe(entry.byteSize);
      expect(createHash("sha256").update(bytes).digest("hex"), entry.file)
        .toBe(entry.sha256);
    }
  }, 60_000);

  it("rejects a duplicate, missing, or incorrectly routed manifest entry", () => {
    const raw = json("manifest.json") as Manifest;
    const duplicate = structuredClone(raw);
    duplicate.files[1] = duplicate.files[0];
    expect(ManifestSchema.safeParse(duplicate).success).toBe(false);

    const wrongPath = structuredClone(raw);
    wrongPath.files[0].relativePath = "public/data/wrong.json";
    expect(ManifestSchema.safeParse(wrongPath).success).toBe(false);
  });

  it("blocks mixed artifact sets before startup data is exposed", () => {
    const artifacts = loadValidatedArtifacts();
    const context = {
      ...artifacts.context,
      artifactSetId: "20260715T045848Z-deadbeef",
    };
    expect(() => validateStartupArtifacts({
      manifest: artifacts.manifest,
      metadata: artifacts.metadata,
      context,
      tracts: artifacts.tracts,
    })).toThrowError(ArtifactContractError);
    try {
      validateStartupArtifacts({
        manifest: artifacts.manifest,
        metadata: artifacts.metadata,
        context,
        tracts: artifacts.tracts,
      });
    } catch (error) {
      expect((error as ArtifactContractError).code).toBe("artifact_set_mismatch");
    }
  }, 60_000);

  it("blocks malformed Queen adjacency during startup validation", () => {
    const artifacts = loadValidatedArtifacts();
    const first = artifacts.tracts.features[0];
    const tracts = {
      ...artifacts.tracts,
      features: [
        {
          ...first,
          properties: {
            ...first.properties,
            queenNeighborGeoids: ["99999999999"],
          },
        },
        ...artifacts.tracts.features.slice(1),
      ],
    };
    expect(() => validateStartupArtifacts({
      manifest: artifacts.manifest,
      metadata: artifacts.metadata,
      context: artifacts.context,
      tracts,
    })).toThrowError(/references unknown GEOID/);
  });

  it("runs lazy cross-artifact GEOID and scenario/tradeoff checks", () => {
    const artifacts = loadValidatedArtifacts();
    const workloadTracts = { ...artifacts.workload.tracts };
    delete workloadTracts[Object.keys(workloadTracts)[0]];
    expect(() => validateWorkloadCrossArtifact(artifacts.tracts, {
      ...artifacts.workload,
      tracts: workloadTracts,
    })).toThrowError(/GEOID sets disagree/);

    const points = [...artifacts.tradeoff.points];
    points[0] = { ...points[0], scenarioId: "missing-scenario" };
    expect(() => validateScenarioArtifactsCrossArtifact(
      artifacts.tracts,
      artifacts.scenarios,
      { ...artifacts.tradeoff, points },
    )).toThrowError(/Scenario and tradeoff IDs disagree/);
  });

  it("preserves sparse response values as null and rejects silent zero replacement", () => {
    const raw = json("public/data/tracts.geojson") as {
      features: Array<{ properties: TractFeatureProperties }>;
    };
    const properties = raw.features.find((feature) =>
      feature.properties.housingBuildingResponseSampleStatus ===
        "insufficient_sample")?.properties;
    expect(properties).toBeDefined();
    expect(properties?.housingBuildingRecordedClosureWithin30dPct).toBeNull();
    expect(properties?.housingBuildingOpenAt30d).toBeNull();

    const replaced = {
      ...properties,
      housingBuildingRecordedClosureWithin30dPct: 0,
    };
    expect(TractFeaturePropertiesSchema.safeParse(replaced).success).toBe(false);
  });

  it("accepts the required no-known-timing state even though this snapshot has no such cell", () => {
    const raw = json("public/data/workload.json") as {
      tracts: Record<string, Record<string, unknown>>;
    };
    const noRequests = Object.values(raw.tracts)
      .flatMap((record) => Object.values(record))
      .find((record) =>
        (record as { sampleStatus?: string }).sampleStatus === "no_requests") as
      Record<string, unknown>;
    const periodArrivals = [...(noRequests.periodArrivals as number[])];
    periodArrivals[0] = 1;
    const noKnownTiming = {
      ...noRequests,
      requestCount: 1,
      periodArrivals,
      sampleStatus: "no_known_timing",
    };
    expect(TractWorkloadRecordSchema.safeParse(noKnownTiming).success).toBe(true);
  });

  it("recomputes all 550 ranked scenario arrays exactly", () => {
    const artifacts = loadValidatedArtifacts();
    const eligible = artifacts.tracts.features
      .map((feature) => feature.properties)
      .filter((properties) => properties.allocationEligible);

    for (const scenario of artifacts.scenarios.scenarios) {
      const prefix = DOMAIN_PROPERTY_PREFIXES[scenario.domainKey];
      const intensitySuffix = scenario.scalingMode === "rank_balanced"
        ? "ComplaintIntensityPercentile"
        : "ComplaintIntensityZ";
      const incomeKey = scenario.scalingMode === "rank_balanced"
        ? "lowerIncomePriorityPercentile"
        : "lowerIncomePriorityZ";
      const ranked = eligible.map((properties) => {
        const dynamic = properties as unknown as Record<string, number | string | null>;
        const intensity = dynamic[`${prefix}${intensitySuffix}`] as number;
        const income = dynamic[incomeKey] as number;
        return {
          geoid: properties.geoid,
          score: scenario.alphaIntensity * intensity +
            (1 - scenario.alphaIntensity) * income,
        };
      }).sort((left, right) =>
        right.score - left.score || left.geoid.localeCompare(right.geoid));

      expect(ranked.slice(0, scenario.k).map(({ geoid }) => geoid), scenario.id)
        .toEqual(scenario.selection.rankedSelectedGeoids);
      expect(ranked[scenario.k - 1].score, scenario.id)
        .toBeCloseTo(scenario.selection.selectionCutoffScore, 12);
    }
  }, 60_000);

  it("returns a blocking fetch error rather than an empty artifact", async () => {
    const loader = createArtifactLoader({
      fetcher: async () => new Response("missing", { status: 404 }),
      useWorker: false,
    });
    await expect(loader.loadManifest()).rejects.toMatchObject({
      name: "ArtifactContractError",
      code: "fetch_error",
    });
  });

  it("verifies public artifact bytes against the manifest SHA-256", async () => {
    const manifestBytes = readFileSync(path.join(root, "manifest.json"));
    const metadataBytes = readFileSync(
      path.join(root, "public/data/metadata.json"),
    );
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      const bytes = url === "/api/manifest" ? manifestBytes : metadataBytes;
      return new Response(new Uint8Array(bytes));
    };
    const loader = createArtifactLoader({ fetcher, useWorker: false });
    await expect(loader.loadPublicArtifact("metadata.json"))
      .resolves.toMatchObject({ modelVersion: "atlas", snapshotYear: 2016 });

    const corrupted = Uint8Array.from(metadataBytes);
    corrupted[corrupted.length - 2] ^= 1;
    const corruptLoader = createArtifactLoader({
      fetcher: async (input) => new Response(
        String(input) === "/api/manifest"
          ? new Uint8Array(manifestBytes)
          : corrupted,
      ),
      useWorker: false,
    });
    await expect(corruptLoader.loadPublicArtifact("metadata.json"))
      .rejects.toMatchObject({ code: "integrity_mismatch" });
  });
});

describe("schema registry", () => {
  it("has one schema for every manifest artifact", () => {
    const artifacts = loadValidatedArtifacts();
    const loaded: Partial<Record<ArtifactFile, ArtifactDataByFile[ArtifactFile]>> = {
      "metadata.json": artifacts.metadata,
      "context.json": artifacts.context,
      "tracts.geojson": artifacts.tracts,
      "tract_details.json": artifacts.tractDetails,
      "scenarios.json": artifacts.scenarios,
      "tradeoff.json": artifacts.tradeoff,
      "workload.json": artifacts.workload,
      "knowledge_base.json": artifacts.knowledgeBase,
      "evidence.json": artifacts.evidence,
    };
    expect(Object.keys(loaded).sort()).toEqual([...ARTIFACT_FILES].sort());
  }, 60_000);
});
