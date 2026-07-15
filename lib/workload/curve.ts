import type {
  ClosureCurvePoint,
  WorkloadAggregate,
  WorkloadModelConfig,
} from "./types";

export const MIN_CLOSURE_SHIFT_POINTS = -15;
export const MAX_CLOSURE_SHIFT_POINTS = 15;

export function observedClosureCurve(
  aggregate: WorkloadAggregate,
  config: WorkloadModelConfig,
): readonly ClosureCurvePoint[] | null {
  if (aggregate.sampleStatus !== "sufficient") return null;
  if (aggregate.knownTiming < config.minimumKnownTimingSample) {
    throw new Error("A sufficient aggregate is below the configured sample minimum.");
  }
  if (aggregate.closedByAge.length !== config.ageCheckpointsDays.length) {
    throw new Error("Closed-by-age and checkpoint arrays have different lengths.");
  }

  const curve = config.ageCheckpointsDays.map((ageDays, index) => {
    const observedClosedByAge = aggregate.closedByAge[index];
    const closureProbability = observedClosedByAge / aggregate.knownTiming;
    return {
      ageDays,
      observedClosedByAge,
      baselineClosureProbability: closureProbability,
      closureProbability,
      survivalProbability: 1 - closureProbability,
    };
  });
  assertMonotoneClosureCurve(curve);
  return curve;
}

export function applyClosureCurveShift(
  curve: readonly ClosureCurvePoint[],
  shiftPercentagePoints: number,
): readonly ClosureCurvePoint[] {
  if (
    !Number.isFinite(shiftPercentagePoints) ||
    shiftPercentagePoints < MIN_CLOSURE_SHIFT_POINTS ||
    shiftPercentagePoints > MAX_CLOSURE_SHIFT_POINTS
  ) {
    throw new RangeError("Closure-curve shift must be from -15 to +15 points.");
  }
  assertMonotoneClosureCurve(curve);
  const delta = shiftPercentagePoints / 100;
  const shifted = curve.map((point) => {
    const closureProbability = clamp(point.baselineClosureProbability + delta, 0, 1);
    return {
      ...point,
      closureProbability,
      survivalProbability: 1 - closureProbability,
    };
  });
  assertMonotoneClosureCurve(shifted);
  return shifted;
}

export function survivalAtAge(
  curve: readonly ClosureCurvePoint[],
  ageDays: number,
): number {
  if (curve.length === 0) {
    throw new RangeError("A closure curve must contain at least one checkpoint.");
  }
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    throw new RangeError("Request age must be a nonnegative finite number.");
  }
  const point = curve.find((candidate) => candidate.ageDays >= ageDays) ?? curve.at(-1)!;
  return point.survivalProbability;
}

export function assertMonotoneClosureCurve(
  curve: readonly ClosureCurvePoint[],
): void {
  let priorAge = -Infinity;
  let priorProbability = -Infinity;
  for (const point of curve) {
    if (!Number.isFinite(point.ageDays) || point.ageDays <= priorAge) {
      throw new Error("Closure-curve ages must be finite and strictly increasing.");
    }
    if (
      !Number.isFinite(point.closureProbability) ||
      point.closureProbability < 0 ||
      point.closureProbability > 1
    ) {
      throw new Error("Closure probabilities must remain in [0, 1].");
    }
    if (point.closureProbability < priorProbability) {
      throw new Error("Closure probabilities must be monotone by request age.");
    }
    priorAge = point.ageDays;
    priorProbability = point.closureProbability;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
