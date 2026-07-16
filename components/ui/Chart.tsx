import { useId } from "react";

import styles from "./Chart.module.css";

export interface ChartDatum {
  key: string;
  label: string;
  values: Record<string, number | null | undefined>;
  partial?: boolean;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  type: "bar" | "line" | "area";
  /** Bar series with the same stack key are stacked; distinct keys are grouped. */
  stack?: string;
  dashed?: boolean;
}

export interface ChartProps {
  title: string;
  description: string;
  data: readonly ChartDatum[];
  series: readonly ChartSeries[];
  yLabel?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
  minY?: number;
  maxY?: number;
  className?: string;
  emptyMessage?: string;
  tableSummary?: string | null;
}

const WIDTH = 800;
const MARGIN = { top: 25, right: 18, bottom: 49, left: 62 } as const;

const defaultFormatter = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);

function seriesValue(datum: ChartDatum, key: string): number | null {
  const value = datum.values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extent(
  data: readonly ChartDatum[],
  series: readonly ChartSeries[],
): [number, number] {
  let minimum = 0;
  let maximum = 0;
  const stackedBars = new Map<string, ChartSeries[]>();
  for (const item of series) {
    if (item.type !== "bar") continue;
    const group = item.stack ?? item.key;
    const members = stackedBars.get(group) ?? [];
    members.push(item);
    stackedBars.set(group, members);
  }

  for (const datum of data) {
    for (const item of series) {
      if (item.type === "bar") continue;
      const value = seriesValue(datum, item.key);
      if (value === null) continue;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    for (const members of stackedBars.values()) {
      let positive = 0;
      let negative = 0;
      for (const item of members) {
        const value = seriesValue(datum, item.key) ?? 0;
        if (value >= 0) positive += value;
        else negative += value;
      }
      minimum = Math.min(minimum, negative);
      maximum = Math.max(maximum, positive);
    }
  }
  if (minimum === maximum) maximum = minimum + 1;
  return [minimum, maximum];
}

function linePath(
  data: readonly ChartDatum[],
  key: string,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = "";
  let drawing = false;
  data.forEach((datum, index) => {
    const value = seriesValue(datum, key);
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)} `;
    drawing = true;
  });
  return path.trim();
}

function areaPath(
  data: readonly ChartDatum[],
  key: string,
  x: (index: number) => number,
  y: (value: number) => number,
  baseline: number,
): string {
  const points = data.flatMap((datum, index) => {
    const value = seriesValue(datum, key);
    return value === null ? [] : [{ x: x(index), y: y(value) }];
  });
  if (points.length === 0) return "";
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return "";
  return [
    `M${first.x.toFixed(2)},${baseline.toFixed(2)}`,
    ...points.map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`),
    `L${last.x.toFixed(2)},${baseline.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function Chart({
  title,
  description,
  data,
  series,
  yLabel,
  height = 300,
  valueFormatter = defaultFormatter,
  minY,
  maxY,
  className,
  emptyMessage = "No chart data are available for this scope.",
  tableSummary = "View chart data",
}: ChartProps) {
  const id = useId();
  if (data.length === 0 || series.length === 0) {
    return (
      <section className={[styles.figure, className].filter(Boolean).join(" ")}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
        <p className={styles.empty}>{emptyMessage}</p>
      </section>
    );
  }

  const [autoMin, autoMax] = extent(data, series);
  const domainMin = minY ?? autoMin;
  const domainMax = maxY ?? autoMax;
  const safeMax = domainMax === domainMin ? domainMin + 1 : domainMax;
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const xStep = plotWidth / data.length;
  const x = (index: number) => MARGIN.left + xStep * (index + 0.5);
  const y = (value: number) =>
    MARGIN.top + ((safeMax - value) / (safeMax - domainMin)) * plotHeight;
  const baseline = y(Math.max(domainMin, Math.min(0, safeMax)));
  const barGroups = Array.from(
    new Set(
      series
        .filter((item) => item.type === "bar")
        .map((item) => item.stack ?? item.key),
    ),
  );
  const groupWidth = Math.min(34, xStep * 0.72);
  const barWidth = barGroups.length > 0 ? groupWidth / barGroups.length : 0;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const ticks = Array.from({ length: 5 }, (_, index) =>
    domainMin + ((safeMax - domainMin) * index) / 4,
  );

  return (
    <figure className={[styles.figure, className].filter(Boolean).join(" ")}>
      <figcaption>
        <h3 className={styles.title} id={`${id}-title`}>
          {title}
        </h3>
        <p className={styles.description} id={`${id}-description`}>
          {description}
        </p>
      </figcaption>
      <ul className={styles.legend} aria-label="Chart series">
        {series.map((item) => (
          <li key={item.key}>
            <span
              aria-hidden="true"
              className={`${styles.seriesKey} ${styles[item.type]} ${item.dashed ? styles.dashed : ""}`}
              style={{ "--series-color": item.color } as React.CSSProperties}
            />
            {item.label}
          </li>
        ))}
        {data.some((datum) => datum.partial) && (
          <li>
            <span aria-hidden="true" className={styles.partialKey} />
            Partial period
          </li>
        )}
      </ul>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
      >
        {data.map(
          (datum, index) =>
            datum.partial && (
              <g key={`partial-${datum.key}`}>
                <rect
                  x={MARGIN.left + xStep * index}
                  y={MARGIN.top}
                  width={xStep}
                  height={plotHeight}
                  className={styles.partialBand}
                />
                <title>{`${datum.label}: partial period`}</title>
              </g>
            ),
        )}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={styles.gridLine}
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className={styles.axisLabel}
              x={MARGIN.left - 9}
              y={y(tick) + 4}
              textAnchor="end"
            >
              {valueFormatter(tick)}
            </text>
          </g>
        ))}
        <line
          className={styles.axisLine}
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={baseline}
          y2={baseline}
        />
        {yLabel && (
          <text
            className={styles.yLabel}
            x={16}
            y={MARGIN.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${MARGIN.top + plotHeight / 2})`}
          >
            {yLabel}
          </text>
        )}
        {data.map((datum, dataIndex) => {
          const groupOffsets = new Map<string, { positive: number; negative: number }>();
          return barGroups.flatMap((group, groupIndex) => {
            const members = series.filter(
              (item) =>
                item.type === "bar" && (item.stack ?? item.key) === group,
            );
            return members.flatMap((item) => {
              const value = seriesValue(datum, item.key);
              if (value === null) return [];
              const offsets = groupOffsets.get(group) ?? { positive: 0, negative: 0 };
              const start = value >= 0 ? offsets.positive : offsets.negative;
              const end = start + value;
              if (value >= 0) offsets.positive = end;
              else offsets.negative = end;
              groupOffsets.set(group, offsets);
              const left =
                x(dataIndex) - groupWidth / 2 + groupIndex * barWidth + 1;
              const top = Math.min(y(start), y(end));
              const rectangleHeight = Math.max(0.5, Math.abs(y(start) - y(end)));
              return [
                <rect
                  key={`${datum.key}-${item.key}`}
                  x={left}
                  y={top}
                  width={Math.max(1, barWidth - 2)}
                  height={rectangleHeight}
                  fill={item.color}
                  className={styles.barMark}
                >
                  <title>{`${datum.label} · ${item.label}: ${valueFormatter(value)}${datum.partial ? " · partial period" : ""}`}</title>
                </rect>,
              ];
            });
          });
        })}
        {series
          .filter((item) => item.type === "area")
          .map((item) => (
            <path
              key={`${item.key}-area`}
              d={areaPath(data, item.key, x, y, baseline)}
              fill={item.color}
              className={styles.areaMark}
            />
          ))}
        {series
          .filter((item) => item.type === "line" || item.type === "area")
          .map((item) => (
            <g key={`${item.key}-line`}>
              <path
                d={linePath(data, item.key, x, y)}
                fill="none"
                stroke={item.color}
                className={item.dashed ? styles.dashedLine : styles.lineMark}
              />
              {data.map((datum, index) => {
                const value = seriesValue(datum, item.key);
                return value === null ? null : (
                  <circle
                    key={`${datum.key}-${item.key}-point`}
                    cx={x(index)}
                    cy={y(value)}
                    r={2.8}
                    fill={item.color}
                    className={styles.pointMark}
                  >
                    <title>{`${datum.label} · ${item.label}: ${valueFormatter(value)}${datum.partial ? " · partial period" : ""}`}</title>
                  </circle>
                );
              })}
            </g>
          ))}
        {data.map((datum, index) =>
          index % labelEvery === 0 || index === data.length - 1 ? (
            <text
              key={`${datum.key}-label`}
              className={styles.axisLabel}
              x={x(index)}
              y={height - MARGIN.bottom + 19}
              textAnchor="middle"
            >
              {datum.label}
            </text>
          ) : null,
        )}
      </svg>
      {tableSummary ? (
        <details className={styles.tableDetails}>
          <summary>{tableSummary}</summary>
          <div className={styles.tableScroll}>
            <table>
            <thead>
              <tr>
                <th scope="col">Period</th>
                {series.map((item) => (
                  <th scope="col" key={item.key}>
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((datum) => (
                <tr key={datum.key}>
                  <th scope="row">
                    {datum.label}
                    {datum.partial ? " (partial)" : ""}
                  </th>
                  {series.map((item) => {
                    const value = seriesValue(datum, item.key);
                    return (
                      <td key={item.key}>
                        {value === null ? "Not available" : valueFormatter(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
