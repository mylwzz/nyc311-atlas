/// <reference lib="webworker" />

import { parseArtifact, parseJson } from "@/lib/artifacts/contract";

type WorkerArtifactFile =
  | "tracts.geojson"
  | "tract_details.json"
  | "scenarios.json"
  | "workload.json";

interface ArtifactWorkerRequest {
  id: number;
  file: WorkerArtifactFile;
  text: string;
}

interface ArtifactWorkerResponse {
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ArtifactWorkerRequest>) => {
  const { id, file, text } = event.data;
  try {
    const value = parseArtifact(file, parseJson(text, file));
    workerScope.postMessage({ id, ok: true, value } satisfies ArtifactWorkerResponse);
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : `${file} failed validation.`,
    } satisfies ArtifactWorkerResponse);
  }
};

export {};
