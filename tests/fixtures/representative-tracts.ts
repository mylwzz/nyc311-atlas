import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MultiPolygon, Polygon, Position } from "geojson";

interface TractProperties {
  geoid: string;
  tractName: string;
  borough: string;
  population: number | null;
  medianHouseholdIncome: number | null;
  allocationEligible: boolean;
  queenNeighborGeoids: string[];
  housingBuildingComplaintCount: number;
  housingBuildingComplaintRatePer1000: number | null;
  housingBuildingKnownClosureTimingOutcomes30d: number;
  housingBuildingResponseSampleStatus:
    | "no_requests"
    | "no_known_timing"
    | "insufficient_sample"
    | "sufficient";
}

export interface TractFixture {
  type: "Feature";
  properties: TractProperties;
  geometry: Polygon | MultiPolygon;
}

interface TractsFixture {
  features: TractFixture[];
}

const tracts = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/data/tracts.geojson"), "utf8"),
) as TractsFixture;

const features = tracts.features;
const housingRate = (feature: TractFixture) =>
  feature.properties.housingBuildingComplaintRatePer1000 ?? Number.POSITIVE_INFINITY;

function required(
  predicate: (feature: TractFixture) => boolean,
  label: string,
): TractFixture {
  const feature = features.find(predicate);
  if (!feature) throw new Error(`Actual tract artifact has no ${label} fixture.`);
  return feature;
}

const eligibleWithRequests = features.filter(
  ({ properties }) =>
    properties.allocationEligible &&
    properties.housingBuildingComplaintCount > 0 &&
    properties.housingBuildingComplaintRatePer1000 !== null,
);
const high = [...eligibleWithRequests].sort((left, right) =>
  housingRate(right) - housingRate(left)
)[0];
const low = [...eligibleWithRequests].sort((left, right) =>
  housingRate(left) - housingRate(right)
)[0];

const sparse = features.filter(
  ({ properties }) =>
    properties.housingBuildingResponseSampleStatus === "insufficient_sample",
);
const pooledSparse: TractFixture[] = [];
let pooledKnownTiming = 0;
for (const feature of sparse) {
  pooledSparse.push(feature);
  pooledKnownTiming += feature.properties.housingBuildingKnownClosureTimingOutcomes30d;
  if (pooledKnownTiming >= 30 && pooledSparse.length >= 2) break;
}
if (pooledKnownTiming < 30) {
  throw new Error("Actual tract artifact has no sparse group that pools to 30 outcomes.");
}

export const REPRESENTATIVE_TRACTS = {
  high,
  low,
  ineligible: required(
    ({ properties }) => !properties.allocationEligible,
    "allocation-ineligible tract",
  ),
  missingDemographics: required(
    ({ properties }) =>
      properties.population === null &&
      properties.medianHouseholdIncome === null,
    "tract with unavailable population and income",
  ),
  island: required(
    ({ properties }) => properties.queenNeighborGeoids.length === 0,
    "Queen island",
  ),
  zeroRequest: required(
    ({ properties }) =>
      properties.housingBuildingResponseSampleStatus === "no_requests",
    "zero-request Housing & Building tract",
  ),
  sparse: required(
    ({ properties }) =>
      properties.housingBuildingResponseSampleStatus === "insufficient_sample",
    "sparse Housing & Building tract",
  ),
  sufficient: required(
    ({ properties }) =>
      properties.housingBuildingResponseSampleStatus === "sufficient",
    "sufficient Housing & Building tract",
  ),
  fiveSufficient: features
    .filter(
      ({ properties }) =>
        properties.housingBuildingResponseSampleStatus === "sufficient",
    )
    .slice(0, 6),
  pooledSparse,
} as const;

export function tractName(feature: TractFixture): string {
  return `Census Tract ${feature.properties.tractName}, ${feature.properties.borough}`;
}

type Coordinate = [number, number];

function isCoordinate(value: Position | undefined): value is Coordinate {
  return Boolean(
    value &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number",
  );
}

function pointInRing(point: Coordinate, ring: readonly Position[]): boolean {
  let inside = false;
  for (let index = 0, prior = ring.length - 1; index < ring.length; prior = index++) {
    const current = ring[index];
    const previous = ring[prior];
    if (!isCoordinate(current) || !isCoordinate(previous)) continue;
    const crosses = current[1] > point[1] !== previous[1] > point[1] &&
      point[0] <
        ((previous[0] - current[0]) * (point[1] - current[1])) /
          (previous[1] - current[1]) +
          current[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Coordinate, polygon: readonly Position[][]): boolean {
  const outer = polygon[0];
  if (!outer || !pointInRing(point, outer)) return false;
  return polygon.slice(1).every((hole) => !pointInRing(point, hole));
}

function segmentDistanceSquared(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
        (dx ** 2 + dy ** 2),
    ),
  );
  const projected: Coordinate = [start[0] + ratio * dx, start[1] + ratio * dy];
  return (point[0] - projected[0]) ** 2 + (point[1] - projected[1]) ** 2;
}

function polygonClearanceSquared(
  point: Coordinate,
  polygon: readonly Position[][],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const ring of polygon) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      if (!isCoordinate(start) || !isCoordinate(end)) continue;
      minimum = Math.min(minimum, segmentDistanceSquared(point, start, end));
    }
  }
  return minimum;
}

/** A deterministic point guaranteed to fall inside the actual exported geometry. */
export function tractInteriorPoint(feature: TractFixture): Coordinate {
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  for (const polygon of polygons) {
    const ring = polygon[0]?.filter(isCoordinate) ?? [];
    if (ring.length === 0) continue;
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    const minimumX = Math.min(...xs);
    const maximumX = Math.max(...xs);
    const minimumY = Math.min(...ys);
    const maximumY = Math.max(...ys);
    for (let resolution = 31; resolution >= 7; resolution -= 8) {
      const candidates: Coordinate[] = [];
      for (let row = 0; row < resolution; row += 1) {
        for (let column = 0; column < resolution; column += 1) {
          candidates.push([
            minimumX + ((column + 0.5) / resolution) * (maximumX - minimumX),
            minimumY + ((row + 0.5) / resolution) * (maximumY - minimumY),
          ]);
        }
      }
      const interior = candidates
        .filter((candidate) => pointInPolygon(candidate, polygon))
        .sort(
          (left, right) =>
            polygonClearanceSquared(right, polygon) -
            polygonClearanceSquared(left, polygon),
        )[0];
      if (interior) return interior;
    }
  }
  throw new Error(`Could not derive an interior point for ${feature.properties.geoid}.`);
}
