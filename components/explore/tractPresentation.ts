import type {
  DomainKey,
  TractFeature,
  TractFeatureProperties,
  TractWorkloadRecord,
  WorkloadInterval,
  WorkloadSampleStatus,
} from "@/lib/artifacts";
import { DOMAIN_CONFIG, DOMAIN_KEYS } from "@/lib/domain";

export interface ComplaintDomainPresentation {
  domain: DomainKey;
  label: string;
  count: number;
  ratePer1000: number | null;
}

export interface SufficientResponseMetrics {
  recordedClosureWithin30dPct: number;
  recordedClosureWithin180dPct: number;
  medianRecordedDaysToClose: number | null;
  notRecordedClosedWithin30dCount: number;
  notRecordedClosedWithin180dCount: number;
  notRecordedClosedWithin30dPer1000: number | null;
  notRecordedClosedWithin180dPer1000: number | null;
  expectedCohortOpenAt30d: number;
  expectedCohortOpenAt180d: number;
}

export type RecordedResponsePresentation =
  | {
      status: "no_requests";
      title: "No mapped requests";
      detail: string;
      requestCount: 0;
      knownTimingOutcomes30d: 0;
      knownTimingOutcomes180d: 0;
      validRecordedClosures: 0;
      metrics: null;
    }
  | {
      status: "no_known_timing";
      title: "Closure timing unavailable";
      detail: string;
      requestCount: number;
      knownTimingOutcomes30d: 0;
      knownTimingOutcomes180d: number;
      validRecordedClosures: number;
      metrics: null;
    }
  | {
      status: "insufficient_sample";
      title: "Insufficient tract-specific sample";
      detail: string;
      requestCount: number;
      knownTimingOutcomes30d: number;
      knownTimingOutcomes180d: number;
      validRecordedClosures: number;
      metrics: null;
    }
  | {
      status: "sufficient";
      title: "Recorded administrative response";
      detail: string;
      requestCount: number;
      knownTimingOutcomes30d: number;
      knownTimingOutcomes180d: number;
      validRecordedClosures: number;
      metrics: SufficientResponseMetrics;
    };

export interface TractPresentation {
  feature: TractFeature;
  complaintDomains: readonly ComplaintDomainPresentation[];
  activeDomain: ComplaintDomainPresentation;
  response: RecordedResponsePresentation;
  warnings: readonly string[];
}

export type TractUncertaintyPresentation =
  | {
      status: "sufficient";
      title: "Tract-specific uncertainty";
      age30: WorkloadInterval;
      age180: WorkloadInterval;
    }
  | {
      status: "no_requests" | "no_known_timing" | "insufficient_sample";
      title:
        | "No mapped requests"
        | "Closure timing unavailable"
        | "Insufficient tract-specific sample";
      age30: null;
      age180: null;
    };

export function sparseResponseTitle(
  status: Exclude<WorkloadSampleStatus, "sufficient">,
):
  | "No mapped requests"
  | "Closure timing unavailable"
  | "Insufficient tract-specific sample" {
  switch (status) {
    case "no_requests":
      return "No mapped requests";
    case "no_known_timing":
      return "Closure timing unavailable";
    case "insufficient_sample":
      return "Insufficient tract-specific sample";
  }
}

/** Reads only the exported intervals; sparse records never gain placeholders. */
export function getTractUncertaintyPresentation(
  record: TractWorkloadRecord,
): TractUncertaintyPresentation {
  if (record.sampleStatus !== "sufficient") {
    return {
      status: record.sampleStatus,
      title: sparseResponseTitle(record.sampleStatus),
      age30: null,
      age180: null,
    };
  }
  return {
    status: "sufficient",
    title: "Tract-specific uncertainty",
    age30: record.uncertainty["30"],
    age180: record.uncertainty["180"],
  };
}

const property = (
  properties: TractFeatureProperties,
  key: string,
): unknown => (properties as unknown as Record<string, unknown>)[key];

function requiredNumber(
  properties: TractFeatureProperties,
  key: string,
): number {
  const value = property(properties, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Artifact field ${key} is not a finite number.`);
  }
  return value;
}

function nullableNumber(
  properties: TractFeatureProperties,
  key: string,
): number | null {
  const value = property(properties, key);
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Artifact field ${key} is not a finite number or null.`);
  }
  return value;
}

function responseStatus(
  properties: TractFeatureProperties,
  key: string,
): WorkloadSampleStatus {
  const value = property(properties, key);
  if (
    value === "no_requests" ||
    value === "no_known_timing" ||
    value === "insufficient_sample" ||
    value === "sufficient"
  ) {
    return value;
  }
  throw new TypeError(`Artifact field ${key} has an unknown sample status.`);
}

export function getComplaintDomainPresentation(
  properties: TractFeatureProperties,
  domain: DomainKey,
): ComplaintDomainPresentation {
  const prefix = DOMAIN_CONFIG[domain].propertyPrefix;
  return {
    domain,
    label: DOMAIN_CONFIG[domain].label,
    count: requiredNumber(properties, `${prefix}ComplaintCount`),
    ratePer1000: nullableNumber(
      properties,
      `${prefix}ComplaintRatePer1000`,
    ),
  };
}

/**
 * Produces a discriminated response model. Sparse states have `metrics: null`
 * by construction, so a missing closure value cannot be formatted as zero.
 */
