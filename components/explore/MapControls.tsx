"use client";

import { useMemo } from "react";

import type { TractFeature } from "@/lib/artifacts/schemas";
import { DOMAIN_CONFIG, DOMAIN_KEYS, type DomainKey } from "@/lib/domain";
import {
  MAP_METRIC_KEYS,
  MAP_METRICS,
  type MapMetricKey,
} from "@/lib/map/metrics";

export interface MapControlsProps {
  domain: DomainKey;
  metric: MapMetricKey;
  features: readonly TractFeature[];
  onDomainChange: (domain: DomainKey) => void;
  onMetricChange: (metric: MapMetricKey) => void;
  onSelectTract: (geoid: string) => void;
}

export function MapControls({
  domain,
  metric,
  features,
  onDomainChange,
  onMetricChange,
  onSelectTract,
}: MapControlsProps) {
  const sortedFeatures = useMemo(
    () => [...features].sort((left, right) =>
      left.properties.borough.localeCompare(right.properties.borough) ||
      left.properties.tractName.localeCompare(
        right.properties.tractName,
        undefined,
        { numeric: true },
      ),
    ),
    [features],
  );

  return (
    <div className="map-controls" aria-label="Map controls">
      <div className="map-control-card">
        <div className="field-stack">
          <label className="field-label" htmlFor="domain-control">
            Service domain
          </label>
          <select
            id="domain-control"
            className="select"
            value={domain}
            onChange={(event) => onDomainChange(event.target.value as DomainKey)}
          >
            {DOMAIN_KEYS.map((key) => (
              <option key={key} value={key}>
                {DOMAIN_CONFIG[key].label}
              </option>
            ))}
          </select>
        </div>
        <div className="field-stack">
          <label className="field-label" htmlFor="metric-control">
            Map metric
          </label>
          <select
            id="metric-control"
            className="select"
            value={metric}
            onChange={(event) => onMetricChange(event.target.value as MapMetricKey)}
          >
            {MAP_METRIC_KEYS.map((key) => (
              <option key={key} value={key}>
                {MAP_METRICS[key].shortLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="field-stack">
          <label className="field-label" htmlFor="tract-search">
            Keyboard tract selection
          </label>
          <select
            id="tract-search"
            className="select"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) onSelectTract(event.target.value);
              event.target.value = "";
            }}
          >
            <option value="">Find a census tract…</option>
            {sortedFeatures.map((feature) => (
              <option
                key={feature.properties.geoid}
                value={feature.properties.geoid}
              >
                Census Tract {feature.properties.tractName}, {feature.properties.borough}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
