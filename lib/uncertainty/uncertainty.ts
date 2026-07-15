import {
  MAX_CLOSURE_SHIFT_POINTS,
  MAX_DEMAND_CHANGE_PCT,
  MIN_CLOSURE_SHIFT_POINTS,
  MIN_DEMAND_CHANGE_PCT,
  quantile,
  selectIndices,
  type WorkloadDomainKey,
} from "@/lib/workload";

import { deterministicRandom, sampleBeta, stableSeed32 } from "./random";

export interface UncertaintyRequest {
  readonly artifactSetId: string;
  readonly baseSeed: number;
  readonly geoids: readonly string[];
  readonly domainKey: WorkloadDomainKey;
  readonly ageDays: number;
  readonly periodArrivals: readonly number[];
  readonly fullPeriodIndices: readonly number[];
  readonly knownTiming: number;
  readonly closedByAge: number;
  readonly minimumKnownTimingSample: number;
  readonly draws: number;
  readonly demandChangePct: number;
  readonly closureCurveShiftPoints: number;
}

export interface UncertaintySummary {
  readonly seed: number;
  readonly draws: number;
  readonly openMedian: number;
  readonly open80: readonly [number, number];
  readonly open95: readonly [number, number];
  readonly closureMedianPct: number;
  readonly closure80Pct: readonly [number, number];
  readonly closure95Pct: readonly [number, number];
}

/**
 * Empirical complete-period resampling plus a Jeffreys beta posterior.
 * The caller should run this pure CPU function in the workload Web Worker.
 */
export function deterministicUncertainty(
  request: UncertaintyRequest,
): UncertaintySummary | null {
  validateRequest(request);
  if (request.knownTiming < request.minimumKnownTimingSample) return null;

  // Aggregate first and then select complete periods. This retains the observed
  // cross-tract period pattern and guarantees that the six-day partial period is
  // never sampled.
  const fullPeriodArrivals = selectIndices(
    request.periodArrivals,
    request.fullPeriodIndices,
  );
  const seed = uncertaintySeed(request);
  const random = deterministicRandom(seed);
  const demandMultiplier = 1 + request.demandChangePct / 100;
  const closureShift = request.closureCurveShiftPoints / 100;
  const openDraws = Array<number>(request.draws);
  const closureDraws = Array<number>(request.draws);

  for (let draw = 0; draw < request.draws; draw += 1) {
    const arrival =
      fullPeriodArrivals[Math.floor(random() * fullPeriodArrivals.length)] *
      demandMultiplier;
    const baselineClosure = sampleBeta(
      request.closedByAge + 0.5,
      request.knownTiming - request.closedByAge + 0.5,
      random,
    );
    const closureProbability = clamp(baselineClosure + closureShift, 0, 1);
    closureDraws[draw] = closureProbability;
    openDraws[draw] = arrival * (1 - closureProbability);
  }

  return {
    seed,
    draws: request.draws,
    openMedian: quantile(openDraws, 0.5),
    open80: [quantile(openDraws, 0.1), quantile(openDraws, 0.9)],
    open95: [quantile(openDraws, 0.025), quantile(openDraws, 0.975)],
    closureMedianPct: 100 * quantile(closureDraws, 0.5),
    closure80Pct: [
      100 * quantile(closureDraws, 0.1),
      100 * quantile(closureDraws, 0.9),
    ],
    closure95Pct: [
      100 * quantile(closureDraws, 0.025),
      100 * quantile(closureDraws, 0.975),
    ],
  };
}

export function uncertaintySeed(request: UncertaintyRequest): number {
  const geoids = [...new Set(request.geoids)].sort(compareGeoids);
  const token = [
    request.baseSeed,
    request.artifactSetId,
    geoids.join(","),
    request.domainKey,
    request.ageDays,
    canonicalNumber(request.demandChangePct),
    canonicalNumber(request.closureCurveShiftPoints),
  ].join("|");
  return stableSeed32(token);
}

function validateRequest(request: UncertaintyRequest): void {
  if (!request.artifactSetId || request.geoids.length === 0) {
    throw new Error("Uncertainty requires an artifact set and at least one GEOID.");
  }
  if (!Number.isInteger(request.baseSeed) || request.baseSeed < 0) {
    throw new RangeError("baseSeed must be a nonnegative integer.");
  }
  if (!Number.isInteger(request.ageDays) || request.ageDays <= 0) {
    throw new RangeError("ageDays must be a positive integer.");
  }
  if (!Number.isInteger(request.knownTiming) || request.knownTiming < 0) {
    throw new RangeError("knownTiming must be a nonnegative integer.");
  }
  if (
    !Number.isInteger(request.closedByAge) ||
    request.closedByAge < 0 ||
    request.closedByAge > request.knownTiming
  ) {
    throw new RangeError("closedByAge must be an integer within its denominator.");
  }
  if (
    !Number.isInteger(request.minimumKnownTimingSample) ||
    request.minimumKnownTimingSample <= 0
  ) {
    throw new RangeError("minimumKnownTimingSample must be a positive integer.");
  }
  if (!Number.isInteger(request.draws) || request.draws <= 0) {
    throw new RangeError("draws must be a positive integer.");
  }
  if (
    !Number.isFinite(request.demandChangePct) ||
    request.demandChangePct < MIN_DEMAND_CHANGE_PCT ||
    request.demandChangePct > MAX_DEMAND_CHANGE_PCT
  ) {
    throw new RangeError("Demand change is outside the supported range.");
  }
  if (
    !Number.isFinite(request.closureCurveShiftPoints) ||
    request.closureCurveShiftPoints < MIN_CLOSURE_SHIFT_POINTS ||
    request.closureCurveShiftPoints > MAX_CLOSURE_SHIFT_POINTS
  ) {
    throw new RangeError("Closure shift is outside the supported range.");
  }
  if (request.periodArrivals.length === 0 || request.fullPeriodIndices.length === 0) {
    throw new Error("Uncertainty requires arrival periods and complete-period indices.");
  }
  for (const arrival of request.periodArrivals) {
    if (!Number.isFinite(arrival) || arrival < 0) {
      throw new TypeError("Arrival values must be nonnegative and finite.");
    }
  }
}

function canonicalNumber(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized.toFixed(6).replace(/(?:\.0+|(?<fraction>\.\d*?)0+)$/, "$<fraction>");
}

function compareGeoids(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
