import {
  DOMAIN_PROPERTY_PREFIXES,
  type DomainKey,
  type WorkloadSampleStatus,
  type TractFeature,
  type TractFeatureProperties,
} from "@/lib/artifacts";

export const MAP_METRIC_KEYS = [
  "complaint_intensity",
  "mapped_complaint_count",
  "median_household_income",
  "allocation_eligibility",
  "recorded_closure_30d",
  "recorded_closure_180d",
  "median_recorded_days_to_closure",
  "not_recorded_closed_age_30d",
  "not_recorded_closed_age_180d",
  "mean_complete_period_arrivals",
  "median_complete_period_arrivals",
  "expected_cohort_open_age_30d",
  "expected_cohort_open_age_180d",
] as const;

export type MapMetricKey = (typeof MAP_METRIC_KEYS)[number];

export const NEIGHBORHOOD_METRIC_KEYS = [
  "complaint_intensity",
  "mapped_complaint_count",
  "recorded_closure_30d",
  "expected_cohort_open_age_30d",
] as const satisfies readonly MapMetricKey[];

export type NeighborhoodMetricKey =
  (typeof NEIGHBORHOOD_METRIC_KEYS)[number];

/**
 * Neighborhood focus replaces the citywide map metric for both the fill and
 * the tract details shown on hover. Keeping that choice in one pure helper
 * prevents the legend/fill and tooltip from describing different measures.
 */
export function resolveMapDisplayMetric(
  cityMetric: MapMetricKey,
  neighborhoodMetric: NeighborhoodMetricKey | null | undefined,
): MapMetricKey {
  return neighborhoodMetric ?? cityMetric;
}

export interface MetricDefinition {
  key: MapMetricKey;
  label: string;
  shortLabel: string;
  legendLabel: string;
  format: "count" | "currency" | "days" | "percent" | "rate" | "boolean";
  scale: "percentile" | "quantile" | "sequential" | "categorical";
  requiresSufficientResponse: boolean;
}

export interface MapMetricDatum {
  metric: MapMetricKey;
  value: number | boolean | null;
  /** Value used for color assignment. This intentionally differs from the
   * displayed value for complaint intensity, whose exported percentile is the
   * contractually required fill field. */
  scaleValue: number | null;
  secondaryValue: number | null;
  sampleStatus: WorkloadSampleStatus | null;
  available: boolean;
  unavailableReason: string | null;
}

