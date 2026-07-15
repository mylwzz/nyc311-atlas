"use client";

import type { PickingInfo } from "@deck.gl/core";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  DOMAIN_LABELS,
  type DomainKey,
  type TractFeature,
  type TractsGeoJson,
} from "@/lib/artifacts";
import {
  createAtlasLayers,
  createMetricColorScale,
  DragSafeClickGuard,
  featureBounds,
  formatMetricValue,
  formatTractName,
  getActiveDomainSummary,
  getMapMetricDatum,
  MAP_METRICS,
  resolveMapDisplayMetric,
  type Coordinate,
  type MapMetricKey,
  type NeighborhoodMetricKey,
  type ScenarioLayerState,
} from "@/lib/map";
import {
  geometryWorkerFeatures,
  type GeometryWorkerRequest,
  type GeometryWorkerResponse,
} from "@/lib/map/geometry-worker-contract";

import { MapLegend } from "./MapLegend";
import { TractSearch } from "./TractSearch";
import styles from "./AtlasMap.module.css";

const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "atlas-background",
      type: "background",
      paint: { "background-color": "#d8d5ce" },
    },
  ],
};

const boroughCache = new WeakMap<
  TractsGeoJson,
  FeatureCollection<Polygon | MultiPolygon, { borough: string }>
>();
const perimeterCache = new Map<string, Coordinate[]>();
let geometryRequestId = 0;

export interface AtlasNeighborhoodMapState {
  includedGeoids: ReadonlySet<string>;
  metric: NeighborhoodMetricKey;
}

export interface AtlasScenarioMapState {
  currentGeoids: ReadonlySet<string>;
  pinnedGeoids?: ReadonlySet<string> | null;
}

export interface AtlasMapProps {
  tracts: TractsGeoJson;
  domain: DomainKey;
  metric: MapMetricKey;
  selectedGeoids: readonly string[];
  activeGeoid: string | null;
  neighborhood?: AtlasNeighborhoodMapState | null;
  scenario?: AtlasScenarioMapState | null;
  onTractClick: (geoid: string) => void;
  onEmptyClick: () => void;
  onClearSelection?: () => void;
  onHoverGeoid?: (geoid: string | null) => void;
  onMapReady?: (map: MapLibreMap) => void;
  onMapError?: (error: Error) => void;
  initialView?: {
    center?: Coordinate;
    zoom?: number;
  };
  showSearch?: boolean;
  showLegend?: boolean;
  className?: string;
  children?: ReactNode;
}

export interface AtlasMapHandle {
  focusTract(geoid: string): void;
  resize(): void;
  getMap(): MapLibreMap | null;
}

interface HoverState {
  feature: TractFeature;
  x: number;
  y: number;
  source: "pointer" | "keyboard";
}

function isTractFeature(value: unknown): value is TractFeature {
  if (!value || typeof value !== "object") return false;
  const feature = value as Partial<TractFeature>;
  return (
    feature.type === "Feature" &&
    typeof feature.properties?.geoid === "string" &&
    (feature.geometry?.type === "Polygon" ||
      feature.geometry?.type === "MultiPolygon")
  );
}

function errorFromUnknown(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "The map could not render.");
}

function sampleNote(status: string | null): string | null {
  switch (status) {
    case "no_requests":
      return "No mapped requests in this domain.";
    case "no_known_timing":
      return "Requests are present, but closure timing is unavailable.";
    case "insufficient_sample":
      return "Insufficient tract-specific response sample.";
    default:
      return null;
  }
}

