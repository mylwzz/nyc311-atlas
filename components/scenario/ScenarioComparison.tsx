import type { Scenario, TractFeature } from "@/lib/artifacts";
import {
  compareScenarioMembership,
  type ScenarioMembershipComparison,
} from "@/lib/scenario";
import {
  formatExpected,
  formatInteger,
  formatPercent,
  formatTractName,
} from "@/lib/formatting";

import styles from "./ScenarioLab.module.css";

interface ComparisonMetric {
  label: string;
  value: (scenario: Scenario) => number;
  format: (value: number) => string;
}

const COMPARISON_METRICS: readonly ComparisonMetric[] = [
  {
    label: "Mapped complaint count",
    value: ({ metrics }) => metrics.selectedMappedComplaintCount,
    format: formatInteger,
  },
  {
    label: "Share of mapped complaints in surfaced tracts",
    value: ({ metrics }) => metrics.mappedComplaintVolumeCapturedPct,
    format: formatPercent,
  },
  {
    label: "Intensity retained vs. rate maximum",
    value: ({ metrics }) => metrics.intensityRetentionVsRateMaxPct,
    format: formatPercent,
  },
  {
    label: "Lower-income tract share",
    value: ({ metrics }) => metrics.selectedQ1TractSharePct,
    format: formatPercent,
  },
  {
    label: "Estimated still open after 30 days",
    value: ({ metrics }) => metrics.selectedOpenAt30d,
    format: formatExpected,
  },
  {
    label: "Estimated still open after ~6 months",
    value: ({ metrics }) => metrics.selectedOpenAt180d,
    format: formatExpected,
  },
];

function ScenarioIdentity({ scenario }: { scenario: Scenario }) {
  const intensityWeight = Math.round(scenario.alphaIntensity * 100);
  return (
    <span>
      {scenario.scalingMode === "rank_balanced"
        ? "Rank-balanced"
        : "Magnitude-sensitive"}
      {" · "}
      {scenario.domainLabel}
      {" · "}
      {intensityWeight}% complaint-intensity weight
      {" · "}
      {scenario.k} tracts
    </span>
  );
}

function signedValue(value: number, format: (value: number) => string): string {
  if (value === 0) return format(0);
  return `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`;
}

function MembershipList({
  label,
  geoids,
  featureByGeoid,
}: {
  label: string;
  geoids: readonly string[];
  featureByGeoid: ReadonlyMap<string, TractFeature>;
}) {
  return (
    <details className={styles.membershipList}>
      <summary>
        {label} <span>{formatInteger(geoids.length)}</span>
      </summary>
      {geoids.length === 0 ? (
        <p className="helper-text">None.</p>
      ) : (
        <ol>
          {geoids.map((geoid) => {
            const tract = featureByGeoid.get(geoid)?.properties;
            return (
              <li key={geoid}>
                <span>
                  {tract
                    ? formatTractName(tract.tractName, tract.borough)
                    : `Census tract ${geoid}`}
                </span>
                <small>{geoid}</small>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

export function ScenarioComparison({
  current,
  pinned,
  features,
}: {
  current: Scenario;
  pinned: Scenario;
  features: readonly TractFeature[];
}) {
  const comparison: ScenarioMembershipComparison = compareScenarioMembership(
    current,
    pinned,
  );
  const featureByGeoid = new Map(
    features.map((feature) => [feature.properties.geoid, feature]),
  );

  return (
    <div className={styles.comparison}>
      <div className={styles.identityGrid}>
        <div>
          <span className="eyebrow">Current definition</span>
          <ScenarioIdentity scenario={current} />
        </div>
        <div>
          <span className="eyebrow">Saved definition</span>
          <ScenarioIdentity scenario={pinned} />
        </div>
      </div>

      <div className={styles.membershipSummary}>
        <div>
          <strong>{comparison.enteredGeoids.length}</strong>
          <span>Newly surfaced</span>
        </div>
        <div>
          <strong>{comparison.exitedGeoids.length}</strong>
          <span>No longer surfaced</span>
        </div>
        <div>
          <strong>{comparison.sharedGeoids.length}</strong>
          <span>Shared</span>
        </div>
      </div>
      <p className="helper-text">
        Changes compare the current priority definition with the saved one. Rank
        order is {comparison.rankOrderUnchanged ? "the same" : "different"}.
      </p>
      {comparison.membershipUnchanged &&
      current.alphaIntensity !== pinned.alphaIntensity ? (
        <div className="status-box" role="status">
          Weights changed, but no tract crossed the selection boundary.
          Membership is unchanged.
        </div>
      ) : null}

      <div className={styles.membershipLists}>
        <MembershipList
          label="Newly surfaced tracts"
          geoids={comparison.enteredGeoids}
          featureByGeoid={featureByGeoid}
        />
        <MembershipList
          label="Tracts no longer surfaced"
          geoids={comparison.exitedGeoids}
          featureByGeoid={featureByGeoid}
        />
        <MembershipList
          label="Shared tracts"
          geoids={comparison.sharedGeoids}
          featureByGeoid={featureByGeoid}
        />
      </div>

      <details className="disclosure">
        <summary>Metric changes</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Current definition</th>
              <th scope="col">Saved definition</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_METRICS.map((metric) => {
              const currentValue = metric.value(current);
              const pinnedValue = metric.value(pinned);
              return (
                <tr key={metric.label}>
                  <th scope="row">{metric.label}</th>
                  <td>{metric.format(currentValue)}</td>
                  <td>{metric.format(pinnedValue)}</td>
                  <td>{signedValue(currentValue - pinnedValue, metric.format)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}
