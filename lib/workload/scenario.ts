import {
  applyClosureCurveShift,
  observedClosureCurve,
  survivalAtAge,
} from "./curve";
import { replayWorkload } from "./replay";
import { mean, selectIndices } from "./statistics";
import type {
  WorkloadAggregate,
  WorkloadAssumptions,
  WorkloadEvaluation,
  WorkloadModelConfig,
} from "./types";

export const MIN_DEMAND_CHANGE_PCT = -30;
export const MAX_DEMAND_CHANGE_PCT = 50;

export function applyDemandChange(
  periodArrivals: readonly number[],
  demandChangePct: number,
): readonly number[] {
  if (
    !Number.isFinite(demandChangePct) ||
    demandChangePct < MIN_DEMAND_CHANGE_PCT ||
    demandChangePct > MAX_DEMAND_CHANGE_PCT
  ) {
    throw new RangeError("Demand change must be from -30% through +50%.");
  }
  const multiplier = 1 + demandChangePct / 100;
  return periodArrivals.map((arrival) => {
    if (!Number.isFinite(arrival) || arrival < 0) {
      throw new TypeError("Arrival values must be nonnegative and finite.");
    }
    return arrival * multiplier;
  });
}

export function evaluateWorkload(
  aggregate: WorkloadAggregate,
  config: WorkloadModelConfig,
  assumptions: WorkloadAssumptions,
): WorkloadEvaluation {
  const periodArrivals = applyDemandChange(
    aggregate.periodArrivals,
    assumptions.demandChangePct,
  );
  const fullPeriodArrivals = selectIndices(
    periodArrivals,
    config.fullPeriodIndices,
  );
  const meanFullPeriodArrivals = mean(fullPeriodArrivals);
  const baselineCurve = observedClosureCurve(aggregate, config);

  if (!baselineCurve) {
    return {
      assumptions,
      sampleStatus: aggregate.sampleStatus,
      periodArrivals,
      fullPeriodArrivals,
      meanFullPeriodArrivals,
      closureCurve: null,
      replay: null,
      cohortOpenAt30Days: null,
      cohortOpenAt180Days: null,
    };
  }

  const closureCurve = applyClosureCurveShift(
    baselineCurve,
    assumptions.closureCurveShiftPoints,
  );
  const replay = replayWorkload({
    periodArrivals,
    closureCurve,
    periodDays: config.periodDays,
    runoffPeriods: config.replayRunoffPeriods,
  });

  return {
    assumptions,
    sampleStatus: aggregate.sampleStatus,
    periodArrivals,
    fullPeriodArrivals,
    meanFullPeriodArrivals,
    closureCurve,
    replay,
    cohortOpenAt30Days:
      meanFullPeriodArrivals * survivalAtAge(closureCurve, 30),
    cohortOpenAt180Days:
      meanFullPeriodArrivals * survivalAtAge(closureCurve, 180),
  };
}
