import { featureCollection } from "@turf/helpers";
import union from "@turf/union";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

import type { TractFeature, TractsGeoJson } from "@/lib/artifacts";

export type PolygonalFeature = Feature<Polygon | MultiPolygon>;
export type Coordinate = [number, number];

const isCoordinate = (position: Position): position is Coordinate =>
  position.length >= 2 &&
  typeof position[0] === "number" &&
  typeof position[1] === "number";

function ringSignedArea(ring: readonly Position[]): number {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next || !isCoordinate(current) || !isCoordinate(next)) continue;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function largestOuterRing(feature: TractFeature): readonly Position[] {
  const { geometry } = feature;
  if (geometry.type === "Polygon") return geometry.coordinates[0] ?? [];

  let largest: readonly Position[] = [];
  let largestArea = Number.NEGATIVE_INFINITY;
  for (const polygon of geometry.coordinates) {
    const ring = polygon[0] ?? [];
    const area = Math.abs(ringSignedArea(ring));
    if (area > largestArea) {
      largest = ring;
      largestArea = area;
    }
  }
  return largest;
}

/** Returns a stable label anchor using the largest polygon's area centroid. */
export function featureAnchor(feature: TractFeature): Coordinate {
  const ring = largestOuterRing(feature);
  const signedArea = ringSignedArea(ring);
  if (Math.abs(signedArea) > Number.EPSILON) {
    let x = 0;
    let y = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const current = ring[index];
      const next = ring[index + 1];
      if (!current || !next || !isCoordinate(current) || !isCoordinate(next)) continue;
      const cross = current[0] * next[1] - next[0] * current[1];
      x += (current[0] + next[0]) * cross;
      y += (current[1] + next[1]) * cross;
    }
    const divisor = 6 * signedArea;
    return [x / divisor, y / divisor];
  }

  const coordinates = ring.filter(isCoordinate);
  if (coordinates.length === 0) return [-73.97, 40.7];
  return [
    coordinates.reduce((total, point) => total + point[0], 0) /
      coordinates.length,
    coordinates.reduce((total, point) => total + point[1], 0) /
      coordinates.length,
  ];
}

export function featureBounds(
  feature: TractFeature,
): [[number, number], [number, number]] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown): void => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      minX = Math.min(minX, value[0]);
      minY = Math.min(minY, value[1]);
      maxX = Math.max(maxX, value[0]);
      maxY = Math.max(maxY, value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };

  visit(feature.geometry.coordinates);
  if (!Number.isFinite(minX)) return [[-74.26, 40.49], [-73.7, 40.92]];
  return [[minX, minY], [maxX, maxY]];
}

export function unionTracts(
  tracts: TractsGeoJson,
  geoids: ReadonlySet<string> | readonly string[],
): PolygonalFeature | null {
  const included = geoids instanceof Set ? geoids : new Set(geoids);
  const features = tracts.features.filter((feature) =>
    included.has(feature.properties.geoid),
  );
  if (features.length === 0) return null;
  if (features.length === 1) {
    const only = features[0];
    return only
      ? {
          type: "Feature",
          properties: {},
          geometry: only.geometry,
        }
      : null;
  }
  return union(featureCollection(features), { properties: {} });
}

export function buildBoroughBoundaries(
  tracts: TractsGeoJson,
): FeatureCollection<Polygon | MultiPolygon, { borough: string }> {
  const boroughs = new Map<string, TractFeature[]>();
  for (const feature of tracts.features) {
    const list = boroughs.get(feature.properties.borough) ?? [];
    list.push(feature);
    boroughs.set(feature.properties.borough, list);
  }

  const features: Array<Feature<Polygon | MultiPolygon, { borough: string }>> = [];
  for (const [borough, boroughTracts] of boroughs) {
    const boundary = union(featureCollection(boroughTracts), {
      properties: { borough },
    });
    if (boundary) features.push(boundary);
  }
  return featureCollection(features);
}

function outerRings(feature: PolygonalFeature): readonly Position[][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates[0] ?? []]
    : feature.geometry.coordinates.map((polygon) => polygon[0] ?? []);
}

/**
 * Samples only the exterior rings of the dissolved neighborhood. Rendering
 * these samples as white points produces a single dotted outer perimeter
 * without adding hop rings or outlining each tract.
 */
export function perimeterDots(
  feature: PolygonalFeature | null,
  spacingDegrees = 0.00055,
): Coordinate[] {
  if (!feature || spacingDegrees <= 0) return [];
  const dots: Coordinate[] = [];

  for (const ring of outerRings(feature)) {
    let carry = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const rawStart = ring[index];
      const rawEnd = ring[index + 1];
      if (!rawStart || !rawEnd || !isCoordinate(rawStart) || !isCoordinate(rawEnd)) {
        continue;
      }
      const start: Coordinate = [rawStart[0], rawStart[1]];
      const end: Coordinate = [rawEnd[0], rawEnd[1]];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;

      let distance = carry === 0 ? 0 : spacingDegrees - carry;
      while (distance <= length) {
        const fraction = distance / length;
        dots.push([start[0] + dx * fraction, start[1] + dy * fraction]);
        distance += spacingDegrees;
      }
      carry = (carry + length) % spacingDegrees;
    }
  }
  return dots;
}

export function featureIndex(tracts: TractsGeoJson): Map<string, TractFeature> {
  return new Map(
    tracts.features.map((feature) => [feature.properties.geoid, feature]),
  );
}
