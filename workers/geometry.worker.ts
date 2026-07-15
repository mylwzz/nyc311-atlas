/// <reference lib="webworker" />

import type { TractsGeoJson } from "@/lib/artifacts";
import {
  buildBoroughBoundaries,
  perimeterDots,
  unionTracts,
} from "@/lib/map/geometry";
import type {
  GeometryWorkerRequest,
  GeometryWorkerResponse,
} from "@/lib/map/geometry-worker-contract";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<GeometryWorkerRequest>) => {
  const request = event.data;
  try {
    // The geometry functions only read feature geometry, GEOID, and borough.
    // The main thread intentionally strips every analytical property before
    // posting this minimal collection to the worker.
    const tracts = {
      type: "FeatureCollection",
      features: request.features,
    } as unknown as TractsGeoJson;

    const response: GeometryWorkerResponse =
      request.kind === "borough_boundaries"
        ? {
            id: request.id,
            ok: true,
            kind: request.kind,
            boundaries: buildBoroughBoundaries(tracts),
          }
        : {
            id: request.id,
            ok: true,
            kind: request.kind,
            perimeterDots: perimeterDots(
              unionTracts(
                tracts,
                new Set(request.features.map((feature) => feature.properties.geoid)),
              ),
            ),
          };
    worker.postMessage(response);
  } catch (error) {
    worker.postMessage({
      id: request.id,
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Map geometry could not be prepared.",
    } satisfies GeometryWorkerResponse);
  }
};

export {};
