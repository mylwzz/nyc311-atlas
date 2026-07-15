import type { WorkloadSampleStatus } from "./types";

export function workloadSampleStatus(
  requestCount: number,
  knownTiming: number,
  minimumKnownTimingSample: number,
): WorkloadSampleStatus {
  assertNonnegativeInteger(requestCount, "requestCount");
  assertNonnegativeInteger(knownTiming, "knownTiming");
  if (
    !Number.isInteger(minimumKnownTimingSample) ||
    minimumKnownTimingSample <= 0
  ) {
    throw new RangeError("minimumKnownTimingSample must be a positive integer.");
  }
  if (knownTiming > requestCount) {
    throw new Error("knownTiming cannot exceed requestCount.");
  }

  if (requestCount === 0) return "no_requests";
  if (knownTiming === 0) return "no_known_timing";
  if (knownTiming < minimumKnownTimingSample) return "insufficient_sample";
  return "sufficient";
}

export function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative integer.`);
  }
}
