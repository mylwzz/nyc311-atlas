import type {
  DomainKey,
  TractDetails,
  TractFeature,
  TractFeatureProperties,
  TractWorkloadRecord,
  WorkloadInterval,
  WorkloadSampleStatus,
} from "@/lib/artifacts";
import { agencyFullName } from "@/lib/agencies";
import {
  DOMAIN_CONFIG,
  DOMAIN_KEYS,
  EXPLORE_DOMAIN_CONFIG,
  type ExploreDomainKey,
} from "@/lib/domain";
import { getCollectiveComplaintSummary } from "@/lib/map/metrics";

type TractDetailRecord = TractDetails["tracts"][string];

export interface ComplaintDomainPresentation {
  domain: DomainKey;
  label: string;
  count: number;
  ratePer1000: number | null;
}

export interface ComplaintSummaryPresentation {
  domain: ExploreDomainKey;
  label: string;
  count: number;
  ratePer1000: number | null;
}

export interface ComplaintTypePresentation {
  complaintType: string;
  domain: DomainKey;
  domainLabel: string;
  count: number;
  sharePct: number;
}

export interface AgencyPresentation {
  agency: string;
  fullName: string | null;
  count: number;
  sharePct: number;
}

export interface ComplaintCompositionPresentation {
  complaintTypes: readonly ComplaintTypePresentation[];
  agencies: readonly AgencyPresentation[];
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
      title: "Small response sample";
      detail: string;
      requestCount: number;
      knownTimingOutcomes30d: number;
      knownTimingOutcomes180d: number;
      validRecordedClosures: number;
      metrics: null;
    }
  | {
      status: "sufficient";
      title: "Recorded response";
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
  activeDomain: ComplaintSummaryPresentation;
  response: RecordedResponsePresentation | null;
  warnings: readonly string[];
}

export const COLLECTIVE_RESPONSE_NOTE =
  "Collective combines complaint activity only. Choose one service domain to view closure timing.";

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
        | "Small response sample";
      age30: null;
      age180: null;
    };

export function sparseResponseTitle(
  status: Exclude<WorkloadSampleStatus, "sufficient">,
):
  | "No mapped requests"
  | "Closure timing unavailable"
  | "Small response sample" {
  switch (status) {
    case "no_requests":
      return "No mapped requests";
    case "no_known_timing":
      return "Closure timing unavailable";
    case "insufficient_sample":
      return "Small response sample";
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

export function getCollectiveComplaintPresentation(
  properties: TractFeatureProperties,
): ComplaintSummaryPresentation {
  const summary = getCollectiveComplaintSummary(properties);
  return {
    domain: "collective",
    label: EXPLORE_DOMAIN_CONFIG.collective.label,
    count: summary.count,
    ratePer1000: summary.ratePer1000,
  };
}

function descendingCountThenLabel<
  Item extends { count: number; complaintType?: string; agency?: string },
>(left: Item, right: Item): number {
  return (
    right.count - left.count ||
    (left.complaintType ?? left.agency ?? "").localeCompare(
      right.complaintType ?? right.agency ?? "",
    )
  );
}

/**
 * Builds the complaint-type/agency disclosure from exported detail rows.
 * Collective complaint-type shares use the summed five-domain complaint count
 * as the denominator; artifact percentages are never averaged. Agency detail
 * remains domain-specific because the artifact exports only each domain's top
 * five agencies, which cannot produce an exact cross-domain ranking.
 */
export function getComplaintCompositionPresentation(
  detail: TractDetailRecord,
  properties: TractFeatureProperties,
  domain: ExploreDomainKey,
): ComplaintCompositionPresentation {
  if (domain !== "collective") {
    return {
      complaintTypes: detail.topComplaintTypesByDomain[domain].map((item) => ({
        ...item,
        domain,
        domainLabel: DOMAIN_CONFIG[domain].label,
      })),
      agencies: detail.topAgenciesByDomain[domain].map((item) => ({
        ...item,
        fullName: agencyFullName(item.agency),
      })),
    };
  }

  const collectiveCount = getCollectiveComplaintSummary(properties).count;
  const shareOfCollective = (count: number) =>
    collectiveCount > 0 ? (count / collectiveCount) * 100 : 0;
  const complaintTypes = DOMAIN_KEYS.flatMap((key) =>
    detail.topComplaintTypesByDomain[key].map((item) => ({
      complaintType: item.complaintType,
      domain: key,
      domainLabel: DOMAIN_CONFIG[key].label,
      count: item.count,
      sharePct: shareOfCollective(item.count),
    })),
  )
    .sort(descendingCountThenLabel)
    .slice(0, 10);

  return { complaintTypes, agencies: [] };
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
        detail: "No mapped requests in this domain during the 2016 arrival cohort.",
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
        detail: "Requests are present, but closure timing is unavailable for this tract and domain.",
        requestCount,
        knownTimingOutcomes30d: 0,
        knownTimingOutcomes180d,
        validRecordedClosures,
        metrics: null,
      };
    case "insufficient_sample":
      return {
        status,
        title: "Small response sample",
        detail: "Tract-specific response modeling is not shown.",
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
        title: "Recorded response",
        detail: `Sample: ${knownTimingOutcomes30d.toLocaleString("en-US")} requests.`,
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
  domain: ExploreDomainKey,
): TractPresentation {
  const complaintDomains = DOMAIN_KEYS.map((key) =>
    getComplaintDomainPresentation(feature.properties, key),
  );
  const response =
    domain === "collective"
      ? null
      : getRecordedResponsePresentation(feature.properties, domain);
  const warnings: string[] = [];
  const eligibilityWarning = ineligibilityWarning(feature.properties);
  if (eligibilityWarning) warnings.push(eligibilityWarning);
  if (response && response.status !== "sufficient") warnings.push(response.detail);

  return {
    feature,
    complaintDomains,
    activeDomain:
      domain === "collective"
        ? getCollectiveComplaintPresentation(feature.properties)
        : complaintDomains.find((item) => item.domain === domain)!,
    response,
    warnings,
  };
}
