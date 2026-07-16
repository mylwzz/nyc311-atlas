import type { Scenario } from "@/lib/artifacts";
import {
  formatCurrency,
  formatDecimal,
  formatExpected,
  formatInteger,
  formatPercent,
} from "@/lib/formatting";

import styles from "./ScenarioLab.module.css";

type ScenarioMetricFormat =
  | "currency"
  | "decimal"
  | "expected"
  | "integer"
  | "percent";

interface ScenarioMetricDefinition {
  label: string;
  value: (scenario: Scenario) => number;
  format: ScenarioMetricFormat;
}

const METRIC_GROUPS: readonly {
  heading: string;
  metrics: readonly ScenarioMetricDefinition[];
}[] = [
  {
    heading: "Complaint activity",
    metrics: [
      {
        label: "Selected complaint intensity sum",
        value: ({ metrics }) => metrics.selectedComplaintIntensitySum,
        format: "decimal",
      },
      {
        label: "Complaint intensity retained",
        value: ({ metrics }) => metrics.intensityRetentionVsRateMaxPct,
        format: "percent",
      },
      {
        label: "Mapped complaint count",
        value: ({ metrics }) => metrics.selectedMappedComplaintCount,
        format: "integer",
      },
      {
        label: "Share of mapped complaints in surfaced tracts",
        value: ({ metrics }) => metrics.mappedComplaintVolumeCapturedPct,
        format: "percent",
      },
      {
        label: "Lower-income tracts surfaced",
        value: ({ metrics }) => metrics.selectedQ1TractSharePct,
        format: "percent",
      },
      {
        label: "Lower-income share of selected intensity",
        value: ({ metrics }) => metrics.q1ShareOfSelectedIntensityPct,
        format: "percent",
      },
    ],
  },
  {
    heading: "Administrative closure",
    metrics: [
      {
        label: "Still open after 30 days",
        value: ({ metrics }) => metrics.selectedNotClosedBy30dCount,
        format: "integer",
      },
      {
        label: "City 30-day still-open count captured",
        value: ({ metrics }) => metrics.cityNotClosedBy30dCapturedPct,
        format: "percent",
      },
      {
        label: "Still open after ~6 months",
        value: ({ metrics }) => metrics.selectedNotClosedBy180dCount,
        format: "integer",
      },
      {
        label: "City ~6-month still-open count captured",
        value: ({ metrics }) => metrics.cityNotClosedBy180dCapturedPct,
        format: "percent",
      },
      {
        label: "Closed within 30 days",
        value: ({ metrics }) => metrics.pooledRecordedClosureWithin30dPct,
        format: "percent",
      },
      {
        label: "Closed within ~6 months",
        value: ({ metrics }) => metrics.pooledRecordedClosureWithin180dPct,
        format: "percent",
      },
      {
        label: "30-day response sample",
        value: ({ metrics }) => metrics.selectedKnownTimingOutcomes30d,
        format: "integer",
      },
      {
        label: "~6-month response sample",
        value: ({ metrics }) => metrics.selectedKnownTimingOutcomes180d,
        format: "integer",
      },
    ],
  },
  {
    heading: "Model estimates",
    metrics: [
      {
        label: "Average new requests per full month",
        value: ({ metrics }) => metrics.selectedMean30dArrivals,
        format: "expected",
      },
      {
        label: "Still open after 30 days",
        value: ({ metrics }) => metrics.selectedOpenAt30d,
        format: "expected",
      },
      {
        label: "Still open after ~6 months",
        value: ({ metrics }) => metrics.selectedOpenAt180d,
        format: "expected",
      },
    ],
  },
  {
    heading: "Population and income context",
    metrics: [
      {
        label: "Selected population",
        value: ({ metrics }) => metrics.selectedPopulation,
        format: "integer",
      },
      {
        label: "City population in surfaced tracts",
        value: ({ metrics }) => metrics.cityPopulationInSelectedTractsPct,
        format: "percent",
      },
      {
        label: "Mean tract median household income",
        value: ({ metrics }) => metrics.meanSelectedTractMedianIncome,
        format: "currency",
      },
      {
        label: "Median tract median household income",
        value: ({ metrics }) => metrics.medianSelectedTractMedianIncome,
        format: "currency",
      },
    ],
  },
];

function formatMetric(value: number, format: ScenarioMetricFormat): string {
  switch (format) {
    case "currency":
      return formatCurrency(value);
    case "decimal":
      return formatDecimal(value);
    case "expected":
      return formatExpected(value);
    case "integer":
      return formatInteger(value);
    case "percent":
      return formatPercent(value);
  }
}

export function ScenarioMetrics({ scenario }: { scenario: Scenario }) {
  const metrics = scenario.metrics;
  const surfacedCount = scenario.selection.rankedSelectedGeoids.length;

  return (
    <>
      <div className={styles.resultLead} aria-live="polite">
        <strong>{formatInteger(surfacedCount)} tracts surfaced</strong>
        <span>
          Historical, deterministic selection under the definition above.
        </span>
      </div>

      <div className={styles.primaryMetrics}>
        <div>
          <strong>{formatPercent(metrics.mappedComplaintVolumeCapturedPct)}</strong>
          <span>Mapped complaints in surfaced tracts</span>
        </div>
        <div>
          <strong>{formatPercent(metrics.intensityRetentionVsRateMaxPct)}</strong>
          <span>Complaint intensity retained</span>
        </div>
        <div>
          <strong>{formatPercent(metrics.selectedQ1TractSharePct)}</strong>
          <span>Lower-income tract share</span>
        </div>
        <div>
          <span className={styles.modelLabel}>Model estimate</span>
          <strong>{formatExpected(metrics.selectedOpenAt30d)}</strong>
          <span>Still open after 30 days</span>
        </div>
      </div>

      <details className="disclosure">
        <summary>All result measures</summary>
        <div className={styles.metricGroups}>
          {METRIC_GROUPS.map((group) => (
            <section key={group.heading}>
              <h4 className={styles.minorHeading}>{group.heading}</h4>
              <table className="data-table">
                <tbody>
                  {group.metrics.map((definition) => {
                    const value = definition.value(scenario);
                    return (
                      <tr key={definition.label}>
                        <th scope="row">{definition.label}</th>
                        <td>
                          <data value={String(value)} title={String(value)}>
                            {formatMetric(value, definition.format)}
                          </data>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}

          <section>
            <h4 className={styles.minorHeading}>Borough composition</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Borough</th>
                  <th scope="col">Tracts</th>
                  <th scope="col">Population</th>
                  <th scope="col">Borough share</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(
                  scenario.geography.selectedTractCountByBorough,
                ).map(([borough, count]) => (
                  <tr key={borough}>
                    <th scope="row">{borough}</th>
                    <td>{formatInteger(count)}</td>
                    <td>
                      {formatInteger(
                        scenario.geography.selectedPopulationByBorough[
                          borough as keyof typeof scenario.geography.selectedPopulationByBorough
                        ],
                      )}
                    </td>
                    <td>
                      {formatPercent(
                        scenario.geography.boroughPopulationInSelectedTractsPct[
                          borough as keyof typeof scenario.geography.boroughPopulationInSelectedTractsPct
                        ],
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </details>
    </>
  );
}
