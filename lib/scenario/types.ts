import type {
  DomainKey,
  ScalingMode,
  TractScoringProperties,
} from "@/lib/scoring";

export const PRIORITY_PORTFOLIO_SIZES = [25, 50, 100, 150, 200] as const;
export const ALPHA_TENTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type PriorityPortfolioSize = (typeof PRIORITY_PORTFOLIO_SIZES)[number];
export type AlphaTenths = (typeof ALPHA_TENTHS)[number];

export interface ScenarioQuery {
  readonly scalingMode: ScalingMode;
  readonly domainKey: DomainKey;
  readonly k: PriorityPortfolioSize;
  readonly alphaIntensity: number;
}

export interface ScenarioUncertainty {
  readonly openMedian: number;
  readonly open80: readonly [number, number];
  readonly open95: readonly [number, number];
  readonly closureMedianPct: number;
  readonly closure80Pct: readonly [number, number];
  readonly closure95Pct: readonly [number, number];
}

export interface ScenarioMetrics {
  readonly selectedComplaintIntensitySum: number;
  readonly intensityRetentionVsRateMaxPct: number;
  readonly selectedQ1TractSharePct: number;
  readonly q1ShareOfSelectedIntensityPct: number;
  readonly selectedMappedComplaintCount: number;
  readonly mappedComplaintVolumeCapturedPct: number;
  readonly selectedNotClosedBy30dCount: number;
  readonly cityNotClosedBy30dCapturedPct: number;
  readonly selectedNotClosedBy180dCount: number;
  readonly cityNotClosedBy180dCapturedPct: number;
  readonly pooledRecordedClosureWithin30dPct: number;
  readonly pooledRecordedClosureWithin180dPct: number;
  readonly selectedMean30dArrivals: number;
  readonly selectedOpenAt30d: number;
  readonly selectedOpenAt180d: number;
  readonly selectedOpenAt30dSampleStatus: "sufficient";
  readonly selectedOpenAt180dSampleStatus: "sufficient";
  readonly selectedOpenAt30dUncertainty: ScenarioUncertainty;
  readonly selectedOpenAt180dUncertainty: ScenarioUncertainty;
  readonly selectedKnownTimingOutcomes30d: number;
  readonly selectedKnownTimingOutcomes180d: number;
  readonly selectedPopulation: number;
  readonly cityPopulationInSelectedTractsPct: number;
  readonly meanSelectedTractMedianIncome: number;
  readonly medianSelectedTractMedianIncome: number;
}

export interface ScenarioGeography {
  readonly selectedTractCountByBorough: Readonly<Record<string, number>>;
  readonly selectedPopulationByBorough: Readonly<Record<string, number>>;
  readonly boroughPopulationInSelectedTractsPct: Readonly<Record<string, number>>;
}

export interface SelectionScenario {
  readonly id: string;
  readonly scalingMode: ScalingMode;
  readonly domainKey: DomainKey;
  readonly domainLabel: string;
  readonly k: PriorityPortfolioSize;
  readonly alphaIntensity: number;
  readonly alphaLowerIncome: number;
  readonly targetMetric: string;
  readonly countMetric: string;
  readonly selection: {
    readonly eligibleTractCount: number;
    readonly selectionCutoffScore: number;
    readonly rankedSelectedGeoids: readonly string[];
  };
  readonly metrics: ScenarioMetrics;
  readonly geography: ScenarioGeography;
}

export interface ScenarioMembershipComparison {
  readonly sharedGeoids: readonly string[];
  readonly enteredGeoids: readonly string[];
  readonly exitedGeoids: readonly string[];
  readonly membershipUnchanged: boolean;
  readonly rankOrderUnchanged: boolean;
  readonly metricDeltas: Readonly<Partial<Record<ComparableScenarioMetric, number>>>;
}

export const COMPARABLE_SCENARIO_METRICS = [
  "selectedComplaintIntensitySum",
  "intensityRetentionVsRateMaxPct",
  "selectedQ1TractSharePct",
  "q1ShareOfSelectedIntensityPct",
  "selectedMappedComplaintCount",
  "mappedComplaintVolumeCapturedPct",
  "selectedNotClosedBy30dCount",
  "cityNotClosedBy30dCapturedPct",
  "selectedNotClosedBy180dCount",
  "cityNotClosedBy180dCapturedPct",
  "pooledRecordedClosureWithin30dPct",
  "pooledRecordedClosureWithin180dPct",
  "selectedMean30dArrivals",
  "selectedOpenAt30d",
  "selectedOpenAt180d",
  "selectedKnownTimingOutcomes30d",
  "selectedKnownTimingOutcomes180d",
  "selectedPopulation",
  "cityPopulationInSelectedTractsPct",
  "meanSelectedTractMedianIncome",
  "medianSelectedTractMedianIncome",
] as const satisfies readonly (keyof ScenarioMetrics)[];

export type ComparableScenarioMetric =
  (typeof COMPARABLE_SCENARIO_METRICS)[number];

export interface ScenarioScoreExplanation {
  readonly geoid: string;
  readonly allocationEligible: boolean;
  readonly allocationIneligibilityReason: string | null;
  readonly scalingMode: ScalingMode;
  readonly domainKey: DomainKey;
  readonly alphaIntensity: number;
  readonly alphaLowerIncome: number;
  readonly intensityValue: number | null;
  readonly lowerIncomeValue: number | null;
  readonly intensityContribution: number | null;
  readonly lowerIncomeContribution: number | null;
  readonly score: number | null;
  readonly rank: number | null;
  readonly selectionCutoffScore: number;
  readonly distanceFromSelectionCutoff: number | null;
  readonly isSelected: boolean;
}

export type ScenarioScoringTract = TractScoringProperties;
