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
        label: "Intensity retained vs. rate maximum",
        value: ({ metrics }) => metrics.intensityRetentionVsRateMaxPct,
        format: "percent",
      },
      {
        label: "Mapped complaint count",
        value: ({ metrics }) => metrics.selectedMappedComplaintCount,
        format: "integer",
      },
      {
        label: "Mapped complaint volume captured",
        value: ({ metrics }) => metrics.mappedComplaintVolumeCapturedPct,
        format: "percent",
      },
      {
        label: "Q1 tracts in selection",
        value: ({ metrics }) => metrics.selectedQ1TractSharePct,
        format: "percent",
      },
      {
        label: "Q1 share of selected intensity",
        value: ({ metrics }) => metrics.q1ShareOfSelectedIntensityPct,
        format: "percent",
      },
    ],
  },
  {
    heading: "Recorded administrative response",
    metrics: [
      {
        label: "Not recorded closed by age 30",
        value: ({ metrics }) => metrics.selectedNotClosedBy30dCount,
        format: "integer",
      },
      {
        label: "City age-30 count captured",
        value: ({ metrics }) => metrics.cityNotClosedBy30dCapturedPct,
        format: "percent",
      },
      {
        label: "Not recorded closed by age 180",
        value: ({ metrics }) => metrics.selectedNotClosedBy180dCount,
        format: "integer",
      },
      {
        label: "City age-180 count captured",
        value: ({ metrics }) => metrics.cityNotClosedBy180dCapturedPct,
        format: "percent",
      },
      {
        label: "Recorded closure within 30 days",
        value: ({ metrics }) => metrics.pooledRecordedClosureWithin30dPct,
        format: "percent",
      },
      {
        label: "Recorded closure within 180 days",
        value: ({ metrics }) => metrics.pooledRecordedClosureWithin180dPct,
        format: "percent",
      },
      {
        label: "Known timing outcomes at age 30",
        value: ({ metrics }) => metrics.selectedKnownTimingOutcomes30d,
        format: "integer",
      },
      {
        label: "Known timing outcomes at age 180",
        value: ({ metrics }) => metrics.selectedKnownTimingOutcomes180d,
        format: "integer",
      },
    ],
  },
  {
    heading: "Arrival and open-workload measures",
    metrics: [
      {
        label: "Mean complete-period arrivals",
        value: ({ metrics }) => metrics.selectedMean30dArrivals,
        format: "expected",
      },
      {
        label: "Expected cohort open at age 30",
        value: ({ metrics }) => metrics.selectedOpenAt30d,
        format: "expected",
      },
      {
        label: "Expected cohort open at age 180",
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
        label: "City population in selected tracts",
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

function IntervalRows({
  label,
  value,
}: {
  label: string;
  value: Scenario["metrics"]["selectedOpenAt30dUncertainty"];
}) {
  return (
    <>
      <tr>
        <th scope="row">{label} median open</th>
        <td>
          <data value={String(value.openMedian)} title={String(value.openMedian)}>
            {formatExpected(value.openMedian)}
          </data>
        </td>
      </tr>
      <tr>
        <th scope="row">{label} open, 80% interval</th>
        <td>
          {formatExpected(value.open80[0])}–{formatExpected(value.open80[1])}
        </td>
      </tr>
      <tr>
        <th scope="row">{label} open, 95% interval</th>
        <td>
          {formatExpected(value.open95[0])}–{formatExpected(value.open95[1])}
        </td>
      </tr>
      <tr>
        <th scope="row">{label} median recorded closure</th>
        <td>{formatPercent(value.closureMedianPct)}</td>
      </tr>
      <tr>
        <th scope="row">{label} closure, 80% interval</th>
        <td>
          {formatPercent(value.closure80Pct[0])}–
          {formatPercent(value.closure80Pct[1])}
        </td>
      </tr>
      <tr>
        <th scope="row">{label} closure, 95% interval</th>
        <td>
          {formatPercent(value.closure95Pct[0])}–
          {formatPercent(value.closure95Pct[1])}
        </td>
      </tr>
    </>
  );
}

export function ScenarioMetrics({ scenario }: { scenario: Scenario }) {
  const metrics = scenario.metrics;

  return (
    <>
      <div className={styles.primaryMetrics}>
        <div>
          <strong>{formatInteger(metrics.selectedMappedComplaintCount)}</strong>
          <span>Mapped complaints</span>
        </div>
        <div>
          <strong>{formatPercent(metrics.mappedComplaintVolumeCapturedPct)}</strong>
          <span>City mapped volume captured</span>
        </div>
        <div>
          <strong>{formatExpected(metrics.selectedOpenAt30d)}</strong>
          <span>Expected cohort open at age 30</span>
        </div>
        <div>
          <strong>{formatPercent(metrics.selectedQ1TractSharePct)}</strong>
          <span>Selected tracts in income Q1</span>
        </div>
      </div>

      <details className="disclosure">
        <summary>All exact scenario metrics</summary>
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
            <h4 className={styles.minorHeading}>Request-age uncertainty</h4>
            <table className="data-table">
              <tbody>
                <IntervalRows
                  label="Age 30"
                  value={metrics.selectedOpenAt30dUncertainty}
                />
                <IntervalRows
                  label="Age 180"
                  value={metrics.selectedOpenAt180dUncertainty}
                />
              </tbody>
            </table>
            <p className="helper-text">
              Both pooled request-age samples are sufficient. The 80% interval is
              primary; 95% intervals are retained here for detail.
            </p>
          </section>

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
                {Object.entries(scenario.geography.selectedTractCountByBorough).map(
                  ([borough, count]) => (
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
                  ),
                )}
              </tbody>
            </table>
          </section>
        </div>
      </details>
    </>
  );
}