export const MAP_METRICS: Record<MapMetricKey, MetricDefinition> = {
  complaint_intensity: {
    key: "complaint_intensity",
    label: "Complaint intensity per 1,000 residents",
    shortLabel: "Complaints per 1,000",
    legendLabel: "Complaints per 1,000 (citywide percentile fill)",
    format: "rate",
    scale: "percentile",
    requiresSufficientResponse: false,
  },
  mapped_complaint_count: {
    key: "mapped_complaint_count",
    label: "Mapped complaint count",
    shortLabel: "Mapped complaints",
    legendLabel: "Mapped complaints",
    format: "count",
    scale: "quantile",
    requiresSufficientResponse: false,
  },
  median_household_income: {
    key: "median_household_income",
    label: "Median household income",
    shortLabel: "Median income",
    legendLabel: "Median household income",
    format: "currency",
    scale: "sequential",
    requiresSufficientResponse: false,
  },
  allocation_eligibility: {
    key: "allocation_eligibility",
    label: "Allocation eligibility",
    shortLabel: "Allocation eligibility",
    legendLabel: "Allocation eligibility",
    format: "boolean",
    scale: "categorical",
    requiresSufficientResponse: false,
  },
  recorded_closure_30d: {
    key: "recorded_closure_30d",
    label: "Recorded closure within 30 days",
    shortLabel: "Recorded closure · 30d",
    legendLabel: "Recorded closed within 30 days",
    format: "percent",
    scale: "quantile",
    requiresSufficientResponse: true,
  },
  recorded_closure_180d: {
    key: "recorded_closure_180d",
    label: "Recorded closure within 180 days",
    shortLabel: "Recorded closure · 180d",
    legendLabel: "Recorded closed within 180 days",
    format: "percent",
    scale: "quantile",
    requiresSufficientResponse: true,
  },
  median_recorded_days_to_closure: {
    key: "median_recorded_days_to_closure",
    label: "Median recorded days to closure",
    shortLabel: "Median recorded closure days",
    legendLabel: "Median recorded days to closure",
    format: "days",
    scale: "quantile",
    requiresSufficientResponse: true,
  },
  not_recorded_closed_age_30d: {
    key: "not_recorded_closed_age_30d",
    label: "Not recorded closed by age 30 days",
    shortLabel: "Not recorded closed · age 30",
    legendLabel: "Not recorded closed by age 30 (count)",
    format: "count",
    scale: "quantile",
    requiresSufficientResponse: true,
  },
  not_recorded_closed_age_180d: {
    key: "not_recorded_closed_age_180d",
    label: "Not recorded closed by age 180 days",
    shortLabel: "Not recorded closed · age 180",
    legendLabel: "Not recorded closed by age 180 (count)",
    format: "count",
    scale: "quantile",
    requiresSufficientResponse: true,
  },
  mean_complete_period_arrivals: {
    key: "mean_complete_period_arrivals",
    label: "Mean complete-period arrivals",
    shortLabel: "Mean 30-day arrivals",
    legendLabel: "Mean requests per complete 30-day period",
    format: "count",
    scale: "quantile",
    requiresSufficientResponse: false,
  },
  median_complete_period_arrivals: {
    key: "median_complete_period_arrivals",
    label: "Median complete-period arrivals",
    shortLabel: "Median 30-day arrivals",
    legendLabel: "Median requests per complete 30-day period",
    format: "count",
    scale: "quantile",
    requiresSufficientResponse: false,
  },
  expected_cohort_open_age_30d: {
    key: "expected_cohort_open_age_30d",
    label: "Expected cohort open at age 30 days",
    shortLabel: "Expected open · age 30",
    legendLabel: "Expected cohort open at age 30",
    format: "count",
    scale: "quantile",
    requiresSufficientResponse: true,
  },
  expected_cohort_open_age_180d: {
    key: "expected_cohort_open_age_180d",
    label: "Expected cohort open at age 180 days",
    shortLabel: "Expected open · age 180",
    legendLabel: "Expected cohort open at age 180",
    format: "count",
    scale: "quantile",
    requiresSufficientResponse: true,
  },
};

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asStatus = (value: unknown): WorkloadSampleStatus | null => {
  switch (value) {
    case "no_requests":
    case "no_known_timing":
    case "insufficient_sample":
    case "sufficient":
      return value;
    default:
      return null;
  }
};

const getProperty = (
  properties: TractFeatureProperties,
  key: string,
): unknown => (properties as Record<string, unknown>)[key];

function sparseReason(status: WorkloadSampleStatus | null): string {
  switch (status) {
    case "no_requests":
      return "No mapped requests";
    case "no_known_timing":
      return "Closure timing unavailable";
    case "insufficient_sample":
      return "Insufficient sample";
    default:
      return "Not available";
  }
}

/**
 * Reads only exported artifact properties. Closure-derived map metrics are
 * explicitly gated by sample status even when a raw numerator is present.
 * This prevents a sparse or unavailable closure value from becoming a visual
 * zero.
 */