export function getRecordedResponsePresentation(
  properties: TractFeatureProperties,
  domain: DomainKey,
): RecordedResponsePresentation {
  const prefix = DOMAIN_CONFIG[domain].propertyPrefix;
  const status = responseStatus(properties, `${prefix}ResponseSampleStatus`);
  const requestCount = requiredNumber(properties, `${prefix}ComplaintCount`);
  const knownTimingOutcomes30d = requiredNumber(
    properties,
    `${prefix}KnownClosureTimingOutcomes30d`,
  );
  const knownTimingOutcomes180d = requiredNumber(
    properties,
    `${prefix}KnownClosureTimingOutcomes180d`,
  );
  const validRecordedClosures = requiredNumber(
    properties,
    `${prefix}ValidRecordedClosures`,
  );

  switch (status) {
    case "no_requests":
      return {
        status,
        title: "No mapped requests",
        detail:
          "No mapped requests in this domain during the 2016 arrival cohort. This is a true zero request count, not a zero closure probability.",
        requestCount: 0,
        knownTimingOutcomes30d: 0,
        knownTimingOutcomes180d: 0,
        validRecordedClosures: 0,
        metrics: null,
      };
    case "no_known_timing":
      return {
        status,
        title: "Closure timing unavailable",
        detail:
          "Requests are present, but no valid tract-specific timing outcomes are available.",
        requestCount,
        knownTimingOutcomes30d: 0,
        knownTimingOutcomes180d,
        validRecordedClosures,
        metrics: null,
      };
    case "insufficient_sample":
      return {
        status,
        title: "Insufficient tract-specific sample",
        detail:
          "A tract-specific closure curve, open-at-age estimate, historical replay, and uncertainty are not shown.",
        requestCount,
        knownTimingOutcomes30d,
        knownTimingOutcomes180d,
        validRecordedClosures,
        metrics: null,
      };
    case "sufficient": {
      const recordedClosureWithin30dPct = nullableNumber(
        properties,
        `${prefix}RecordedClosureWithin30dPct`,
      );
      const recordedClosureWithin180dPct = nullableNumber(
        properties,
        `${prefix}RecordedClosureWithin180dPct`,
      );
      const expectedCohortOpenAt30d = nullableNumber(
        properties,
        `${prefix}OpenAt30d`,
      );
      const expectedCohortOpenAt180d = nullableNumber(
        properties,
        `${prefix}OpenAt180d`,
      );

      // Validated artifacts guarantee these four values for sufficient rows.
      // Keep a defensive failure here rather than silently substituting zero.
      if (
        recordedClosureWithin30dPct === null ||
        recordedClosureWithin180dPct === null ||
        expectedCohortOpenAt30d === null ||
        expectedCohortOpenAt180d === null
      ) {
        throw new Error(
          `Sufficient response fields are missing for ${properties.geoid} (${domain}).`,
        );
      }

      return {
        status,
        title: "Recorded administrative response",
        detail: `${knownTimingOutcomes30d.toLocaleString("en-US")} known timing outcomes support tract-specific estimates.`,
        requestCount,
        knownTimingOutcomes30d,
        knownTimingOutcomes180d,
        validRecordedClosures,
        metrics: {
          recordedClosureWithin30dPct,
          recordedClosureWithin180dPct,
          medianRecordedDaysToClose: nullableNumber(
            properties,
            `${prefix}MedianRecordedDaysToClose`,
          ),
          notRecordedClosedWithin30dCount: requiredNumber(
            properties,
            `${prefix}NotRecordedClosedWithin30dCount`,
          ),
          notRecordedClosedWithin180dCount: requiredNumber(
            properties,
            `${prefix}NotRecordedClosedWithin180dCount`,
          ),
          notRecordedClosedWithin30dPer1000: nullableNumber(
            properties,
            `${prefix}NotRecordedClosedWithin30dPer1000`,
          ),
          notRecordedClosedWithin180dPer1000: nullableNumber(
            properties,
            `${prefix}NotRecordedClosedWithin180dPer1000`,
          ),
          expectedCohortOpenAt30d,
          expectedCohortOpenAt180d,
        },
      };
    }
  }
}

function ineligibilityWarning(
  properties: TractFeatureProperties,
): string | null {
  switch (properties.allocationIneligibilityReason) {
    case "missing_population":
      return "Allocation eligibility is unavailable because population is missing.";
    case "population_below_500":
      return "Not allocation eligible because the population is below 500.";
    case "missing_income":
      return "Allocation eligibility is unavailable because median household income is missing.";
    case null:
      return null;
  }
}

export function buildTractPresentation(
  feature: TractFeature,
  domain: DomainKey,
): TractPresentation {
  const complaintDomains = DOMAIN_KEYS.map((key) =>
    getComplaintDomainPresentation(feature.properties, key),
  );
  const response = getRecordedResponsePresentation(feature.properties, domain);
  const warnings: string[] = [];
  const eligibilityWarning = ineligibilityWarning(feature.properties);
  if (eligibilityWarning) warnings.push(eligibilityWarning);
  if (response.status !== "sufficient") warnings.push(response.detail);

  return {
    feature,
    complaintDomains,
    activeDomain: complaintDomains.find((item) => item.domain === domain)!,
    response,
    warnings,
  };
}
