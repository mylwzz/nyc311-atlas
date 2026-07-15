import { describe, expect, it } from "vitest";

import {
  createNeighborhoodCache,
  queenNeighborhood,
  summarizeNeighborhoodMetric,
  symmetricRelativeDifference,
  validateQueenAdjacency,
  type QueenAdjacency,
} from "@/lib/spatial";

const chain: QueenAdjacency = {
  A: ["B"],
  B: ["A", "C"],
  C: ["B", "D"],
  D: ["C", "E"],
  E: ["D", "F"],
  F: ["E"],
  island: [],
};

describe("Queen-contiguity BFS", () => {
  it.each([1, 2, 3, 4, 5] as const)("returns the exact radius-%i set", (radius) => {
    const result = queenNeighborhood(chain, "A", radius);
    expect(result.includedGeoids).toEqual(
      ["A", "B", "C", "D", "E", "F"].slice(0, radius + 1),
    );
    expect(result.distanceByGeoid[result.includedGeoids.at(-1)!]).toBe(radius);
  });

  it("keeps a Queen island explicit and never creates fallback neighbors", () => {
    const result = queenNeighborhood(chain, "island", 5);
    expect(result.isIsland).toBe(true);
    expect(result.includedGeoids).toEqual(["island"]);
    expect(result.neighborGeoids).toEqual([]);
  });

  it("rejects invalid radii and missing graph references", () => {
    expect(() => queenNeighborhood(chain, "A", 0)).toThrow(/1 through 5/);
    expect(() =>
      queenNeighborhood({ A: ["missing"] }, "A", 1),
    ).toThrow(/unknown GEOID missing/);
  });

  it("reports malformed adjacency instead of silently repairing it", () => {
    expect(validateQueenAdjacency({ A: ["B", "B"], B: [] })).toEqual([
      { kind: "asymmetric_edge", geoid: "A", neighborGeoid: "B" },
      { kind: "duplicate_neighbor", geoid: "A", neighborGeoid: "B" },
      { kind: "asymmetric_edge", geoid: "A", neighborGeoid: "B" },
    ]);
  });

  it("caches by artifact set, GEOID, and radius", () => {
    const getNeighborhood = createNeighborhoodCache("artifact-a", chain);
    expect(getNeighborhood("A", 3)).toBe(getNeighborhood("A", 3));
    expect(getNeighborhood("A", 2)).not.toBe(getNeighborhood("A", 3));
  });
});

describe("neighborhood metric comparisons", () => {
  it("uses the contract symmetric relative-difference formula", () => {
    expect(symmetricRelativeDifference(12, 8)).toBeCloseTo(0.2, 9);
  });

  it("returns median, rank, availability, and a nullable conventional percent", () => {
    const summary = summarizeNeighborhoodMetric(
      "A",
      ["A", "B", "C", "D"],
      { A: 4, B: 0, C: null, D: 2 },
    );
    expect(summary).toMatchObject({
      activeValue: 4,
      neighborhoodMedian: 2,
      absoluteDifference: 2,
      relativeDifferencePct: 100,
      activeRank: 1,
      includedTractCount: 4,
      availableTractCount: 3,
    });

    expect(
      summarizeNeighborhoodMetric("A", ["A", "B"], { A: 0, B: 0 })
        ?.relativeDifferencePct,
    ).toBeNull();
    expect(
      summarizeNeighborhoodMetric("A", ["A"], { A: null }),
    ).toBeNull();
  });
});