export function getMapMetricDatum(
  properties: TractFeatureProperties,
  domain: DomainKey,
  metric: MapMetricKey,
): MapMetricDatum {
  const prefix = DOMAIN_PROPERTY_PREFIXES[domain];
  const status = asStatus(
    getProperty(properties, `${prefix}ResponseSampleStatus`),
  );
  const definition = MAP_METRICS[metric];

  if (definition.requiresSufficientResponse && status !== "sufficient") {
    return {
      metric,
      value: null,
      scaleValue: null,
      secondaryValue: null,
      sampleStatus: status,
      available: false,
      unavailableReason: sparseReason(status),
    };
  }

  let value: number | boolean | null = null;
  let scaleValue: number | null = null;
  let secondaryValue: number | null = null;

  switch (metric) {
    case "complaint_intensity":
      value = asNumber(getProperty(properties, `${prefix}ComplaintRatePer1000`));
      scaleValue = asNumber(
        getProperty(properties, `${prefix}ComplaintIntensityPercentile`),
      );
      break;
    case "mapped_complaint_count":
      value = asNumber(getProperty(properties, `${prefix}ComplaintCount`));
      scaleValue = value;
      break;
    case "median_household_income":
      value = asNumber(getProperty(properties, "medianHouseholdIncome"));
      scaleValue = value;
      break;
    case "allocation_eligibility": {
      const eligible = getProperty(properties, "allocationEligible");
      value = typeof eligible === "boolean" ? eligible : null;
      scaleValue = value === null ? null : value ? 1 : 0;
      break;
    }
    case "recorded_closure_30d":
      value = asNumber(
        getProperty(properties, `${prefix}RecordedClosureWithin30dPct`),
      );
      scaleValue = value;
      break;
    case "recorded_closure_180d":
      value = asNumber(
        getProperty(properties, `${prefix}RecordedClosureWithin180dPct`),
      );
      scaleValue = value;
      break;
    case "median_recorded_days_to_closure":
      value = asNumber(
        getProperty(properties, `${prefix}MedianRecordedDaysToClose`),
      );
      scaleValue = value;
      break;
    case "not_recorded_closed_age_30d":
      value = asNumber(
        getProperty(properties, `${prefix}NotRecordedClosedWithin30dCount`),
      );
      secondaryValue = asNumber(
        getProperty(properties, `${prefix}NotRecordedClosedWithin30dPer1000`),
      );
      scaleValue = value;
      break;
    case "not_recorded_closed_age_180d":
      value = asNumber(
        getProperty(properties, `${prefix}NotRecordedClosedWithin180dCount`),
      );
      secondaryValue = asNumber(
        getProperty(properties, `${prefix}NotRecordedClosedWithin180dPer1000`),
      );
      scaleValue = value;
      break;
    case "mean_complete_period_arrivals":
      value = asNumber(getProperty(properties, `${prefix}Mean30dArrivals`));
      scaleValue = value;
      break;
    case "median_complete_period_arrivals":
      value = asNumber(getProperty(properties, `${prefix}Median30dArrivals`));
      scaleValue = value;
      break;
    case "expected_cohort_open_age_30d":
      value = asNumber(getProperty(properties, `${prefix}OpenAt30d`));
      scaleValue = value;
      break;
    case "expected_cohort_open_age_180d":
      value = asNumber(getProperty(properties, `${prefix}OpenAt180d`));
      scaleValue = value;
      break;
  }

  // Complaint intensity can have a valid displayed rate but no exported
  // percentile for an ineligible tract. It remains unavailable for fill, as
  // the build contract requires the exported percentile rather than a locally
  // invented rank.
  const available = value !== null && scaleValue !== null;
  const unavailableReason = definition.requiresSufficientResponse
    ? sparseReason(status)
    : "Not available";

  return {
    metric,
    value: available ? value : null,
    scaleValue: available ? scaleValue : null,
    secondaryValue: available ? secondaryValue : null,
    sampleStatus: status,
    available,
    unavailableReason: available ? null : unavailableReason,
  };
}

export function getMetricValues(
  features: readonly TractFeature[],
  domain: DomainKey,
  metric: MapMetricKey,
): number[] {
  return features.flatMap((feature) => {
    const value = getMapMetricDatum(feature.properties, domain, metric).scaleValue;
    return value === null ? [] : [value];
  });
}

export function getActiveDomainSummary(
  properties: TractFeatureProperties,
  domain: DomainKey,
): {
  count: number;
  ratePer1000: number | null;
  sampleStatus: WorkloadSampleStatus | null;
} {
  const prefix = DOMAIN_PROPERTY_PREFIXES[domain];
  return {
    count:
      asNumber(getProperty(properties, `${prefix}ComplaintCount`)) ?? 0,
    ratePer1000: asNumber(
      getProperty(properties, `${prefix}ComplaintRatePer1000`),
    ),
    sampleStatus: asStatus(
      getProperty(properties, `${prefix}ResponseSampleStatus`),
    ),
  };
}

export function formatMetricValue(
  datum: MapMetricDatum,
  locale = "en-US",
): string {
  if (!datum.available || datum.value === null) {
    return datum.unavailableReason ?? "Not available";
  }

  if (typeof datum.value === "boolean") {
    return datum.value ? "Eligible" : "Not eligible";
  }

  const definition = MAP_METRICS[datum.metric];
  switch (definition.format) {
    case "currency":
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(datum.value);
    case "percent":
      return `${datum.value.toFixed(1)}%`;
    case "rate":
      return `${datum.value.toFixed(1)} per 1,000`;
    case "days":
      return `${datum.value.toFixed(1)} days`;
    case "count":
      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: Number.isInteger(datum.value) ? 0 : 1,
      }).format(datum.value);
    case "boolean":
      return datum.value ? "Eligible" : "Not eligible";
  }
}

export function formatTractName(
  properties: Pick<TractFeatureProperties, "tractName" | "borough">,
): string {
  return `Census Tract ${properties.tractName}, ${properties.borough}`;
}
