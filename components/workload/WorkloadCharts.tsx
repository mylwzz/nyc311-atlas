"use client";

import { InfoMarker } from "@/components/ui/InfoMarker";
import type { ReplayPeriod, WorkloadAgeBucket } from "@/lib/workload";

import styles from "./WorkloadPanel.module.css";

const WIDTH = 520;
const HEIGHT = 154;
const PAD = { top: 14, right: 12, bottom: 24, left: 34 };

const ARRIVALS_CHART_TITLE = "Requests and modeled closures";
const OPEN_BALANCE_CHART_TITLE = "Modeled requests still open over time";
const OPEN_BY_AGE_CHART_TITLE = "Still-open requests by age";

function ChartEmpty({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <figure className="chart-figure">
      <figcaption>{title}</figcaption>
      <div className={styles.chartEmpty} role="status">
        {message}
      </div>
    </figure>
  );
}

function safeMax(values: readonly number[]): number {
  return Math.max(1, ...values.filter(Number.isFinite));
}

function xAt(index: number, count: number): number {
  if (count <= 1) return PAD.left;
  return PAD.left + (index / (count - 1)) * (WIDTH - PAD.left - PAD.right);
}

function yAt(value: number, maximum: number): number {
  return HEIGHT - PAD.bottom - (value / maximum) * (HEIGHT - PAD.top - PAD.bottom);
}

function Line({ values, maximum, className }: {
  values: readonly number[];
  maximum: number;
  className?: string;
}) {
  const points = values
    .map((value, index) => `${xAt(index, values.length)},${yAt(value, maximum)}`)
    .join(" ");
  return <polyline className={`chart-line${className ? ` ${className}` : ""}`} points={points} />;
}

function Axes({ maximum, count, partialIndex, runoffIndex }: {
  maximum: number;
  count: number;
  partialIndex?: number;
  runoffIndex?: number;
}) {
  return (
    <>
      {[0, 0.5, 1].map((fraction) => {
        const value = maximum * fraction;
        const y = yAt(value, maximum);
        return (
          <g key={fraction}>
            <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} />
            <text x={PAD.left - 5} y={y + 3} textAnchor="end">
              {Math.round(value).toLocaleString("en-US")}
            </text>
          </g>
        );
      })}
      <text x={PAD.left} y={HEIGHT - 5}>P1</text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 5} textAnchor="end">P{count}</text>
      {partialIndex !== undefined ? (
        <text
          x={xAt(partialIndex, count)}
          y={HEIGHT - 5}
          textAnchor="middle"
          className="chart-partial-label"
        >
          partial
        </text>
      ) : null}
      {runoffIndex !== undefined && runoffIndex < count ? (
        <>
          <line
            x1={xAt(runoffIndex - 0.5, count)}
            x2={xAt(runoffIndex - 0.5, count)}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            stroke="#98958d"
            strokeDasharray="3 3"
          />
          <text
            x={xAt(runoffIndex, count)}
            y={PAD.top + 8}
            className={styles.runoffLabel}
          >
            modeled follow-through
          </text>
        </>
      ) : null}
    </>
  );
}

export function ArrivalsClosuresChart({
  replay,
  arrivalPeriodCount,
  assumptionBased = false,
}: {
  replay: readonly ReplayPeriod[];
  arrivalPeriodCount: number;
  assumptionBased?: boolean;
}) {
  const historicalPeriods = replay.slice(0, arrivalPeriodCount);
  if (historicalPeriods.length === 0) {
    return (
      <ChartEmpty
        title={ARRIVALS_CHART_TITLE}
        message="Load Model data or choose a scope with historical arrivals."
      />
    );
  }
  const arrivals = historicalPeriods.map((period) => period.newRequests);
  const closures = historicalPeriods.map(
    (period) => period.expectedRecordedClosures,
  );
  const maximum = safeMax([...arrivals, ...closures]);
  const barWidth = Math.max(
    2,
    (WIDTH - PAD.left - PAD.right) / historicalPeriods.length - 3,
  );
  return (
    <figure className="chart-figure">
      <figcaption>
        {ARRIVALS_CHART_TITLE}
        <span className={styles.visualGrammar}>
          {assumptionBased
            ? "Assumption-adjusted bars · model-derived line"
            : "Observed requests · model-derived closures"}
        </span>
      </figcaption>
      <div className="chart-legend">
        <span style={{ "--legend-color": "#8c9587" } as React.CSSProperties}>
          {assumptionBased ? "Assumption-adjusted requests" : "Observed 2016 arrivals"}
        </span>
        <span style={{ "--legend-color": "#262521" } as React.CSSProperties}>
          Modeled closures
        </span>
      </div>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Request arrivals and modeled closure replay chart">
        <Axes maximum={maximum} count={historicalPeriods.length} partialIndex={12} />
        {arrivals.map((value, index) => (
          <rect
            key={index}
            className={`chart-bar${index === 12 ? " partial" : ""}`}
            x={xAt(index, arrivals.length) - barWidth / 2}
            y={yAt(value, maximum)}
            width={barWidth}
            height={HEIGHT - PAD.bottom - yAt(value, maximum)}
          />
        ))}
        <Line values={closures} maximum={maximum} />
      </svg>
    </figure>
  );
}

