"use client";

import { useMemo } from "react";

import type { TractFeature } from "@/lib/artifacts/schemas";
import type { ExploreDomainKey } from "@/lib/domain";
import {
  getMapMetricDatum,
  MAP_METRICS,
  NEIGHBORHOOD_METRIC_KEYS,
  type NeighborhoodMetricKey,
} from "@/lib/map/metrics";
import {
  summarizeNeighborhoodMetric,
  type QueenNeighborhood,
} from "@/lib/spatial";
import {
  formatCurrency,
  formatDecimal,
  formatExpected,
  formatInteger,
  formatPercent,
  formatSigned,
} from "@/lib/formatting";
import { PopulationDenominatorInfo } from "@/components/ui/PopulationDenominatorInfo";

function formatMetric(value: number, metric: NeighborhoodMetricKey): string {
  switch (MAP_METRICS[metric].format) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "rate":
    case "days":
      return formatDecimal(value);
    case "count":
      return Number.isInteger(value) ? formatInteger(value) : formatExpected(value);
    default:
      return formatDecimal(value);
  }
}

function formatAbsoluteDifference(
  value: number,
  metric: NeighborhoodMetricKey,
): string {
  switch (MAP_METRICS[metric].format) {
    case "percent":
      return formatSigned(value, " percentage points");
    case "rate":
      return formatSigned(value, " per 1,000");
    case "count":
      return formatSigned(value);
    default:
      return formatSigned(value);
  }
}

export function NeighborhoodPanel({
  enabled,
  neighborhood,
  features,
  domain,
  metric,
  onEnabledChange,
  onRadiusChange,
  onMetricChange,
  onReadPopulationMethod,
}: {
  enabled: boolean;
  neighborhood: QueenNeighborhood | null;
  features: readonly TractFeature[];
  domain: ExploreDomainKey;
  metric: NeighborhoodMetricKey;
  onEnabledChange: (enabled: boolean) => void;
  onRadiusChange: (radius: 1 | 2 | 3 | 4 | 5) => void;
  onMetricChange: (metric: NeighborhoodMetricKey) => void;
  onReadPopulationMethod?: () => void;
}) {
  const metricKeys = domain === "collective"
    ? NEIGHBORHOOD_METRIC_KEYS.filter(
        (key) =>
          key === "complaint_intensity" || key === "mapped_complaint_count",
      )
    : NEIGHBORHOOD_METRIC_KEYS;
  const values = useMemo(
    () => Object.fromEntries(
      features.map((feature) => {
        const datum = getMapMetricDatum(feature.properties, domain, metric);
        return [
          feature.properties.geoid,
          typeof datum.value === "number" ? datum.value : null,
        ];
      }),
    ),
    [domain, features, metric],
  );
  const summary = useMemo(
    () => neighborhood
      ? summarizeNeighborhoodMetric(
          neighborhood.centerGeoid,
          neighborhood.includedGeoids,
          values,
        )
      : null,
    [neighborhood, values],
  );

  if (!enabled) {
    return (
      <section className="panel-section neighborhood-compact" aria-label="Spatial context">
        <button
          className="button neighborhood-compare-button"
          type="button"
          onClick={() => onEnabledChange(true)}
        >
          <span>Compare with nearby tracts</span>
          <span aria-hidden="true">→</span>
        </button>
        <p className="neighborhood-shortcut-hint">
          <kbd>Space</kbd> toggles nearby tract context
        </p>
      </section>
    );
  }

  return (
    <section className="panel-section" aria-labelledby="neighborhood-heading">
      <div className="section-heading-row">
        <div>
          <div className="eyebrow">Spatial context</div>
          <h3 id="neighborhood-heading" className="section-title">
            Nearby tract comparison
          </h3>
        </div>
        <button
          className="button active"
          type="button"
          aria-pressed="true"
          onClick={() => onEnabledChange(false)}
        >
          Hide
        </button>
      </div>
      <p className="neighborhood-shortcut-hint">
        <kbd>Space</kbd> toggles nearby tract context
      </p>
      <div className="field-group">
          <div className="control-row">
            <label className="field-label" htmlFor="neighborhood-radius">
              Radius
            </label>
            <select
              id="neighborhood-radius"
              className="select"
              style={{ width: 130 }}
              value={neighborhood?.radius ?? 1}
              onChange={(event) =>
                onRadiusChange(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
              }
            >
              {[1, 2, 3, 4, 5].map((radius) => (
                <option key={radius} value={radius}>
                  {radius} {radius === 1 ? "step" : "steps"} away
                </option>
              ))}
            </select>
            {metric === "complaint_intensity" ? (
              <div className="inline-denominator-note">
                Complaints per 1,000 residents
                <PopulationDenominatorInfo
                  align="start"
                  onReadMethod={onReadPopulationMethod}
                />
              </div>
            ) : null}
          </div>
          <div className="field-stack">
            <label className="field-label" htmlFor="neighborhood-metric">
              Comparison metric
            </label>
            <select
              id="neighborhood-metric"
              className="select"
              value={metric}
              onChange={(event) =>
                onMetricChange(event.target.value as NeighborhoodMetricKey)
              }
            >
              {metricKeys.map((key) => (
                <option key={key} value={key}>
                  {MAP_METRICS[key].shortLabel}
                </option>
              ))}
            </select>
            {domain === "collective" ? (
              <p className="helper-text">
                Collective compares complaints only. Administrative closure and
                workload remain domain-specific.
              </p>
            ) : null}
          </div>
          {neighborhood?.isIsland ? (
            <div className="status-box">
              No nearby tracts share a boundary or corner with this tract. No
              substitute neighbors are added.
            </div>
          ) : !summary ? (
            <div className="status-box" role="status">
              The active tract value is unavailable for this neighborhood metric.
              Relative comparison and outside-tract muting are disabled; choose
              another metric to continue.
            </div>
          ) : (
            <div className="metric-grid">
              <div className="metric-cell">
                <span className="label">Active tract</span>
                <span className="value">
                  {formatMetric(summary.activeValue, metric)}
                </span>
              </div>
              <div className="metric-cell">
                <span className="label">Neighborhood median</span>
                <span className="value">
                  {formatMetric(summary.neighborhoodMedian, metric)}
                </span>
              </div>
              <div className="metric-cell">
                <span className="label">Difference</span>
                <span className="value">
                  {formatAbsoluteDifference(summary.absoluteDifference, metric)}
                </span>
              </div>
              <div className="metric-cell">
                <span className="label">Relative difference</span>
                <span className="value">
                  {summary.relativeDifferencePct === null
                    ? "Not available"
                    : formatSigned(summary.relativeDifferencePct, "%")}
                </span>
              </div>
              <div className="metric-cell">
                <span className="label">Active rank</span>
                <span className="value">
                  {summary.activeRank} of {summary.availableTractCount}
                </span>
              </div>
              <div className="metric-cell">
                <span className="label">Included tracts</span>
                <span className="value">{summary.includedTractCount}</span>
              </div>
            </div>
          )}
          {summary ? (
            <p className="helper-text">
              Nearby tracts are linked when they share a boundary or corner
              (Queen adjacency). Radius counts the shortest number of steps. The
              dotted line is the single outer perimeter; the city outside is muted.
            </p>
          ) : null}
      </div>
    </section>
  );
}
