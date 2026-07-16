"use client";

import { TractSearch } from "@/components/map/TractSearch";
import type { TractFeature } from "@/lib/artifacts/schemas";
import {
  DOMAIN_KEYS,
  EXPLORE_DOMAIN_CONFIG,
  EXPLORE_DOMAIN_KEYS,
  isDomainKey,
  type DomainKey,
  type ExploreDomainKey,
} from "@/lib/domain";
import {
  MAP_METRICS,
  isMapMetricCompatibleWithExploreDomain,
  mapMetricsForExploreDomain,
  type MapMetricKey,
} from "@/lib/map/metrics";

export interface MapControlsProps {
  domain: ExploreDomainKey;
  metric: MapMetricKey;
  features: readonly TractFeature[];
  /** Keeps the five-domain analytical selection synchronized. */
  onDomainChange: (domain: DomainKey) => void;
  /** Enables and owns the Explore-only Collective selection. */
  onExploreDomainChange?: (domain: ExploreDomainKey) => void;
  onMetricChange: (metric: MapMetricKey) => void;
  onSelectTract: (geoid: string) => void;
}

export function MapControls({
  domain,
  metric,
  features,
  onDomainChange,
  onExploreDomainChange,
  onMetricChange,
  onSelectTract,
}: MapControlsProps) {
  const domainKeys = onExploreDomainChange
    ? EXPLORE_DOMAIN_KEYS
    : DOMAIN_KEYS;
  const metricKeys = mapMetricsForExploreDomain(domain);

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
            onChange={(event) => {
              const nextDomain = event.target.value as ExploreDomainKey;
              onExploreDomainChange?.(nextDomain);
              if (isDomainKey(nextDomain)) onDomainChange(nextDomain);
              if (!isMapMetricCompatibleWithExploreDomain(nextDomain, metric)) {
                onMetricChange("complaint_intensity");
              }
            }}
          >
            {domainKeys.map((key) => (
              <option key={key} value={key}>
                {EXPLORE_DOMAIN_CONFIG[key].label}
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
            {metricKeys.map((key) => (
              <option key={key} value={key}>
                {MAP_METRICS[key].shortLabel}
              </option>
            ))}
          </select>
        </div>
        <TractSearch
          features={features}
          placeholder="Search tract, GEOID, or borough"
          onSelect={(result) => onSelectTract(result.geoid)}
        />
      </div>
    </div>
  );
}