export function OpenBalanceChart({
  replay,
  assumptionBased = false,
}: {
  replay: readonly ReplayPeriod[];
  assumptionBased?: boolean;
}) {
  if (replay.length === 0) {
    return (
      <ChartEmpty
        title={OPEN_BALANCE_CHART_TITLE}
        message="Not enough response data for this chart."
      />
    );
  }
  const values = replay.map((period) => period.expectedOpenBalance);
  const maximum = safeMax(values);
  return (
    <figure className="chart-figure">
      <figcaption>
        {OPEN_BALANCE_CHART_TITLE}
        <span className={styles.visualGrammar}>
          {assumptionBased
            ? "What-if assumptions · model-derived"
            : "Historical replay · model estimate"}
        </span>
      </figcaption>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Modeled requests still open over time">
        <Axes
          maximum={maximum}
          count={replay.length}
          partialIndex={12}
          runoffIndex={13}
        />
        <Line values={values} maximum={maximum} />
      </svg>
    </figure>
  );
}

const AGE_BUCKETS: readonly { key: WorkloadAgeBucket; label: string; color: string }[] = [
  { key: "0_30", label: "First month", color: "#606b61" },
  { key: "31_60", label: "1–2 months", color: "#7c887c" },
  { key: "61_90", label: "2–3 months", color: "#99a091" },
  { key: "91_180", label: "3–6 months", color: "#b4ad93" },
  { key: "181_360", label: "6–12 months", color: "#a98468" },
  { key: "361_plus", label: "Over a year", color: "#8c5c4d" },
];

export function OpenByAgeChart({
  replay,
  assumptionBased = false,
}: {
  replay: readonly ReplayPeriod[];
  assumptionBased?: boolean;
}) {
  if (replay.length === 0) {
    return (
      <ChartEmpty
        title={OPEN_BY_AGE_CHART_TITLE}
        message="Not enough response data for this chart."
      />
    );
  }
  const totals = replay.map((period) => period.expectedOpenBalance);
  const maximum = safeMax(totals);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const barWidth = Math.max(2, plotWidth / replay.length - 3);
  return (
    <figure className="chart-figure">
      <figcaption>
        {OPEN_BY_AGE_CHART_TITLE}
        <span className={styles.visualGrammar}>
          {assumptionBased
            ? "What-if assumptions · model-derived"
            : "Historical replay · model estimate"}
        </span>
      </figcaption>
      <div className="chart-legend">
        {AGE_BUCKETS.map((bucket) => (
          <span key={bucket.key} style={{ "--legend-color": bucket.color } as React.CSSProperties}>
            {bucket.label}
          </span>
        ))}
      </div>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Still-open requests by age">
        <Axes
          maximum={maximum}
          count={replay.length}
          partialIndex={12}
          runoffIndex={13}
        />
        {replay.map((period, index) => {
          let accumulated = 0;
          return AGE_BUCKETS.map((bucket) => {
            const value = period.openByAge[bucket.key];
            const yTop = yAt(accumulated + value, maximum);
            const yBottom = yAt(accumulated, maximum);
            accumulated += value;
            return (
              <rect
                key={bucket.key}
                x={xAt(index, replay.length) - barWidth / 2}
                y={yTop}
                width={barWidth}
                height={Math.max(0, yBottom - yTop)}
                fill={bucket.color}
              />
            );
          });
        })}
      </svg>
    </figure>
  );
}

export function UncertaintyIntervalBand({
  lower,
  median,
  upper,
  label,
  onReadMethod,
}: {
  lower: number;
  median: number;
  upper: number;
  label: string;
  onReadMethod?: () => void;
}) {
  const maximum = Math.max(upper, median, lower, 1);
  const x = (value: number) => 14 + (Math.max(0, value) / maximum) * 472;
  const lowerX = x(lower);
  const medianX = x(median);
  const upperX = x(upper);

  return (
    <figure className={styles.intervalFigure}>
      <figcaption>
        {label}
        <InfoMarker
          label="About this uncertainty interval"
          onReadMethod={onReadMethod}
        >
          <div>
            <p>
              The range comes from deterministic resampling of the twelve
              complete historical months together with finite-sample uncertainty
              in recorded closure. The final six-day partial period is excluded.
            </p>
            <p>
              It does not include future structural change, reporting change,
              or ACS population-estimate uncertainty.
            </p>
          </div>
        </InfoMarker>
      </figcaption>
      <svg
        viewBox="0 0 500 54"
        role="img"
        aria-label={`${label}: ${lower.toFixed(1)} to ${upper.toFixed(1)}, median ${median.toFixed(1)}`}
      >
        <line
          className={styles.intervalAxis}
          x1="14"
          x2="486"
          y1="26"
          y2="26"
        />
        <rect
          className={styles.intervalBand}
          x={lowerX}
          y="17"
          width={Math.max(2, upperX - lowerX)}
          height="18"
          rx="2"
        />
        <line
          className={styles.intervalMedian}
          x1={medianX}
          x2={medianX}
          y1="13"
          y2="39"
        />
        <text x={lowerX} y="51" textAnchor="start">
          {lower.toLocaleString("en-US", { maximumFractionDigits: 1 })}
        </text>
        <text x={medianX} y="10" textAnchor="middle">
          median {median.toLocaleString("en-US", { maximumFractionDigits: 1 })}
        </text>
        <text x={upperX} y="51" textAnchor="end">
          {upper.toLocaleString("en-US", { maximumFractionDigits: 1 })}
        </text>
      </svg>
    </figure>
  );
}
