"use client";

import { useMemo } from "react";

import type { TractFeature } from "@/lib/artifacts/schemas";
import type { DomainKey } from "@/lib/domain";
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
      return formatSigned(value, " pp");
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
}: {
  enabled: boolean;
  neighborhood: QueenNeighborhood | null;
  features: readonly TractFeature[];
  domain: DomainKey;
  metric: NeighborhoodMetricKey;
  onEnabledChange: (enabled: boolean) => void;
  onRadiusChange: (radius: 1 | 2 | 3 | 4 | 5) => void;
  onMetricChange: (metric: NeighborhoodMetricKey) => void;
}) {
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

  return (
    <section className="panel-section" aria-labelledby="neighborhood-heading">
      <div className="section-heading-row">
        <div>
          <div className="eyebrow">Spatial context</div>
          <h3 id="neighborhood-heading" className="section-title">
            Queen neighborhood
          </h3>
        </div>
        <button
          className={`button${enabled ? " active" : ""}`}
          type="button"
          aria-pressed={enabled}
          onClick={() => onEnabledChange(!enabled)}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
      {enabled ? (
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
                  {radius} {radius === 1 ? "hop" : "hops"}
                </option>
              ))}
            </select>
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
              {NEIGHBORHOOD_METRIC_KEYS.map((key) => (
                <option key={key} value={key}>
                  {MAP_METRICS[key].shortLabel}
                </option>
              ))}
            </select>
          </div>
          {!summary ? (
            <div className="status-box" role="status">
              The active tract value is unavailable for this neighborhood metric.
              Relative comparison and map ghost mode are disabled; choose another
              metric to continue.
              {neighborhood?.isIsland
                ? " This tract also has no contiguous tract neighbors."
                : ""}
            </div>
          ) : neighborhood?.isIsland ? (
            <div className="status-box">
              No contiguous tract neighbors are available.
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
              Radius follows shortest Queen-contiguity distance. The dotted line is
              the single outer perimeter; the city outside is muted.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="helper-text">
          Compare the active tract with contiguous tracts at radii one through five.
        </p>
      )}
    </section>
  );
}
