import { z } from "zod";

import {
  ARTIFACT_FILES,
  DOMAIN_KEYS,
  MODEL_VERSION,
  SCHEMA_VERSION,
  type ArtifactFile,
} from "./constants";
import {
  ArtifactSchemas,
  ManifestSchema,
  type ArtifactDataByFile,
  type Context,
  type Manifest,
  type Metadata,
  type Scenarios,
  type TractDetails,
  type TractsGeoJson,
  type Tradeoff,
  type Workload,
} from "./schemas";

export type ArtifactContractErrorCode =
  | "fetch_error"
  | "invalid_json"
  | "schema_mismatch"
  | "model_mismatch"
  | "artifact_set_mismatch"
  | "manifest_mismatch"
  | "integrity_mismatch"
  | "record_count_mismatch"
  | "cross_artifact_mismatch";

export class ArtifactContractError extends Error {
  readonly code: ArtifactContractErrorCode;
  readonly artifact?: string;
  readonly cause?: unknown;

  constructor(
    code: ArtifactContractErrorCode,
    message: string,
    options: { artifact?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "ArtifactContractError";
    this.code = code;
    this.artifact = options.artifact;
    this.cause = options.cause;
  }
}

export function parseManifest(input: unknown): Manifest {
  try {
    return ManifestSchema.parse(input);
  } catch (cause) {
    throw new ArtifactContractError(
      "manifest_mismatch",
      "The artifact manifest does not match schema 4.0.0.",
      { artifact: "manifest.json", cause },
    );
  }
}

export function parseArtifact<File extends ArtifactFile>(
  file: File,
  input: unknown,
): ArtifactDataByFile[File] {
  try {
    return ArtifactSchemas[file].parse(input) as ArtifactDataByFile[File];
  } catch (cause) {
    const message = cause instanceof z.ZodError
      ? `${file} failed validation: ${z.prettifyError(cause)}`
      : `${file} failed validation.`;
    throw new ArtifactContractError("schema_mismatch", message, {
      artifact: file,
      cause,
    });
  }
}

export function parseJson(text: string, artifact: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ArtifactContractError(
      "invalid_json",
      `${artifact} is not valid JSON.`,
      { artifact, cause },
    );
  }
}

export function getManifestEntry(manifest: Manifest, file: ArtifactFile) {
  const entry = manifest.files.find((candidate) => candidate.file === file);
  if (!entry) {
    throw new ArtifactContractError(
      "manifest_mismatch",
      `The manifest has no entry for ${file}.`,
      { artifact: file },
    );
  }
  return entry;
}

export function getArtifactRecordCount<File extends ArtifactFile>(
  file: File,
  artifact: ArtifactDataByFile[File],
): number {
  switch (file) {
    case "tracts.geojson":
      return (artifact as TractsGeoJson).features.length;
    case "tract_details.json":
      return Object.keys((artifact as TractDetails).tracts).length;
    case "scenarios.json":
      return (artifact as Scenarios).scenarios.length;
    case "tradeoff.json":
      return (artifact as Tradeoff).points.length;
    case "context.json":
      return Object.keys((artifact as Context).serviceDomains).length;
    case "workload.json":
      return Object.keys((artifact as Workload).tracts).length *
        DOMAIN_KEYS.length;
    case "metadata.json":
    case "knowledge_base.json":
      return 1;
    case "evidence.json":
      return (artifact as ArtifactDataByFile["evidence.json"]).items.length;
  }
}

export function validateArtifactAgainstManifest<File extends ArtifactFile>(
  file: File,
  artifact: ArtifactDataByFile[File],
  manifest: Manifest,
): ArtifactDataByFile[File] {
  const envelope = artifact as {
    schemaVersion: string;
    modelVersion: string;
    artifactSetId: string;
  };
  if (envelope.schemaVersion !== SCHEMA_VERSION ||
    envelope.schemaVersion !== manifest.schemaVersion) {
    throw new ArtifactContractError(
      "schema_mismatch",
      `${file} has schema ${envelope.schemaVersion}; expected ${SCHEMA_VERSION}.`,
      { artifact: file },
    );
  }
  if (envelope.modelVersion !== MODEL_VERSION ||
    envelope.modelVersion !== manifest.modelVersion) {
    throw new ArtifactContractError(
      "model_mismatch",
      `${file} has model ${envelope.modelVersion}; expected ${MODEL_VERSION}.`,
      { artifact: file },
    );
  }
  if (envelope.artifactSetId !== manifest.artifactSetId) {
    throw new ArtifactContractError(
      "artifact_set_mismatch",
      `${file} belongs to a different artifact set.`,
      { artifact: file },
    );
  }
  const expectedCount = getManifestEntry(manifest, file).recordCount;
  const actualCount = getArtifactRecordCount(file, artifact);
  if (actualCount !== expectedCount) {
    throw new ArtifactContractError(
      "record_count_mismatch",
      `${file} contains ${actualCount} records; manifest declares ${expectedCount}.`,
      { artifact: file },
    );
  }
  return artifact;
}

function sameSet(left: Iterable<string>, right: Iterable<string>) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value));
}

export interface StartupArtifacts {
  manifest: Manifest;
  metadata: Metadata;
  context: Context;
  tracts: TractsGeoJson;
}

