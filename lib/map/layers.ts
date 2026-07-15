import type { Layer } from "@deck.gl/core";
import {
  GeoJsonLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type {
  DomainKey,
  TractFeature,
  TractFeatureProperties,
  TractsGeoJson,
} from "@/lib/artifacts";

import { featureAnchor, type Coordinate } from "./geometry";
import {
  getMapMetricDatum,
  type MapMetricKey,
  type NeighborhoodMetricKey,
} from "./metrics";
import {
  getFeatureColor,
  MAP_COLORS,
  neighborhoodColor,
  type MapColor,
  type MetricColorScale,
} from "./scales";

export interface NeighborhoodLayerState {
  includedGeoids: ReadonlySet<string>;
  metric: NeighborhoodMetricKey;
  perimeterDots: readonly Coordinate[];
}

export interface ScenarioLayerState {
  currentGeoids: ReadonlySet<string>;
  pinnedGeoids?: ReadonlySet<string> | null;
}

export interface AtlasLayerOptions {
  tracts: TractsGeoJson;
  domain: DomainKey;
  metric: MapMetricKey;
  metricScale: MetricColorScale;
  selectedGeoids: readonly string[];
  activeGeoid: string | null;
  neighborhood?: NeighborhoodLayerState | null;
  scenario?: ScenarioLayerState | null;
  boroughBoundaries?: FeatureCollection<
    Polygon | MultiPolygon,
    { borough: string }
  > | null;
}

interface SelectedMarker {
  geoid: string;
  number: number;
  active: boolean;
  position: Coordinate;
}

function scenarioColor(
  geoid: string,
  scenario: ScenarioLayerState,
): MapColor {
  const current = scenario.currentGeoids.has(geoid);
  const pinned = scenario.pinnedGeoids?.has(geoid) ?? false;
  if (current && pinned) return MAP_COLORS.scenarioShared;
  if (current) return MAP_COLORS.scenarioCurrent;
  return MAP_COLORS.scenarioPinned;
}

function scenarioLineColor(
  geoid: string,
  scenario: ScenarioLayerState,
): MapColor {
  const current = scenario.currentGeoids.has(geoid);
  const pinned = scenario.pinnedGeoids?.has(geoid) ?? false;
  if (current && pinned) return [37, 75, 69, 210];
  if (current) return [39, 80, 93, 205];
  return [120, 88, 54, 200];
}

function selectedFeatures(
  tracts: TractsGeoJson,
  selected: ReadonlySet<string>,
): TractFeature[] {
  return tracts.features.filter((feature) =>
    selected.has(feature.properties.geoid),
  );
}

function selectionMarkers(
  tracts: TractsGeoJson,
  selectedGeoids: readonly string[],
  activeGeoid: string | null,
): SelectedMarker[] {
  const index = new Map(
    tracts.features.map((feature) => [feature.properties.geoid, feature]),
  );
  return selectedGeoids.flatMap((geoid, selectedIndex) => {
    const feature = index.get(geoid);
    return feature
      ? [
          {
            geoid,
            number: selectedIndex + 1,
            active: geoid === activeGeoid,
            position: featureAnchor(feature),
          },
        ]
      : [];
  });
}

export function createAtlasLayers(options: AtlasLayerOptions): Layer[] {
  const {
    tracts,
    domain,
    metric,
    metricScale,
    selectedGeoids,
    activeGeoid,
    neighborhood,
    scenario,
    boroughBoundaries,
  } = options;
  const selectedSet = new Set(selectedGeoids);
  const activeFeature = activeGeoid
    ? tracts.features.find(
        (feature) => feature.properties.geoid === activeGeoid,
      )
    : undefined;
  const activeNeighborhoodValue =
    neighborhood && activeFeature
      ? getMapMetricDatum(
          activeFeature.properties,
          domain,
          neighborhood.metric,
        ).value
      : null;
  const activeNumericValue =
    typeof activeNeighborhoodValue === "number"
      ? activeNeighborhoodValue
      : null;

  const layers: Layer[] = [
    new GeoJsonLayer<TractFeatureProperties>({
      id: `atlas-tract-fill-${domain}-${metric}-${neighborhood ? "context" : "city"}`,
      data: tracts,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 70],
      filled: true,
      stroked: true,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 0.35,
      getLineWidth: 0.55,
      getLineColor: MAP_COLORS.tractLine,
      getFillColor: (feature) => {
        if (!neighborhood) {
          return getFeatureColor(feature as TractFeature, domain, metric, metricScale);
        }
        if (!neighborhood.includedGeoids.has(feature.properties.geoid)) {
          return MAP_COLORS.ghost;
        }
        const datum = getMapMetricDatum(
          feature.properties,
          domain,
          neighborhood.metric,
        );
        return neighborhoodColor(
          typeof datum.value === "number" ? datum.value : null,
          activeNumericValue,
        );
      },
      updateTriggers: {
        getFillColor: [domain, metric, metricScale, neighborhood, activeNumericValue],
      },
    }),
  ];

  if (scenario) {
    let scenarioSet = new Set([
      ...scenario.currentGeoids,
      ...(scenario.pinnedGeoids ?? []),
    ]);
    // Neighborhood context is a deliberate focus mode: scenario membership
    // outside its contiguous extent must not defeat the required ghost state.
    if (neighborhood) {
      scenarioSet = new Set(
        [...scenarioSet].filter((geoid) =>
          neighborhood.includedGeoids.has(geoid),
        ),
      );
    }
    layers.push(
      new GeoJsonLayer<TractFeatureProperties>({
        id: "atlas-scenario-overlay",
        data: selectedFeatures(tracts, scenarioSet),
        pickable: false,
        filled: true,
        stroked: true,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        getLineWidth: 1,
        getFillColor: (feature) =>
          scenarioColor(feature.properties.geoid, scenario),
        getLineColor: (feature) =>
          scenarioLineColor(feature.properties.geoid, scenario),
        updateTriggers: {
          getFillColor: [scenario],
          getLineColor: [scenario],
        },
      }),
    );
  }

  if (boroughBoundaries) {
    layers.push(
      new GeoJsonLayer<{ borough: string }>({
        id: "atlas-borough-boundaries",
        data: boroughBoundaries,
        pickable: false,
        filled: false,
        stroked: true,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1.25,
        getLineWidth: 1.25,
        getLineColor: MAP_COLORS.boroughLine,
      }),
    );
  }

  if (neighborhood && neighborhood.perimeterDots.length > 0) {
    layers.push(
      new ScatterplotLayer<Coordinate>({
        id: "atlas-neighborhood-outer-perimeter",
        data: neighborhood.perimeterDots,
        pickable: false,
        radiusUnits: "pixels",
        getPosition: (coordinate) => coordinate,
        getRadius: 2,
        radiusMinPixels: 1.7,
        radiusMaxPixels: 2.2,
        filled: true,
        stroked: true,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 0.7,
        getFillColor: MAP_COLORS.perimeter,
        getLineColor: MAP_COLORS.perimeterStroke,
      }),
    );
  }

  if (selectedGeoids.length > 0) {
    layers.push(
      new GeoJsonLayer<TractFeatureProperties>({
        id: "atlas-selected-tract-outlines",
        data: selectedFeatures(tracts, selectedSet),
        pickable: false,
        filled: false,
        stroked: true,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 2,
        getLineWidth: (feature) =>
          feature.properties.geoid === activeGeoid ? 4.5 : 2.2,
        getLineColor: (feature) =>
          feature.properties.geoid === activeGeoid
            ? MAP_COLORS.active
            : MAP_COLORS.selected,
        updateTriggers: {
          getLineWidth: [activeGeoid],
          getLineColor: [activeGeoid],
        },
      }),
    );

    const markers = selectionMarkers(tracts, selectedGeoids, activeGeoid);
    layers.push(
      new ScatterplotLayer<SelectedMarker>({
        id: "atlas-selected-tract-marker-circles",
        data: markers,
        pickable: false,
        radiusUnits: "pixels",
        getPosition: (marker) => marker.position,
        getRadius: (marker) => (marker.active ? 11 : 9.5),
        filled: true,
        stroked: true,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1.5,
        getFillColor: (marker) =>
          marker.active ? MAP_COLORS.active : MAP_COLORS.selected,
        getLineColor: [255, 255, 255, 245],
      }),
      new TextLayer<SelectedMarker>({
        id: "atlas-selected-tract-marker-labels",
        data: markers,
        pickable: false,
        billboard: true,
        sizeUnits: "pixels",
        getPosition: (marker) => marker.position,
        getText: (marker) => String(marker.number),
        getSize: 12,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: 700,
        getColor: [255, 255, 255, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
      }),
    );
  }

  return layers;
}
