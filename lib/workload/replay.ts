import { survivalAtAge } from "./curve";
import type {
  ClosureCurvePoint,
  OpenByAge,
  ReplayPeriod,
  WorkloadAgeBucket,
} from "./types";

export const DEFAULT_REPLAY_RUNOFF_PERIODS = 6;

const AGE_BUCKETS: readonly [
  WorkloadAgeBucket,
  number,
  number,
][] = [
  ["0_30", 0, 30],
  ["31_60", 31, 60],
  ["61_90", 61, 90],
  ["91_180", 91, 180],
  ["181_360", 181, 360],
  ["361_plus", 361, Number.POSITIVE_INFINITY],
];

export interface ReplayInput {
  readonly periodArrivals: readonly number[];
  readonly closureCurve: readonly ClosureCurvePoint[];
  readonly periodDays: number;
  readonly runoffPeriods?: number;
}

export function replayWorkload(input: ReplayInput): readonly ReplayPeriod[] {
  if (input.periodArrivals.length === 0) {
    throw new RangeError("Replay requires at least one arrival period.");
  }
  if (!Number.isInteger(input.periodDays) || input.periodDays <= 0) {
    throw new RangeError("periodDays must be a positive integer.");
  }
  const runoffPeriods = input.runoffPeriods ?? DEFAULT_REPLAY_RUNOFF_PERIODS;
  if (!Number.isInteger(runoffPeriods) || runoffPeriods < 0) {
    throw new RangeError("runoffPeriods must be a nonnegative integer.");
  }
  for (const arrival of input.periodArrivals) {
    if (!Number.isFinite(arrival) || arrival < 0) {
      throw new TypeError("Arrival values must be nonnegative and finite.");
    }
  }

  const replay: ReplayPeriod[] = [];
  let priorOpen = 0;

  for (
    let periodIndex = 0;
    periodIndex < input.periodArrivals.length + runoffPeriods;
    periodIndex += 1
  ) {
    const newRequests = input.periodArrivals[periodIndex] ?? 0;
    const openByAge = emptyAgeBuckets();

    for (
      let cohortIndex = 0;
      cohortIndex < input.periodArrivals.length && cohortIndex <= periodIndex;
      cohortIndex += 1
    ) {
      const ageDays = (periodIndex - cohortIndex + 1) * input.periodDays;
      const cohortOpen =
        input.periodArrivals[cohortIndex] *
        survivalAtAge(input.closureCurve, ageDays);
      openByAge[bucketForAge(ageDays)] += cohortOpen;
    }

    const expectedOpenBalance = Object.values(openByAge).reduce(
      (total, value) => total + value,
      0,
    );
    const rawExpectedClosures = priorOpen + newRequests - expectedOpenBalance;
    if (rawExpectedClosures < -1e-9) {
      throw new Error(
        "Replay produced negative expected recorded closures; the closure curve is invalid.",
      );
    }
    const expectedRecordedClosures = Math.max(rawExpectedClosures, 0);
    const netOpenChange = expectedOpenBalance - priorOpen;

    replay.push({
      periodIndex,
      newRequests,
      expectedRecordedClosures,
      expectedOpenBalance,
      netOpenChange,
      openByAge,
    });
    priorOpen = expectedOpenBalance;
  }

  return replay;
}

function bucketForAge(ageDays: number): WorkloadAgeBucket {
  const match = AGE_BUCKETS.find(
    ([, lower, upper]) => ageDays >= lower && ageDays <= upper,
  );
  if (!match) throw new Error(`No workload age bucket contains day ${ageDays}.`);
  return match[0];
}

function emptyAgeBuckets(): Record<WorkloadAgeBucket, number> {
  return {
    "0_30": 0,
    "31_60": 0,
    "61_90": 0,
    "91_180": 0,
    "181_360": 0,
    "361_plus": 0,
  } satisfies OpenByAge;
}
