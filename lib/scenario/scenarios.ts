import { rankTracts, type TractScoringProperties } from "@/lib/scoring";

import {
  ALPHA_TENTHS,
  COMPARABLE_SCENARIO_METRICS,
  PRIORITY_PORTFOLIO_SIZES,
  type AlphaTenths,
  type ScenarioMembershipComparison,
  type ScenarioQuery,
  type ScenarioScoreExplanation,
  type SelectionScenario,
} from "./types";

export type ScenarioIndex = ReadonlyMap<string, SelectionScenario>;

export function alphaToTenths(alphaIntensity: number): AlphaTenths | null {
  if (!Number.isFinite(alphaIntensity)) return null;
  const rounded = Math.round(alphaIntensity * 10);
  if (
    Math.abs(alphaIntensity * 10 - rounded) > 1e-9 ||
    !ALPHA_TENTHS.includes(rounded as AlphaTenths)
  ) {
    return null;
  }
  return rounded as AlphaTenths;
}

export function scenarioId(query: ScenarioQuery): string | null {
  const alphaTenths = alphaToTenths(query.alphaIntensity);
  if (
    alphaTenths === null ||
    !PRIORITY_PORTFOLIO_SIZES.includes(query.k)
  ) {
    return null;
  }

  return `${query.scalingMode}-${query.domainKey}-k${query.k}-a${String(
    alphaTenths * 10,
  ).padStart(3, "0")}`;
}

export function createScenarioIndex(
  scenarios: readonly SelectionScenario[],
): ScenarioIndex {
  const index = new Map<string, SelectionScenario>();

  for (const scenario of scenarios) {
    const expectedId = scenarioId(scenario);
    if (expectedId === null || expectedId !== scenario.id) {
      throw new Error(`Scenario ID does not match its controls: ${scenario.id}`);
    }
    if (index.has(scenario.id)) {
      throw new Error(`Duplicate scenario ID: ${scenario.id}`);
    }
    if (scenario.selection.rankedSelectedGeoids.length !== scenario.k) {
      throw new Error(`Scenario ${scenario.id} does not contain exactly K tracts.`);
    }
    if (
      new Set(scenario.selection.rankedSelectedGeoids).size !==
      scenario.selection.rankedSelectedGeoids.length
    ) {
      throw new Error(`Scenario ${scenario.id} contains duplicate GEOIDs.`);
    }
    index.set(scenario.id, scenario);
  }

  return index;
}

export function lookupScenario(
  index: ScenarioIndex,
  query: ScenarioQuery,
): SelectionScenario | null {
  const id = scenarioId(query);
  return id === null ? null : (index.get(id) ?? null);
}

export function compareScenarioMembership(
  current: SelectionScenario,
  pinned: SelectionScenario,
): ScenarioMembershipComparison {
  const currentGeoids = current.selection.rankedSelectedGeoids;
  const pinnedGeoids = pinned.selection.rankedSelectedGeoids;
  const currentSet = new Set(currentGeoids);
  const pinnedSet = new Set(pinnedGeoids);
  const enteredGeoids = currentGeoids.filter((geoid) => !pinnedSet.has(geoid));
  const exitedGeoids = pinnedGeoids.filter((geoid) => !currentSet.has(geoid));
  const sharedGeoids = currentGeoids.filter((geoid) => pinnedSet.has(geoid));
  const metricDeltas = Object.fromEntries(
    COMPARABLE_SCENARIO_METRICS.map((key) => [
      key,
      current.metrics[key] - pinned.metrics[key],
    ]),
  );

  return {
    sharedGeoids,
    enteredGeoids,
    exitedGeoids,
    membershipUnchanged: enteredGeoids.length === 0 && exitedGeoids.length === 0,
    rankOrderUnchanged:
      currentGeoids.length === pinnedGeoids.length &&
      currentGeoids.every((geoid, index) => geoid === pinnedGeoids[index]),
    metricDeltas,
  };
}

export function explainScenarioTract(
  scenario: SelectionScenario,
  tract: TractScoringProperties,
  allTracts: readonly TractScoringProperties[],
): ScenarioScoreExplanation {
  const alphaLowerIncome = 1 - scenario.alphaIntensity;

  if (!tract.allocationEligible) {
    return {
      geoid: tract.geoid,
      allocationEligible: false,
      allocationIneligibilityReason: tract.allocationIneligibilityReason,
      scalingMode: scenario.scalingMode,
      domainKey: scenario.domainKey,
      alphaIntensity: scenario.alphaIntensity,
      alphaLowerIncome,
      intensityValue: null,
      lowerIncomeValue: null,
      intensityContribution: null,
      lowerIncomeContribution: null,
      score: null,
      rank: null,
      selectionCutoffScore: scenario.selection.selectionCutoffScore,
      distanceFromSelectionCutoff: null,
      isSelected: false,
    };
  }

  const ranked = rankTracts(allTracts, {
    domainKey: scenario.domainKey,
    scalingMode: scenario.scalingMode,
    alphaIntensity: scenario.alphaIntensity,
  });
  const row = ranked.find((candidate) => candidate.geoid === tract.geoid);
  if (!row) {
    throw new Error(`Eligible tract ${tract.geoid} is absent from the scoring universe.`);
  }

  return {
    geoid: tract.geoid,
    allocationEligible: true,
    allocationIneligibilityReason: null,
    scalingMode: scenario.scalingMode,
    domainKey: scenario.domainKey,
    alphaIntensity: row.alphaIntensity,
    alphaLowerIncome: row.alphaLowerIncome,
    intensityValue: row.intensityValue,
    lowerIncomeValue: row.lowerIncomeValue,
    intensityContribution: row.intensityContribution,
    lowerIncomeContribution: row.lowerIncomeContribution,
    score: row.score,
    rank: row.rank,
    selectionCutoffScore: scenario.selection.selectionCutoffScore,
    distanceFromSelectionCutoff:
      row.score - scenario.selection.selectionCutoffScore,
    isSelected: scenario.selection.rankedSelectedGeoids.includes(tract.geoid),
  };
}
