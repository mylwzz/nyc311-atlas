import { workloadSampleStatus, assertNonnegativeInteger } from "./sample-status";
import { mean, median, quantile, selectIndices } from "./statistics";
import type {
  WorkloadAggregate,
  WorkloadDomainKey,
  WorkloadModelConfig,
  WorkloadScopeAggregation,
  WorkloadTractIndex,
  WorkloadTractRecord,
} from "./types";

export interface GeoidWorkloadRecord {
  readonly geoid: string;
  readonly record: WorkloadTractRecord;
}

export function aggregateWorkloadScope(
  tracts: WorkloadTractIndex,
  geoids: readonly string[],
  domainKey: WorkloadDomainKey,
  config: WorkloadModelConfig,
): WorkloadScopeAggregation {
  const normalizedGeoids = [...new Set(geoids)].sort(compareGeoids);
  if (normalizedGeoids.length === 0) {
    return { kind: "empty_scope", domainKey, geoids: [] };
  }

  const records = normalizedGeoids.map((geoid) => {
    const domains = tracts[geoid];
    if (!domains) {
      throw new Error(`Workload scope contains unknown GEOID ${geoid}.`);
    }
    const record = domains[domainKey];
    if (!record) {
      throw new Error(`GEOID ${geoid} has no workload record for ${domainKey}.`);
    }
    return { geoid, record };
  });

  return aggregateWorkloadRecords(records, domainKey, config);
}

export function aggregateWorkloadRecords(
  records: readonly GeoidWorkloadRecord[],
  domainKey: WorkloadDomainKey,
  config: WorkloadModelConfig,
): WorkloadAggregate {
  if (records.length === 0) {
    throw new RangeError("At least one workload record is required.");
  }
  validateConfig(config);

  const geoids = records.map(({ geoid }) => geoid).sort(compareGeoids);
  if (new Set(geoids).size !== geoids.length) {
    throw new Error("A workload aggregate cannot contain a GEOID more than once.");
  }

  const periodArrivals = Array<number>(config.periods.length).fill(0);
  const closedByAge = Array<number>(config.ageCheckpointsDays.length).fill(0);
  let requestCount = 0;
  let knownTiming = 0;
  let validClosures = 0;

  for (const { geoid, record } of records) {
    validateRecord(geoid, record, config);
    requestCount += record.requestCount;
    knownTiming += record.knownTiming;
    validClosures += record.validClosures;
    record.periodArrivals.forEach((value, index) => {
      periodArrivals[index] += value;
    });
    record.closedByAge.forEach((value, index) => {
      closedByAge[index] += value;
    });
  }

  const fullPeriodArrivals = selectIndices(
    periodArrivals,
    config.fullPeriodIndices,
  );
  const sampleStatus = workloadSampleStatus(
    requestCount,
    knownTiming,
    config.minimumKnownTimingSample,
  );
  const supportsCurve = sampleStatus === "sufficient";

  return {
    kind: "aggregate",
    domainKey,
    geoids,
    tractCount: geoids.length,
    requestCount,
    periodArrivals,
    fullPeriodArrivals,
    meanFullPeriodArrivals: mean(fullPeriodArrivals),
    medianFullPeriodArrivals: median(fullPeriodArrivals),
    p10FullPeriodArrivals: quantile(fullPeriodArrivals, 0.1),
    p90FullPeriodArrivals: quantile(fullPeriodArrivals, 0.9),
    knownTiming,
    validClosures,
    closedByAge,
    sampleStatus,
    supportsCurve,
    supportsReplay: supportsCurve,
  };
}

function validateConfig(config: WorkloadModelConfig): void {
  if (config.periods.length === 0 || config.ageCheckpointsDays.length === 0) {
    throw new Error("Workload period and age-checkpoint arrays cannot be empty.");
  }
  if (config.fullPeriodIndices.length === 0) {
    throw new Error("At least one complete arrival period is required.");
  }
  if (!Number.isInteger(config.periodDays) || config.periodDays <= 0) {
    throw new RangeError("periodDays must be a positive integer.");
  }
  for (let index = 1; index < config.ageCheckpointsDays.length; index += 1) {
    if (config.ageCheckpointsDays[index] <= config.ageCheckpointsDays[index - 1]) {
      throw new Error("Request-age checkpoints must be strictly increasing.");
    }
  }
}

function validateRecord(
  geoid: string,
  record: WorkloadTractRecord,
  config: WorkloadModelConfig,
): void {
  if (record.periodArrivals.length !== config.periods.length) {
    throw new Error(`Workload period length mismatch for ${geoid}.`);
  }
  if (record.closedByAge.length !== config.ageCheckpointsDays.length) {
    throw new Error(`Workload checkpoint length mismatch for ${geoid}.`);
  }
  assertNonnegativeInteger(record.requestCount, `${geoid} requestCount`);
  assertNonnegativeInteger(record.knownTiming, `${geoid} knownTiming`);
  assertNonnegativeInteger(record.validClosures, `${geoid} validClosures`);
  if (record.knownTiming > record.requestCount) {
    throw new Error(`knownTiming exceeds requestCount for ${geoid}.`);
  }
  if (record.validClosures > record.knownTiming) {
    throw new Error(`validClosures exceeds knownTiming for ${geoid}.`);
  }

  let arrivalTotal = 0;
  for (const value of record.periodArrivals) {
    assertNonnegativeInteger(value, `${geoid} period arrival`);
    arrivalTotal += value;
  }
  if (arrivalTotal !== record.requestCount) {
    throw new Error(`Period arrivals do not sum to requestCount for ${geoid}.`);
  }

  let priorClosed = 0;
  for (const value of record.closedByAge) {
    assertNonnegativeInteger(value, `${geoid} closed-by-age value`);
    if (value < priorClosed) {
      throw new Error(`Closed-by-age counts are not monotone for ${geoid}.`);
    }
    if (value > record.knownTiming || value > record.validClosures) {
      throw new Error(`Closed-by-age count exceeds its denominator for ${geoid}.`);
    }
    priorClosed = value;
  }

  const expectedStatus = workloadSampleStatus(
    record.requestCount,
    record.knownTiming,
    config.minimumKnownTimingSample,
  );
  if (expectedStatus !== record.sampleStatus) {
    throw new Error(`Sample status does not match raw counts for ${geoid}.`);
  }
}

function compareGeoids(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
