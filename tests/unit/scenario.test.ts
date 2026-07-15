import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  compareScenarioMembership,
  createScenarioIndex,
  explainScenarioTract,
  lookupScenario,
  scenarioId,
  type SelectionScenario,
} from "@/lib/scenario";
import {
  rankTracts,
  scoreTract,
  type TractScoringProperties,
} from "@/lib/scoring";

interface GeoJsonFixture {
  readonly features: ReadonlyArray<{
    readonly properties: TractScoringProperties;
  }>;
}

interface ScenarioFixture {
  readonly scenarios: readonly SelectionScenario[];
}

function loadValidatedFixtures(): {
  tracts: readonly TractScoringProperties[];
  scenarios: readonly SelectionScenario[];
} {
  const geojson = JSON.parse(
    readFileSync("public/data/tracts.geojson", "utf8"),
  ) as GeoJsonFixture;
  const scenarioArtifact = JSON.parse(
    readFileSync("public/data/scenarios.json", "utf8"),
  ) as ScenarioFixture;
  return {
    tracts: geojson.features.map((feature) => feature.properties),
    scenarios: scenarioArtifact.scenarios,
  };
}

describe("scenario lookup", () => {
  it("uses the exact exported ID convention and rejects unsupported alpha", () => {
    expect(
      scenarioId({
        scalingMode: "rank_balanced",
        domainKey: "housing_building",
        k: 100,
        alphaIntensity: 0.5,
      }),
    ).toBe("rank_balanced-housing_building-k100-a050");
    expect(
      scenarioId({
        scalingMode: "rank_balanced",
        domainKey: "housing_building",
        k: 100,
        alphaIntensity: 0.55,
      }),
    ).toBeNull();
  });

  it("indexes and finds a validated scenario without generating a new one", () => {
    const { scenarios } = loadValidatedFixtures();
    const index = createScenarioIndex(scenarios);
    expect(index.size).toBe(550);
    expect(
      lookupScenario(index, {
        scalingMode: "magnitude_sensitive",
        domainKey: "noise",
        k: 25,
        alphaIntensity: 0.8,
      })?.id,
    ).toBe("magnitude_sensitive-noise-k25-a080");
  });
});

describe("deterministic scenario scoring", () => {
  it("recomputes every exported membership and cutoff order exactly", () => {
    const { scenarios, tracts } = loadValidatedFixtures();

    for (const scenario of scenarios) {
      const ranked = rankTracts(tracts, scenario);
      expect(ranked.slice(0, scenario.k).map((row) => row.geoid)).toEqual(
        scenario.selection.rankedSelectedGeoids,
      );
      expect(ranked[scenario.k - 1].score).toBeCloseTo(
        scenario.selection.selectionCutoffScore,
        12,
      );
    }
  });

  it("uses 1 - alpha in the score, preserving exported floating-point ties", () => {
    const { scenarios, tracts } = loadValidatedFixtures();
    const scenario = scenarios.find(
      ({ id }) => id === "rank_balanced-noise-k100-a080",
    )!;
    const ranked = rankTracts(tracts, scenario);
    const left = ranked.findIndex(({ geoid }) => geoid === "36081126500");
    const right = ranked.findIndex(({ geoid }) => geoid === "36047026300");
    expect(left).toBeLessThan(right);
  });

  it("does not manufacture a score for an allocation-ineligible tract", () => {
    const { tracts } = loadValidatedFixtures();
    const ineligible = tracts.find((tract) => !tract.allocationEligible)!;
    expect(
      scoreTract(ineligible, {
        scalingMode: "rank_balanced",
        domainKey: "noise",
        alphaIntensity: 0.5,
      }),
    ).toBeNull();
  });
});

describe("scenario comparison and explanation", () => {
  it("distinguishes unchanged membership from unchanged rank order", () => {
    const { scenarios } = loadValidatedFixtures();
    const left = scenarios.find(
      ({ id }) => id === "magnitude_sensitive-noise-k25-a070",
    )!;
    const right = scenarios.find(
      ({ id }) => id === "magnitude_sensitive-noise-k25-a080",
    )!;
    const comparison = compareScenarioMembership(right, left);
    expect(comparison.membershipUnchanged).toBe(true);
    expect(comparison.enteredGeoids).toEqual([]);
    expect(comparison.exitedGeoids).toEqual([]);
  });

  it("returns null deterministic fields for an ineligible any-tract explanation", () => {
    const { scenarios, tracts } = loadValidatedFixtures();
    const tract = tracts.find((candidate) => !candidate.allocationEligible)!;
    const explanation = explainScenarioTract(scenarios[0], tract, tracts);
    expect(explanation).toMatchObject({
      allocationEligible: false,
      score: null,
      rank: null,
      isSelected: false,
    });
  });
});
