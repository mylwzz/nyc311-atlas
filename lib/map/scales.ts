import type { DomainKey, TractFeature } from "@/lib/artifacts";

import {
  getMapMetricDatum,
  getMetricValues,
  MAP_METRICS,
  type MapMetricKey,
} from "./metrics";

export type MapColor = [number, number, number, number];

export const MAP_COLORS = {
  active: [179, 49, 43, 255] as MapColor,
  selected: [43, 43, 40, 255] as MapColor,
  tractLine: [95, 90, 84, 90] as MapColor,
  boroughLine: [55, 53, 49, 190] as MapColor,
  unavailable: [210, 207, 200, 225] as MapColor,
  ghost: [173, 171, 166, 170] as MapColor,
  scenarioCurrent: [50, 91, 102, 104] as MapColor,
  scenarioPinned: [140, 107, 70, 92] as MapColor,
  scenarioShared: [56, 93, 86, 118] as MapColor,
  perimeter: [255, 255, 255, 255] as MapColor,
  perimeterStroke: [53, 52, 49, 210] as MapColor,
} as const;

const DEMAND_PALETTE: readonly MapColor[] = [
  [241, 236, 227, 245],
  [224, 210, 190, 245],
  [199, 174, 143, 245],
  [159, 120, 88, 245],
  [102, 72, 54, 245],
];

const RESPONSE_PALETTE: readonly MapColor[] = [
  [236, 234, 226, 245],
  [204, 216, 207, 245],
  [160, 190, 177, 245],
  [105, 154, 141, 245],
  [55, 108, 104, 245],
];

const INCOME_PALETTE: readonly MapColor[] = [
  [239, 235, 222, 245],
  [216, 214, 193, 245],
  [181, 190, 169, 245],
  [132, 158, 144, 245],
  [79, 117, 111, 245],
];

export const NEIGHBORHOOD_PALETTE: readonly MapColor[] = [
  [76, 112, 126, 245],
  [151, 176, 179, 245],
  [225, 222, 211, 245],
  [204, 159, 125, 245],
  [155, 91, 70, 245],
];

export interface LegendItem {
  label: string;
  color: MapColor;
  texture?: "solid" | "muted" | "outline" | "dots";
}

export interface MetricColorScale {
  metric: MapMetricKey;
  label: string;
  thresholds: readonly number[];
  colors: readonly MapColor[];
  legendItems: readonly LegendItem[];
  colorFor(value: number | null, booleanValue?: boolean | null): MapColor;
}

function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] ?? 0;
  const fraction = position - lower;
  return (sorted[lower] ?? 0) * (1 - fraction) + (sorted[upper] ?? 0) * fraction;
}

export function quantileThresholds(values: readonly number[]): number[] {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((probability) =>
    quantile(sorted, probability),
  );
}

function paletteFor(metric: MapMetricKey): readonly MapColor[] {
  if (metric === "median_household_income") return INCOME_PALETTE;
  if (
    metric === "recorded_closure_30d" ||
    metric === "recorded_closure_180d" ||
    metric === "median_recorded_days_to_closure"
  ) {
    return RESPONSE_PALETTE;
  }
  return DEMAND_PALETTE;
}

function binIndex(value: number, thresholds: readonly number[]): number {
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value <= (thresholds[index] ?? Number.POSITIVE_INFINITY)) return index;
  }
  return thresholds.length;
}

function compactNumber(value: number, metric: MapMetricKey): string {
  if (metric === "median_household_income") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (metric === "recorded_closure_30d" || metric === "recorded_closure_180d") {
    return `${value.toFixed(1)}%`;
  }
  if (metric === "complaint_intensity") {
    return `${Math.round(value * 100)}th pct.`;
  }
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function thresholdLabels(
  thresholds: readonly number[],
  metric: MapMetricKey,
): string[] {
  if (thresholds.length !== 4) return [];
  const [a, b, c, d] = thresholds;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return [];
  }
  return [
    `≤ ${compactNumber(a, metric)}`,
    `${compactNumber(a, metric)}–${compactNumber(b, metric)}`,
    `${compactNumber(b, metric)}–${compactNumber(c, metric)}`,
    `${compactNumber(c, metric)}–${compactNumber(d, metric)}`,
    `> ${compactNumber(d, metric)}`,
  ];
}

export function createMetricColorScale(
  features: readonly TractFeature[],
  domain: DomainKey,
  metric: MapMetricKey,
): MetricColorScale {
  const definition = MAP_METRICS[metric];

  if (metric === "allocation_eligibility") {
    const colors: readonly MapColor[] = [
      [203, 198, 187, 245],
      [76, 119, 107, 245],
    ];
    return {
      metric,
      label: definition.legendLabel,
      thresholds: [0.5],
      colors,
      legendItems: [
        { label: "Not eligible", color: colors[0] },
        { label: "Eligible", color: colors[1] },
      ],
      colorFor: (value, booleanValue) => {
        if (booleanValue === null || value === null) return MAP_COLORS.unavailable;
        return booleanValue ? colors[1] : colors[0];
      },
    };
  }

  const values = getMetricValues(features, domain, metric);
  const thresholds =
    definition.scale === "percentile"
      ? [0.2, 0.4, 0.6, 0.8]
      : quantileThresholds(values);
  const colors = paletteFor(metric);
  const labels = thresholdLabels(thresholds, metric);

  return {
    metric,
    label: definition.legendLabel,
    thresholds,
    colors,
    legendItems: [
      ...colors.map((color, index) => ({
        color,
        label: labels[index] ?? `Class ${index + 1}`,
      })),
      {
        color: MAP_COLORS.unavailable,
        label: "Not available / insufficient sample",
        texture: "muted" as const,
      },
    ],
    colorFor: (value) =>
      value === null
        ? MAP_COLORS.unavailable
        : colors[binIndex(value, thresholds)] ?? colors.at(-1) ?? MAP_COLORS.unavailable,
  };
}

/** Contractual relative-fill transform for neighborhood comparison. */
export function relativeNeighborhoodDifference(
  value: number,
  activeValue: number,
  epsilon = 1e-9,
): number {
  return (value - activeValue) / (Math.abs(value) + Math.abs(activeValue) + epsilon);
}

export function neighborhoodColor(
  value: number | null,
  activeValue: number | null,
): MapColor {
  if (value === null || activeValue === null) return MAP_COLORS.unavailable;
  const relative = relativeNeighborhoodDifference(value, activeValue);
  const index = binIndex(relative, [-0.35, -0.1, 0.1, 0.35]);
  return NEIGHBORHOOD_PALETTE[index] ?? NEIGHBORHOOD_PALETTE[2];
}

export const NEIGHBORHOOD_LEGEND: readonly LegendItem[] = [
  { label: "Much lower than active", color: NEIGHBORHOOD_PALETTE[0] },
  { label: "Lower than active", color: NEIGHBORHOOD_PALETTE[1] },
  { label: "Near active", color: NEIGHBORHOOD_PALETTE[2] },
  { label: "Higher than active", color: NEIGHBORHOOD_PALETTE[3] },
  { label: "Much higher than active", color: NEIGHBORHOOD_PALETTE[4] },
  {
    label: "Outside neighborhood",
    color: MAP_COLORS.ghost,
    texture: "muted",
  },
];

export function getFeatureColor(
  feature: TractFeature,
  domain: DomainKey,
  metric: MapMetricKey,
  scale: MetricColorScale,
): MapColor {
  const datum = getMapMetricDatum(feature.properties, domain, metric);
  return scale.colorFor(
    datum.scaleValue,
    typeof datum.value === "boolean" ? datum.value : null,
  );
}
