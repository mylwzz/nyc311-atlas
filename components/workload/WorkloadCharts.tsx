"use client";

import type { ReplayPeriod, WorkloadAgeBucket } from "@/lib/workload";

const WIDTH = 520;
const HEIGHT = 154;
const PAD = { top: 14, right: 12, bottom: 24, left: 34 };

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

function Axes({ maximum, count, partialIndex }: {
  maximum: number;
  count: number;
  partialIndex?: number;
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
    </>
  );
}

export function ArrivalsClosuresChart({ replay, arrivalPeriodCount }: {
  replay: readonly ReplayPeriod[];
  arrivalPeriodCount: number;
}) {
  const arrivals = replay.map((period) => period.newRequests);
  const closures = replay.map((period) => period.expectedRecordedClosures);
  const maximum = safeMax([...arrivals, ...closures]);
  const barWidth = Math.max(2, (WIDTH - PAD.left - PAD.right) / replay.length - 3);
  return (
    <figure className="chart-figure">
      <figcaption>New requests and expected recorded closures</figcaption>
      <div className="chart-legend">
        <span style={{ "--legend-color": "#8c9587" } as React.CSSProperties}>New requests</span>
        <span style={{ "--legend-color": "#262521" } as React.CSSProperties}>Expected recorded closures</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Arrival and expected recorded closure replay chart">
        <Axes maximum={maximum} count={replay.length} partialIndex={12} />
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
        <line
          x1={xAt(arrivalPeriodCount - 0.5, replay.length)}
          x2={xAt(arrivalPeriodCount - 0.5, replay.length)}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          stroke="#98958d"
          strokeDasharray="3 3"
        />
      </svg>
    </figure>
  );
}

export function OpenBalanceChart({ replay }: { replay: readonly ReplayPeriod[] }) {
  const values = replay.map((period) => period.expectedOpenBalance);
  const maximum = safeMax(values);
  return (
    <figure className="chart-figure">
      <figcaption>Expected open balance</figcaption>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Expected open balance replay chart">
        <Axes maximum={maximum} count={replay.length} partialIndex={12} />
        <Line values={values} maximum={maximum} />
      </svg>
    </figure>
  );
}

const AGE_BUCKETS: readonly { key: WorkloadAgeBucket; label: string; color: string }[] = [
  { key: "0_30", label: "0–30", color: "#606b61" },
  { key: "31_60", label: "31–60", color: "#7c887c" },
  { key: "61_90", label: "61–90", color: "#99a091" },
  { key: "91_180", label: "91–180", color: "#b4ad93" },
  { key: "181_360", label: "181–360", color: "#a98468" },
  { key: "361_plus", label: "361+", color: "#8c5c4d" },
];

export function OpenByAgeChart({ replay }: { replay: readonly ReplayPeriod[] }) {
  const totals = replay.map((period) => period.expectedOpenBalance);
  const maximum = safeMax(totals);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const barWidth = Math.max(2, plotWidth / replay.length - 3);
  return (
    <figure className="chart-figure">
      <figcaption>Open workload by request-age bucket</figcaption>
      <div className="chart-legend">
        {AGE_BUCKETS.map((bucket) => (
          <span key={bucket.key} style={{ "--legend-color": bucket.color } as React.CSSProperties}>
            {bucket.label} days
          </span>
        ))}
      </div>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Expected open workload by request-age bucket chart">
        <Axes maximum={maximum} count={replay.length} partialIndex={12} />
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
