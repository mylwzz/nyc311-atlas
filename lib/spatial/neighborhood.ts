export const MIN_NEIGHBORHOOD_RADIUS = 1 as const;
export const MAX_NEIGHBORHOOD_RADIUS = 5 as const;

export type NeighborhoodRadius = 1 | 2 | 3 | 4 | 5;
export type QueenAdjacency = Readonly<Record<string, readonly string[]>>;

export interface QueenNeighborhood {
  readonly centerGeoid: string;
  readonly radius: NeighborhoodRadius;
  /** The center and every tract at a shortest-path distance <= radius. */
  readonly includedGeoids: readonly string[];
  /** Every included tract except the center. */
  readonly neighborGeoids: readonly string[];
  readonly distanceByGeoid: Readonly<Record<string, number>>;
  readonly isIsland: boolean;
}

export interface NeighborhoodMetricSummary {
  readonly activeValue: number;
  readonly neighborhoodMedian: number;
  readonly absoluteDifference: number;
  readonly relativeDifferencePct: number | null;
  readonly symmetricDifference: number;
  readonly activeRank: number;
  readonly includedTractCount: number;
  readonly availableTractCount: number;
}

export interface AdjacencyValidationIssue {
  readonly kind: "duplicate_neighbor" | "missing_neighbor" | "asymmetric_edge";
  readonly geoid: string;
  readonly neighborGeoid: string;
}

function assertRadius(radius: number): asserts radius is NeighborhoodRadius {
  if (
    !Number.isInteger(radius) ||
    radius < MIN_NEIGHBORHOOD_RADIUS ||
    radius > MAX_NEIGHBORHOOD_RADIUS
  ) {
    throw new RangeError("Neighborhood radius must be an integer from 1 through 5.");
  }
}

/**
 * Direct breadth-first search over exported Queen adjacency. The function never
 * creates fallback neighbors and fails loudly if the graph references a missing
 * tract, because that is an artifact-contract problem rather than an island.
 */
export function queenNeighborhood(
  adjacency: QueenAdjacency,
  centerGeoid: string,
  radius: number,
): QueenNeighborhood {
  assertRadius(radius);

  if (!Object.hasOwn(adjacency, centerGeoid)) {
    throw new Error(`Unknown center GEOID: ${centerGeoid}`);
  }

  const distances = new Map<string, number>([[centerGeoid, 0]]);
  const queue: string[] = [centerGeoid];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const geoid = queue[queueIndex++];
    const distance = distances.get(geoid);

    if (distance === undefined || distance >= radius) {
      continue;
    }

    for (const neighborGeoid of adjacency[geoid]) {
      if (!Object.hasOwn(adjacency, neighborGeoid)) {
        throw new Error(
          `Queen adjacency for ${geoid} references unknown GEOID ${neighborGeoid}.`,
        );
      }

      if (!distances.has(neighborGeoid)) {
        distances.set(neighborGeoid, distance + 1);
        queue.push(neighborGeoid);
      }
    }
  }

  const includedGeoids = [...distances.entries()]
    .sort(([leftGeoid, leftDistance], [rightGeoid, rightDistance]) => {
      return leftDistance - rightDistance || compareGeoids(leftGeoid, rightGeoid);
    })
    .map(([geoid]) => geoid);

  return {
    centerGeoid,
    radius,
    includedGeoids,
    neighborGeoids: includedGeoids.filter((geoid) => geoid !== centerGeoid),
    distanceByGeoid: Object.fromEntries(distances),
    isIsland: adjacency[centerGeoid].length === 0,
  };
}

export function validateQueenAdjacency(
  adjacency: QueenAdjacency,
): readonly AdjacencyValidationIssue[] {
  const issues: AdjacencyValidationIssue[] = [];

  for (const [geoid, neighbors] of Object.entries(adjacency)) {
    const observed = new Set<string>();

    for (const neighborGeoid of neighbors) {
      if (observed.has(neighborGeoid)) {
        issues.push({ kind: "duplicate_neighbor", geoid, neighborGeoid });
      }
      observed.add(neighborGeoid);

      if (!Object.hasOwn(adjacency, neighborGeoid)) {
        issues.push({ kind: "missing_neighbor", geoid, neighborGeoid });
      } else if (!adjacency[neighborGeoid].includes(geoid)) {
        issues.push({ kind: "asymmetric_edge", geoid, neighborGeoid });
      }
    }
  }

  return issues;
}

/** Symmetric comparison used by the diverging neighborhood fill. */
export function symmetricRelativeDifference(
  value: number,
  reference: number,
  epsilon = 1e-9,
): number {
  assertFinite(value, "value");
  assertFinite(reference, "reference");

  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new RangeError("epsilon must be a positive finite number.");
  }

  return (value - reference) / (Math.abs(value) + Math.abs(reference) + epsilon);
}

export function summarizeNeighborhoodMetric(
  centerGeoid: string,
  includedGeoids: readonly string[],
  values: Readonly<Record<string, number | null | undefined>>,
): NeighborhoodMetricSummary | null {
  const activeValue = values[centerGeoid];
  if (activeValue === null || activeValue === undefined) {
    return null;
  }
  assertFinite(activeValue, `metric value for ${centerGeoid}`);

  const availableValues = includedGeoids.flatMap((geoid) => {
    const value = values[geoid];
    if (value === null || value === undefined) return [];
    assertFinite(value, `metric value for ${geoid}`);
    return [value];
  });

  if (availableValues.length === 0) {
    return null;
  }

  const neighborhoodMedian = median(availableValues);
  const absoluteDifference = activeValue - neighborhoodMedian;

  return {
    activeValue,
    neighborhoodMedian,
    absoluteDifference,
    relativeDifferencePct:
      neighborhoodMedian === 0
        ? null
        : (100 * absoluteDifference) / Math.abs(neighborhoodMedian),
    symmetricDifference: symmetricRelativeDifference(
      activeValue,
      neighborhoodMedian,
    ),
    activeRank: 1 + availableValues.filter((value) => value > activeValue).length,
    includedTractCount: includedGeoids.length,
    availableTractCount: availableValues.length,
  };
}

export function neighborhoodCacheKey(
  artifactSetId: string,
  geoid: string,
  radius: NeighborhoodRadius,
): string {
  return `${artifactSetId}|${geoid}|${radius}`;
}

export function createNeighborhoodCache(
  artifactSetId: string,
  adjacency: QueenAdjacency,
): (geoid: string, radius: NeighborhoodRadius) => QueenNeighborhood {
  const cache = new Map<string, QueenNeighborhood>();

  return (geoid, radius) => {
    const key = neighborhoodCacheKey(artifactSetId, geoid, radius);
    const cached = cache.get(key);
    if (cached) return cached;

    const result = queenNeighborhood(adjacency, geoid, radius);
    cache.set(key, result);
    return result;
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function compareGeoids(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
}