export function validateStartupArtifacts(
  artifacts: StartupArtifacts,
): StartupArtifacts {
  const { manifest, metadata, context, tracts } = artifacts;
  validateArtifactAgainstManifest("metadata.json", metadata, manifest);
  validateArtifactAgainstManifest("context.json", context, manifest);
  validateArtifactAgainstManifest("tracts.geojson", tracts, manifest);

  if (!sameSet(metadata.scenarioGrid.serviceDomains,
    Object.keys(context.serviceDomains))) {
    throw new ArtifactContractError(
      "cross_artifact_mismatch",
      "Metadata and context expose different service-domain sets.",
    );
  }
  const geoids = tracts.features.map((feature) => feature.properties.geoid);
  if (new Set(geoids).size !== geoids.length) {
    throw new ArtifactContractError(
      "cross_artifact_mismatch",
      "The tract GeoJSON contains duplicate GEOIDs.",
      { artifact: "tracts.geojson" },
    );
  }
  const adjacency = new Map(
    tracts.features.map((feature) => [
      feature.properties.geoid,
      feature.properties.queenNeighborGeoids,
    ]),
  );
  for (const [geoid, neighbors] of adjacency) {
    if (new Set(neighbors).size !== neighbors.length) {
      throw new ArtifactContractError(
        "cross_artifact_mismatch",
        `Queen adjacency for ${geoid} contains a duplicate neighbor.`,
        { artifact: "tracts.geojson" },
      );
    }
    for (const neighbor of neighbors) {
      if (!adjacency.has(neighbor)) {
        throw new ArtifactContractError(
          "cross_artifact_mismatch",
          `Queen adjacency for ${geoid} references unknown GEOID ${neighbor}.`,
          { artifact: "tracts.geojson" },
        );
      }
      if (!adjacency.get(neighbor)?.includes(geoid)) {
        throw new ArtifactContractError(
          "cross_artifact_mismatch",
          `Queen adjacency between ${geoid} and ${neighbor} is asymmetric.`,
          { artifact: "tracts.geojson" },
        );
      }
    }
  }
  return artifacts;
}

export function validateTractDetailsCrossArtifact(
  tracts: TractsGeoJson,
  tractDetails: TractDetails,
): TractDetails {
  if (!sameSet(
    tracts.features.map((feature) => feature.properties.geoid),
    Object.keys(tractDetails.tracts),
  )) {
    throw new ArtifactContractError(
      "cross_artifact_mismatch",
      "Map and tract-detail GEOID sets disagree.",
      { artifact: "tract_details.json" },
    );
  }
  return tractDetails;
}

export function validateWorkloadCrossArtifact(
  tracts: TractsGeoJson,
  workload: Workload,
): Workload {
  if (!sameSet(
    tracts.features.map((feature) => feature.properties.geoid),
    Object.keys(workload.tracts),
  )) {
    throw new ArtifactContractError(
      "cross_artifact_mismatch",
      "Map and workload GEOID sets disagree.",
      { artifact: "workload.json" },
    );
  }
  return workload;
}

export function validateScenarioArtifactsCrossArtifact(
  tracts: TractsGeoJson,
  scenarios: Scenarios,
  tradeoff: Tradeoff,
): { scenarios: Scenarios; tradeoff: Tradeoff } {
  const eligibleGeoids = new Set(
    tracts.features
      .filter((feature) => feature.properties.allocationEligible)
      .map((feature) => feature.properties.geoid),
  );
  const scenarioIds = new Set<string>();
  for (const scenario of scenarios.scenarios) {
    if (scenarioIds.has(scenario.id) ||
      scenario.selection.rankedSelectedGeoids.some(
        (selectedGeoid) => !eligibleGeoids.has(selectedGeoid),
      )) {
      throw new ArtifactContractError(
        "cross_artifact_mismatch",
        `Scenario ${scenario.id} is duplicated or selects an ineligible tract.`,
        { artifact: "scenarios.json" },
      );
    }
    scenarioIds.add(scenario.id);
  }
  if (!sameSet(
    scenarioIds,
    tradeoff.points.map((point) => point.scenarioId),
  )) {
    throw new ArtifactContractError(
      "cross_artifact_mismatch",
      "Scenario and tradeoff IDs disagree.",
      { artifact: "tradeoff.json" },
    );
  }
  return { scenarios, tradeoff };
}

export interface CompleteArtifactSet extends StartupArtifacts {
  tractDetails: TractDetails;
  scenarios: Scenarios;
  tradeoff: Tradeoff;
  workload: Workload;
  knowledgeBase: ArtifactDataByFile["knowledge_base.json"];
  evidence: ArtifactDataByFile["evidence.json"];
}

export function validateCompleteArtifactSet(
  artifacts: CompleteArtifactSet,
): CompleteArtifactSet {
  validateStartupArtifacts(artifacts);
  const { manifest } = artifacts;
  const loaded: Array<[ArtifactFile, ArtifactDataByFile[ArtifactFile]]> = [
    ["tract_details.json", artifacts.tractDetails],
    ["scenarios.json", artifacts.scenarios],
    ["tradeoff.json", artifacts.tradeoff],
    ["workload.json", artifacts.workload],
    ["knowledge_base.json", artifacts.knowledgeBase],
    ["evidence.json", artifacts.evidence],
  ];
  for (const [file, artifact] of loaded) {
    validateArtifactAgainstManifest(file, artifact, manifest);
  }

  validateTractDetailsCrossArtifact(artifacts.tracts, artifacts.tractDetails);
  validateWorkloadCrossArtifact(artifacts.tracts, artifacts.workload);
  validateScenarioArtifactsCrossArtifact(
    artifacts.tracts,
    artifacts.scenarios,
    artifacts.tradeoff,
  );
  return artifacts;
}

export function assertKnownArtifactFile(value: string): ArtifactFile {
  if (!(ARTIFACT_FILES as readonly string[]).includes(value)) {
    throw new ArtifactContractError(
      "manifest_mismatch",
      `${value} is not a supported artifact file.`,
    );
  }
  return value as ArtifactFile;
}
