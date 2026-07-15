import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";

import type { TractsGeoJson } from "@/lib/artifacts";

import type { Coordinate } from "./geometry";

export type GeometryWorkerFeature = Feature<
  Polygon | MultiPolygon,
  { geoid: string; borough: string }
>;

export type GeometryWorkerRequest =
  | {
      id: number;
      kind: "borough_boundaries";
      features: GeometryWorkerFeature[];
    }
  | {
      id: number;
      kind: "neighborhood_perimeter";
      features: GeometryWorkerFeature[];
    };

export type GeometryWorkerResponse =
  | {
      id: number;
      ok: true;
      kind: "borough_boundaries";
      boundaries: FeatureCollection<
        Polygon | MultiPolygon,
        { borough: string }
      >;
    }
  | {
      id: number;
      ok: true;
      kind: "neighborhood_perimeter";
      perimeterDots: Coordinate[];
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

/** Strip analytical properties before crossing the worker boundary. */
export function geometryWorkerFeatures(
  tracts: TractsGeoJson,
  includedGeoids?: ReadonlySet<string>,
): GeometryWorkerFeature[] {
  return tracts.features.flatMap((feature) => {
    if (includedGeoids && !includedGeoids.has(feature.properties.geoid)) {
      return [];
    }
    return [{
      type: "Feature" as const,
      properties: {
        geoid: feature.properties.geoid,
        borough: feature.properties.borough,
      },
      geometry: feature.geometry,
    }];
  });
}
