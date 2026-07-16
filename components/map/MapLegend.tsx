import {
  MAP_COLORS,
  NEIGHBORHOOD_LEGEND,
  type LegendItem,
  type MapColor,
  type MetricColorScale,
} from "@/lib/map";
import { PopulationDenominatorInfo } from "@/components/ui/PopulationDenominatorInfo";

import styles from "./MapLegend.module.css";

const cssColor = (color: MapColor) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(color[3] ?? 255) / 255})`;

export interface MapLegendProps {
  scale: MetricColorScale;
  neighborhoodActive?: boolean;
  scenarioActive?: boolean;
  pinnedScenarioActive?: boolean;
  denominatorMetricActive?: boolean;
  className?: string;
}

function LegendRow({ item }: { item: LegendItem }) {
  return (
    <li className={styles.item}>
      <span
        aria-hidden="true"
        className={`${styles.swatch} ${item.texture ? styles[item.texture] : ""}`}
        style={{ backgroundColor: cssColor(item.color) }}
      />
      <span>{item.label}</span>
    </li>
  );
}

export function MapLegend({
  scale,
  neighborhoodActive = false,
  scenarioActive = false,
  pinnedScenarioActive = false,
  denominatorMetricActive = false,
  className,
}: MapLegendProps) {
  const items = neighborhoodActive ? NEIGHBORHOOD_LEGEND : scale.legendItems;
  return (
    <section
      className={[styles.legend, className].filter(Boolean).join(" ")}
      aria-label="Map legend"
    >
      <h2 className={styles.title}>
        {neighborhoodActive ? "Relative to active tract" : scale.label}
        {denominatorMetricActive ? (
          <PopulationDenominatorInfo passive />
        ) : null}
      </h2>
      <ul className={styles.items}>
        {items.map((item) => (
          <LegendRow item={item} key={item.label} />
        ))}
      </ul>
      {(scenarioActive || neighborhoodActive) && (
        <div className={styles.overlays}>
          {scenarioActive && (
            <div className={styles.overlayRow}>
              <span
                aria-hidden="true"
                className={`${styles.swatch} ${styles.outline}`}
                style={{ backgroundColor: cssColor(MAP_COLORS.scenarioCurrent) }}
              />
              {pinnedScenarioActive
                ? "Current only · newly surfaced"
                : "Current priority definition"}
            </div>
          )}
          {pinnedScenarioActive && (
            <div className={styles.overlayRow}>
              <span
                aria-hidden="true"
                className={`${styles.swatch} ${styles.outline}`}
                style={{ backgroundColor: cssColor(MAP_COLORS.scenarioPinned) }}
              />
              Saved only · no longer surfaced
            </div>
          )}
          {scenarioActive && pinnedScenarioActive && (
            <div className={styles.overlayRow}>
              <span
                aria-hidden="true"
                className={`${styles.swatch} ${styles.outline}`}
                style={{ backgroundColor: cssColor(MAP_COLORS.scenarioShared) }}
              />
              Shared by both definitions
            </div>
          )}
          {neighborhoodActive && (
            <div className={styles.overlayRow}>
              <span
                aria-hidden="true"
                className={`${styles.swatch} ${styles.dots}`}
                style={{ backgroundColor: "transparent" }}
              />
              Neighborhood outer perimeter
            </div>
          )}
        </div>
      )}
    </section>
  );
}