export const AtlasMap = forwardRef<AtlasMapHandle, AtlasMapProps>(
  function AtlasMap(
    {
      tracts,
      domain,
      metric,
      selectedGeoids,
      activeGeoid,
      neighborhood = null,
      scenario = null,
      onTractClick,
      onEmptyClick,
      onClearSelection,
      onHoverGeoid,
      onMapReady,
      onMapError,
      initialView,
      showSearch = true,
      showLegend = true,
      className,
      children,
    },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const overlayRef = useRef<MapboxOverlay | null>(null);
    const clickGuardRef = useRef(new DragSafeClickGuard());
    const layersRef = useRef<ReturnType<typeof createAtlasLayers>>([]);
    const onTractClickRef = useRef(onTractClick);
    const onEmptyClickRef = useRef(onEmptyClick);
    const onHoverGeoidRef = useRef(onHoverGeoid);
    const onMapReadyRef = useRef(onMapReady);
    const onMapErrorRef = useRef(onMapError);
    const initialViewRef = useRef(initialView);
    const [hover, setHover] = useState<HoverState | null>(null);
    const [boroughBoundaries, setBoroughBoundaries] = useState<
      FeatureCollection<Polygon | MultiPolygon, { borough: string }> | null
    >(() => boroughCache.get(tracts) ?? null);
    const [neighborhoodPerimeter, setNeighborhoodPerimeter] = useState<
      readonly Coordinate[]
    >([]);

    onTractClickRef.current = onTractClick;
    onEmptyClickRef.current = onEmptyClick;
    onHoverGeoidRef.current = onHoverGeoid;
    onMapReadyRef.current = onMapReady;
    onMapErrorRef.current = onMapError;

    const featureByGeoid = useMemo(
      () =>
        new Map(
          tracts.features.map((feature) => [feature.properties.geoid, feature]),
        ),
      [tracts],
    );
    const featureByGeoidRef = useRef(featureByGeoid);
    const activeGeoidRef = useRef(activeGeoid);
    const selectedGeoidsRef = useRef(selectedGeoids);
    featureByGeoidRef.current = featureByGeoid;
    activeGeoidRef.current = activeGeoid;
    selectedGeoidsRef.current = selectedGeoids;
    const metricScale = useMemo(
      () => createMetricColorScale(tracts.features, domain, metric),
      [tracts, domain, metric],
    );
    const neighborhoodKey = neighborhood
      ? `${tracts.artifactSetId}|${[...neighborhood.includedGeoids].sort().join(",")}`
      : null;

    useEffect(() => {
      let cancelled = false;
      const cached = boroughCache.get(tracts);
      if (cached) {
        setBoroughBoundaries(cached);
        return;
      }

      const id = ++geometryRequestId;
      let worker: Worker | null = null;
      try {
        worker = new Worker(
          new URL("../../workers/geometry.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        worker = null;
      }

      if (worker) {
        worker.onmessage = (event: MessageEvent<GeometryWorkerResponse>) => {
          if (cancelled || event.data.id !== id) return;
          if (!event.data.ok) {
            onMapErrorRef.current?.(new Error(event.data.error));
          } else if (event.data.kind === "borough_boundaries") {
            boroughCache.set(tracts, event.data.boundaries);
            setBoroughBoundaries(event.data.boundaries);
          }
          worker?.terminate();
          worker = null;
        };
        worker.onerror = (event) => {
          if (!cancelled) {
            onMapErrorRef.current?.(
              new Error(event.message || "Borough boundaries could not be prepared."),
            );
          }
          worker?.terminate();
          worker = null;
        };
        worker.postMessage({
          id,
          kind: "borough_boundaries",
          features: geometryWorkerFeatures(tracts),
        } satisfies GeometryWorkerRequest);
      } else {
        // Graceful fallback for environments without Worker support. Production
        // browsers take the worker path, keeping Turf dissolves off the map thread.
        void import("@/lib/map/geometry")
          .then(({ buildBoroughBoundaries }) => {
            if (cancelled) return;
            const boundaries = buildBoroughBoundaries(tracts);
            boroughCache.set(tracts, boundaries);
            setBoroughBoundaries(boundaries);
          })
          .catch((error: unknown) => {
            if (!cancelled) onMapErrorRef.current?.(errorFromUnknown(error));
          });
      }
      return () => {
        cancelled = true;
        worker?.terminate();
      };
    }, [tracts]);

    useEffect(() => {
      let cancelled = false;
      if (!neighborhood || !neighborhoodKey) {
        setNeighborhoodPerimeter([]);
        return;
      }
      const cached = perimeterCache.get(neighborhoodKey);
      if (cached) {
        setNeighborhoodPerimeter(cached);
        return;
      }
      setNeighborhoodPerimeter([]);
      const id = ++geometryRequestId;
      let worker: Worker | null = null;
      try {
        worker = new Worker(
          new URL("../../workers/geometry.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        worker = null;
      }

      const includedFeatures = geometryWorkerFeatures(
        tracts,
        neighborhood.includedGeoids,
      );
      if (worker) {
        worker.onmessage = (event: MessageEvent<GeometryWorkerResponse>) => {
          if (cancelled || event.data.id !== id) return;
          if (!event.data.ok) {
            onMapErrorRef.current?.(new Error(event.data.error));
          } else if (event.data.kind === "neighborhood_perimeter") {
            perimeterCache.set(neighborhoodKey, event.data.perimeterDots);
            setNeighborhoodPerimeter(event.data.perimeterDots);
          }
          worker?.terminate();
          worker = null;
        };
        worker.onerror = (event) => {
          if (!cancelled) {
            onMapErrorRef.current?.(
              new Error(event.message || "The neighborhood perimeter could not be prepared."),
            );
          }
          worker?.terminate();
          worker = null;
        };
        worker.postMessage({
          id,
          kind: "neighborhood_perimeter",
          features: includedFeatures,
        } satisfies GeometryWorkerRequest);
      } else {
        void import("@/lib/map/geometry")
          .then(({ perimeterDots, unionTracts }) => {
            if (cancelled) return;
            const dots = perimeterDots(
              unionTracts(tracts, neighborhood.includedGeoids),
            );
            perimeterCache.set(neighborhoodKey, dots);
            setNeighborhoodPerimeter(dots);
          })
          .catch((error: unknown) => {
            if (!cancelled) onMapErrorRef.current?.(errorFromUnknown(error));
          });
      }
      return () => {
        cancelled = true;
        worker?.terminate();
      };
    }, [neighborhood, neighborhoodKey, tracts]);

    const layers = useMemo(
      () =>
        createAtlasLayers({
          tracts,
          domain,
          metric,
          metricScale,
          selectedGeoids,
          activeGeoid,
          neighborhood: neighborhood
            ? {
                includedGeoids: neighborhood.includedGeoids,
                metric: neighborhood.metric,
                perimeterDots: neighborhoodPerimeter,
              }
            : null,
          scenario: scenario as ScenarioLayerState | null,
          boroughBoundaries,
        }),
      [
        tracts,
        domain,
        metric,
        metricScale,
        selectedGeoids,
        activeGeoid,
        neighborhood,
        neighborhoodPerimeter,
        scenario,
        boroughBoundaries,
      ],
    );
    layersRef.current = layers;

    const handleDeckClick = (info: PickingInfo) => {
      if (!clickGuardRef.current.canHandleClick()) return;
      if (isTractFeature(info.object)) {
        onTractClickRef.current(info.object.properties.geoid);
      } else {
        onEmptyClickRef.current();
      }
    };

    const handleDeckHover = (info: PickingInfo) => {
      if (isTractFeature(info.object)) {
        setHover({
          feature: info.object,
          x: info.x,
          y: info.y,
          source: "pointer",
        });
        onHoverGeoidRef.current?.(info.object.properties.geoid);
      } else {
        setHover(null);
        onHoverGeoidRef.current?.(null);
      }
    };

    useEffect(() => {
      let disposed = false;
      let mapCanvas: HTMLCanvasElement | null = null;
      const container = containerRef.current;
      if (!container) return;

      const showKeyboardTooltip = () => {
        const geoid = activeGeoidRef.current ?? selectedGeoidsRef.current.at(-1);
        const feature = geoid ? featureByGeoidRef.current.get(geoid) : null;
        if (!feature) return;
        setHover({ feature, x: 18, y: 96, source: "keyboard" });
        onHoverGeoidRef.current?.(feature.properties.geoid);
      };

      void Promise.all([import("maplibre-gl"), import("@deck.gl/mapbox")])
        .then(([maplibre, deckMapbox]) => {
          if (disposed || !containerRef.current) return;
          const view = initialViewRef.current;
          const map = new maplibre.Map({
            container: containerRef.current,
            style: EMPTY_STYLE,
            center: view?.center ?? [-73.97, 40.705],
            zoom: view?.zoom ?? 9.45,
            minZoom: 8.4,
            maxZoom: 17,
            maxBounds: [
              [-74.5, 40.35],
              [-73.45, 41.1],
            ],
            attributionControl: false,
            renderWorldCopies: false,
            keyboard: true,
          });
          const overlay = new deckMapbox.MapboxOverlay({
            interleaved: false,
            layers: layersRef.current,
            onClick: handleDeckClick,
            onHover: handleDeckHover,
          });
          map.addControl(overlay);
          mapRef.current = map;
          overlayRef.current = overlay;

          const pointerDown = () => clickGuardRef.current.pointerDown();
          const markDragged = () => clickGuardRef.current.markDragged();
          map.on("mousedown", pointerDown);
          map.on("touchstart", pointerDown);
          map.on("dragstart", markDragged);
          map.on("rotatestart", markDragged);
          map.on("pitchstart", markDragged);
          map.on("error", (event) => {
            onMapErrorRef.current?.(
              errorFromUnknown((event as { error?: unknown }).error),
            );
          });
          map.once("load", () => {
            const canvas = map.getCanvas();
            mapCanvas = canvas;
            canvas.tabIndex = 0;
            canvas.setAttribute(
              "aria-label",
              "Interactive New York City census tract map. Use the tract search for a keyboard-accessible selection.",
            );
            canvas.addEventListener("focus", showKeyboardTooltip);
            onMapReadyRef.current?.(map);
          });
        })
        .catch((error: unknown) => {
          onMapErrorRef.current?.(errorFromUnknown(error));
        });

      return () => {
        disposed = true;
        mapCanvas?.removeEventListener("focus", showKeyboardTooltip);
        const map = mapRef.current;
        const overlay = overlayRef.current;
        if (map && overlay && map.hasControl(overlay)) map.removeControl(overlay);
        map?.remove();
        mapRef.current = null;
        overlayRef.current = null;
      };
    }, []);

    useEffect(() => {
      overlayRef.current?.setProps({
        layers,
        onClick: handleDeckClick,
        onHover: handleDeckHover,
      });
    }, [layers]);

    const focusTract = useCallback(
      (geoid: string) => {
        const feature = featureByGeoid.get(geoid);
        const map = mapRef.current;
        if (!feature || !map) return;
        const bounds = featureBounds(feature);
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        map.fitBounds(bounds, {
          padding: 72,
          maxZoom: 13,
          duration: reducedMotion ? 0 : 500,
        });
      },
      [featureByGeoid],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        focusTract,
        resize: () => mapRef.current?.resize(),
        getMap: () => mapRef.current,
      }),
      [focusTract],
    );

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && onClearSelection) {
        event.preventDefault();
        onClearSelection();
      }
    };

    const displayMetric = resolveMapDisplayMetric(metric, neighborhood?.metric);
    const hoveredMetric = hover
      ? getMapMetricDatum(hover.feature.properties, domain, displayMetric)
      : null;
    const hoveredDomain = hover
      ? getActiveDomainSummary(hover.feature.properties, domain)
      : null;
    const hoveredSampleNote = hoveredDomain &&
      MAP_METRICS[displayMetric].requiresSufficientResponse
      ? sampleNote(hoveredDomain.sampleStatus)
      : null;
    const tooltipPosition = hover
      ? {
          left: Math.max(
            8,
            Math.min(
              hover.x + 12,
              (containerRef.current?.clientWidth ?? hover.x + 270) - 260,
            ),
          ),
          top: Math.max(
            8,
            Math.min(
              hover.y + 12,
              (containerRef.current?.clientHeight ?? hover.y + 190) - 180,
            ),
          ),
        }
      : undefined;

    return (
      <section
        className={[styles.root, className].filter(Boolean).join(" ")}
        aria-label="NYC 311 Priority Atlas map"
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setHover((current) =>
              current?.source === "keyboard" ? null : current,
            );
          }
        }}
      >
        <div ref={containerRef} className={styles.canvas} />
        {showSearch && (
          <TractSearch
            className={styles.search}
            features={tracts.features}
            onSelect={(result) => {
              focusTract(result.geoid);
              onTractClickRef.current(result.geoid);
            }}
          />
        )}
        {showLegend && (
          <MapLegend
            className={styles.legend}
            scale={metricScale}
            neighborhoodActive={Boolean(neighborhood)}
            scenarioActive={Boolean(scenario?.currentGeoids.size)}
            pinnedScenarioActive={Boolean(scenario?.pinnedGeoids?.size)}
          />
        )}
        <div className={styles.navigation} aria-label="Map navigation">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              mapRef.current?.zoomIn({
                duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? 0
                  : 180,
              })
            }
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              mapRef.current?.zoomOut({
                duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? 0
                  : 180,
              })
            }
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reset map view"
            onClick={() =>
              mapRef.current?.easeTo({
                center: [-73.97, 40.705],
                zoom: 9.45,
                bearing: 0,
                pitch: 0,
                duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? 0
                  : 400,
              })
            }
          >
            NYC
          </button>
        </div>
        {hover && hoveredDomain && hoveredMetric && (
          <div
            className={styles.tooltip}
            role="status"
            tabIndex={0}
            aria-label={`Map details for ${formatTractName(hover.feature.properties)}`}
            style={tooltipPosition}
          >
            <strong>{formatTractName(hover.feature.properties)}</strong>
            <span className={styles.tooltipMeta}>
              GEOID {hover.feature.properties.geoid}
            </span>
            <dl>
              <div>
                <dt>{DOMAIN_LABELS[domain]} mapped complaints</dt>
                <dd>{hoveredDomain.count.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Complaints per 1,000</dt>
                <dd>
                  {hoveredDomain.ratePer1000 === null
                    ? "Not available"
                    : hoveredDomain.ratePer1000.toFixed(1)}
                </dd>
              </div>
              {displayMetric !== "mapped_complaint_count" &&
                displayMetric !== "complaint_intensity" && (
                  <div>
                    <dt>{MAP_METRICS[displayMetric].shortLabel}</dt>
                    <dd>
                      {formatMetricValue(hoveredMetric)}
                      {hoveredMetric.secondaryValue === null
                        ? ""
                        : ` · ${hoveredMetric.secondaryValue.toFixed(1)} per 1,000`}
                    </dd>
                  </div>
                )}
            </dl>
            {hoveredSampleNote && (
              <span className={styles.sampleNote}>{hoveredSampleNote}</span>
            )}
          </div>
        )}
        <p className={styles.live} aria-live="polite">
          {selectedGeoids.length === 0
            ? "No tracts selected."
            : `${selectedGeoids.length} tract${selectedGeoids.length === 1 ? "" : "s"} selected${activeGeoid ? `; active GEOID ${activeGeoid}` : ""}.`}
        </p>
        {children}
      </section>
    );
  },
);
