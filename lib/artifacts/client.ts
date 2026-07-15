import {
  PUBLIC_ARTIFACT_URLS,
  type PublicArtifactFile,
} from "./constants";
import {
  ArtifactContractError,
  getManifestEntry,
  parseArtifact,
  parseJson,
  parseManifest,
  validateArtifactAgainstManifest,
  validateStartupArtifacts,
  type StartupArtifacts,
} from "./contract";
import type { ArtifactDataByFile, Manifest } from "./schemas";

type Fetcher = typeof fetch;
type WorkerParsedFile =
  | "tracts.geojson"
  | "tract_details.json"
  | "scenarios.json"
  | "workload.json";

const WORKER_PARSED_FILES = new Set<PublicArtifactFile>([
  "tracts.geojson",
  "tract_details.json",
  "scenarios.json",
  "workload.json",
]);

interface WorkerRequest {
  id: number;
  file: WorkerParsedFile;
  text: string;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

let requestId = 0;

async function parseInArtifactWorker<File extends WorkerParsedFile>(
  file: File,
  text: string,
): Promise<ArtifactDataByFile[File]> {
  const worker = new Worker(
    new URL("../../workers/artifact.worker.ts", import.meta.url),
    { type: "module" },
  );
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.value as ArtifactDataByFile[File]);
      } else {
        reject(new ArtifactContractError(
          "schema_mismatch",
          event.data.error ?? `${file} failed worker validation.`,
          { artifact: file },
        ));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new ArtifactContractError(
        "schema_mismatch",
        `The ${file} parsing worker failed: ${event.message}`,
        { artifact: file },
      ));
    };
    worker.postMessage({ id, file, text } satisfies WorkerRequest);
  });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchBytes(
  fetcher: Fetcher,
  url: string,
  artifact: string,
): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetcher(url, { cache: "force-cache" });
  } catch (cause) {
    throw new ArtifactContractError(
      "fetch_error",
      `Could not fetch ${artifact}.`,
      { artifact, cause },
    );
  }
  if (!response.ok) {
    throw new ArtifactContractError(
      "fetch_error",
      `Could not fetch ${artifact} (HTTP ${response.status}).`,
      { artifact },
    );
  }
  return response.arrayBuffer();
}

async function fetchManifestUncached(fetcher: Fetcher): Promise<Manifest> {
  const bytes = await fetchBytes(fetcher, "/api/manifest", "manifest.json");
  const text = new TextDecoder().decode(bytes);
  return parseManifest(parseJson(text, "manifest.json"));
}

async function fetchPublicArtifactUncached<File extends PublicArtifactFile>(
  file: File,
  manifest: Manifest,
  fetcher: Fetcher,
  useWorker: boolean,
): Promise<ArtifactDataByFile[File]> {
  const bytes = await fetchBytes(fetcher, PUBLIC_ARTIFACT_URLS[file], file);
  const entry = getManifestEntry(manifest, file);
  if (bytes.byteLength !== entry.byteSize) {
    throw new ArtifactContractError(
      "integrity_mismatch",
      `${file} has ${bytes.byteLength} bytes; manifest declares ${entry.byteSize}.`,
      { artifact: file },
    );
  }
  const digest = await sha256Hex(bytes);
  if (digest !== entry.sha256) {
    throw new ArtifactContractError(
      "integrity_mismatch",
      `${file} does not match its manifest SHA-256.`,
      { artifact: file },
    );
  }
  const text = new TextDecoder().decode(bytes);
  const canUseWorker = useWorker && typeof Worker !== "undefined" &&
    WORKER_PARSED_FILES.has(file);
  const artifact = canUseWorker
    ? await parseInArtifactWorker(file as WorkerParsedFile, text) as
      ArtifactDataByFile[File]
    : parseArtifact(file, parseJson(text, file));
  return validateArtifactAgainstManifest(file, artifact, manifest);
}

export interface ArtifactLoaderOptions {
  fetcher?: Fetcher;
  useWorker?: boolean;
}

export interface ArtifactLoader {
  loadManifest(): Promise<Manifest>;
  loadPublicArtifact<File extends PublicArtifactFile>(
    file: File,
  ): Promise<ArtifactDataByFile[File]>;
  loadStartup(): Promise<StartupArtifacts>;
  clear(): void;
}

export function createArtifactLoader(
  options: ArtifactLoaderOptions = {},
): ArtifactLoader {
  const fetcher = options.fetcher ?? fetch;
  const useWorker = options.useWorker ?? true;
  let manifestPromise: Promise<Manifest> | undefined;
  let startupPromise: Promise<StartupArtifacts> | undefined;
  const artifactPromises = new Map<PublicArtifactFile, Promise<unknown>>();

  const loadManifest = () => {
    manifestPromise ??= fetchManifestUncached(fetcher);
    return manifestPromise;
  };

  const loadPublicArtifact = <File extends PublicArtifactFile>(file: File) => {
    let promise = artifactPromises.get(file) as
      Promise<ArtifactDataByFile[File]> | undefined;
    if (!promise) {
      promise = loadManifest().then((manifest) =>
        fetchPublicArtifactUncached(file, manifest, fetcher, useWorker));
      artifactPromises.set(file, promise);
      void promise.catch(() => {
        if (artifactPromises.get(file) === promise) {
          artifactPromises.delete(file);
        }
      });
    }
    return promise;
  };

  const loadStartup = () => {
    startupPromise ??= (async () => {
      const manifest = await loadManifest();
      const [metadata, context] = await Promise.all([
        loadPublicArtifact("metadata.json"),
        loadPublicArtifact("context.json"),
      ]);
      const tracts = await loadPublicArtifact("tracts.geojson");
      return validateStartupArtifacts({ manifest, metadata, context, tracts });
    })();
    return startupPromise;
  };

  return {
    loadManifest,
    loadPublicArtifact,
    loadStartup,
    clear() {
      manifestPromise = undefined;
      startupPromise = undefined;
      artifactPromises.clear();
    },
  };
}

const defaultLoader = createArtifactLoader();

export const loadManifest = () => defaultLoader.loadManifest();
export const loadPublicArtifact = <File extends PublicArtifactFile>(file: File) =>
  defaultLoader.loadPublicArtifact(file);
export const loadStartupArtifacts = () => defaultLoader.loadStartup();
export const clearArtifactCache = () => defaultLoader.clear();
