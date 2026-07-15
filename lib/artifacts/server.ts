import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  type ServerArtifactFile,
} from "./constants";
import {
  ArtifactContractError,
  getManifestEntry,
  parseArtifact,
  parseJson,
  parseManifest,
  validateArtifactAgainstManifest,
} from "./contract";
import type { ArtifactDataByFile, Manifest } from "./schemas";

let manifestPromise: Promise<Manifest> | undefined;
const serverArtifactPromises = new Map<ServerArtifactFile, Promise<unknown>>();

function serverArtifactPath(file: ServerArtifactFile): string {
  switch (file) {
    case "knowledge_base.json":
      return path.join(process.cwd(), "server/data/knowledge_base.json");
    case "evidence.json":
      return path.join(process.cwd(), "server/data/evidence.json");
  }
}

async function loadServerManifest() {
  const bytes = await readFile(path.join(process.cwd(), "manifest.json"));
  return parseManifest(parseJson(bytes.toString("utf8"), "manifest.json"));
}

export function getServerManifest() {
  manifestPromise ??= loadServerManifest();
  return manifestPromise;
}

export function loadServerArtifact<File extends ServerArtifactFile>(
  file: File,
): Promise<ArtifactDataByFile[File]> {
  let promise = serverArtifactPromises.get(file) as
    Promise<ArtifactDataByFile[File]> | undefined;
  if (promise) return promise;

  promise = (async () => {
    const manifest = await getServerManifest();
    const entry = getManifestEntry(manifest, file);
    const bytes = await readFile(serverArtifactPath(file));
    if (bytes.byteLength !== entry.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      throw new ArtifactContractError(
        "integrity_mismatch",
        `${file} does not match its manifest integrity metadata.`,
        { artifact: file },
      );
    }
    const artifact = parseArtifact(
      file,
      parseJson(bytes.toString("utf8"), file),
    );
    return validateArtifactAgainstManifest(file, artifact, manifest);
  })();
  serverArtifactPromises.set(file, promise);
  return promise;
}

export async function loadServerKnowledgeArtifacts() {
  const [knowledgeBase, evidence] = await Promise.all([
    loadServerArtifact("knowledge_base.json"),
    loadServerArtifact("evidence.json"),
  ]);
  return { knowledgeBase, evidence };
}

export function clearServerArtifactCache() {
  manifestPromise = undefined;
  serverArtifactPromises.clear();
}
