import type { DomainKey } from "@/lib/scoring";

export type WorkloadDomainKey = DomainKey;

export type WorkloadSampleStatus =
  | "no_requests"
  | "no_known_timing"
  | "insufficient_sample"
  | "sufficient";

export interface ExportedCheckpointUncertainty {
  readonly openMedian: number;
  readonly open80: readonly [number, number];
  readonly open95: readonly [number, number];
  readonly closureMedianPct: number;
  readonly closure80Pct: readonly [number, number];
  readonly closure95Pct: readonly [number, number];
}

/** Exact per-tract/domain numerical fields exported in workload.json. */
export interface WorkloadTractRecord {
  readonly requestCount: number;
  readonly periodArrivals: readonly number[];
  readonly meanFullPeriodArrivals: number;
  readonly medianFullPeriodArrivals: number;
  readonly p10FullPeriodArrivals: number;
  readonly p90FullPeriodArrivals: number;
  readonly knownTiming: number;
  readonly validClosures: number;
  readonly closedByAge: readonly number[];
  readonly sampleStatus: WorkloadSampleStatus;
  readonly supportsTractSpecificCurve: boolean;
  readonly supportsTractSpecificReplay: boolean;
  readonly curveSource: "tract_observed" | null;
  readonly uncertainty: Readonly<{
    readonly "30": ExportedCheckpointUncertainty | null;
    readonly "180": ExportedCheckpointUncertainty | null;
  }>;
}

export type WorkloadTractIndex = Readonly<
  Record<
    string,
    Readonly<Partial<Record<WorkloadDomainKey, WorkloadTractRecord>>>
  >
>;

export interface ArrivalPeriod {
  readonly index: number;
  readonly start: string;
  readonly periodEnd: string;
  readonly observedEnd: string;
  readonly daysObserved: number;
  readonly isFullPeriod: boolean;
}

export interface WorkloadModelConfig {
  readonly periods: readonly ArrivalPeriod[];
  readonly fullPeriodIndices: readonly number[];
  readonly ageCheckpointsDays: readonly number[];
  readonly minimumKnownTimingSample: number;
  readonly periodDays: number;
  readonly replayRunoffPeriods?: number;
}

export interface WorkloadAggregate {
  readonly kind: "aggregate";
  readonly domainKey: WorkloadDomainKey;
  readonly geoids: readonly string[];
  readonly tractCount: number;
  readonly requestCount: number;
  readonly periodArrivals: readonly number[];
  readonly fullPeriodArrivals: readonly number[];
  readonly meanFullPeriodArrivals: number;
  readonly medianFullPeriodArrivals: number;
  readonly p10FullPeriodArrivals: number;
  readonly p90FullPeriodArrivals: number;
  readonly knownTiming: number;
  readonly validClosures: number;
  readonly closedByAge: readonly number[];
  readonly sampleStatus: WorkloadSampleStatus;
  readonly supportsCurve: boolean;
  readonly supportsReplay: boolean;
}

export interface EmptyWorkloadScope {
  readonly kind: "empty_scope";
  readonly domainKey: WorkloadDomainKey;
  readonly geoids: readonly [];
}

export type WorkloadScopeAggregation = WorkloadAggregate | EmptyWorkloadScope;

export interface ClosureCurvePoint {
  readonly ageDays: number;
  readonly observedClosedByAge: number;
  readonly baselineClosureProbability: number;
  readonly closureProbability: number;
  readonly survivalProbability: number;
}

export type WorkloadAgeBucket =
  | "0_30"
  | "31_60"
  | "61_90"
  | "91_180"
  | "181_360"
  | "361_plus";

export type OpenByAge = Readonly<Record<WorkloadAgeBucket, number>>;

export interface ReplayPeriod {
  readonly periodIndex: number;
  readonly newRequests: number;
  readonly expectedRecordedClosures: number;
  readonly expectedOpenBalance: number;
  readonly netOpenChange: number;
  readonly openByAge: OpenByAge;
}

export interface WorkloadAssumptions {
  readonly demandChangePct: number;
  readonly closureCurveShiftPoints: number;
}

export interface WorkloadEvaluation {
  readonly assumptions: WorkloadAssumptions;
  readonly sampleStatus: WorkloadSampleStatus;
  readonly periodArrivals: readonly number[];
  readonly fullPeriodArrivals: readonly number[];
  readonly meanFullPeriodArrivals: number;
  readonly closureCurve: readonly ClosureCurvePoint[] | null;
  readonly replay: readonly ReplayPeriod[] | null;
  readonly cohortOpenAt30Days: number | null;
  readonly cohortOpenAt180Days: number | null;
}
