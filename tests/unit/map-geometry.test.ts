import { describe, expect, it } from "vitest";

import type {
  TractFeature,
  TractFeatureProperties,
  TractsGeoJson,
} from "@/lib/artifacts";
import {
  classifyScenarioMembership,
  createAtlasLayers,
  createMetricColorScale,
  DragSafeClickGuard,
  featureAnchor,
  perimeterDots,
  searchTracts,
  unionTracts,
} from "@/lib/map";
import { geometryWorkerFeatures } from "@/lib/map/geometry-worker-contract";

function square(
  geoid: string,
  tractName: string,
  x: number,
): TractFeature {
  return {
    type: "Feature",
    properties: {
      geoid,
      tractName,
      borough: "Manhattan",
      county: "New York County",
    } as TractFeatureProperties,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x, 0],
          [x + 1, 0],
          [x + 1, 1],
          [x, 1],
          [x, 0],
        ],
      ],
    },
  };
}

function collection(): TractsGeoJson {
  return {
    type: "FeatureCollection",
    schemaVersion: "4.0.0",
    modelVersion: "atlas",
    artifactSetId: "test-set",
    features: [square("36061000100", "1", 0), square("36061000200", "2", 1)],
  };
}

describe("map geometry", () => {
  it("anchors a tract within its largest polygon", () => {
    expect(featureAnchor(square("36061000100", "1", 0))).toEqual([0.5, 0.5]);
  });

  it("dissolves neighbors before producing one outer dotted perimeter", () => {
    const union = unionTracts(
      collection(),
      new Set(["36061000100", "36061000200"]),
    );
    const dots = perimeterDots(union, 0.25);
    expect(dots.length).toBeGreaterThan(10);
    expect(
      dots.some(
        ([x, y]) => Math.abs(x - 1) < 1e-9 && y > 0.05 && y < 0.95,
      ),
    ).toBe(false);
  });

  it("sends only required geometry fields to the dissolve worker", () => {
    const features = geometryWorkerFeatures(
      collection(),
      new Set(["36061000200"]),
    );
    expect(features).toHaveLength(1);
    expect(features[0]?.properties).toEqual({
      geoid: "36061000200",
      borough: "Manhattan",
    });
    expect(features[0]?.geometry.type).toBe("Polygon");
  });

  it("renders one neighborhood perimeter layer and no hop-ring layers", () => {
    const tracts = collection();
    const scale = createMetricColorScale(
      tracts.features,
      "housing_building",
      "mapped_complaint_count",
    );
    const layers = createAtlasLayers({
      tracts,
      domain: "housing_building",
      metric: "mapped_complaint_count",
      metricScale: scale,
      selectedGeoids: ["36061000100"],
      activeGeoid: "36061000100",
      neighborhood: {
        includedGeoids: new Set(["36061000100", "36061000200"]),
        metric: "mapped_complaint_count",
        perimeterDots: [[0, 0], [0.5, 0]],
      },
    });
    const ids = layers.map((layer) => layer.id);
    expect(ids.filter((id) => id.includes("outer-perimeter"))).toHaveLength(1);
    expect(ids.some((id) => id.includes("hop"))).toBe(false);
    expect(ids).toContain("atlas-selected-tract-outlines");
    expect(ids).toContain("atlas-selected-tract-marker-labels");
  });
});

describe("map interactions", () => {
  it("rejects an empty click after drag and resets at the next pointer down", () => {
    const guard = new DragSafeClickGuard();
    guard.pointerDown();
    guard.markDragged();
    expect(guard.canHandleClick()).toBe(false);
    guard.pointerDown();
    expect(guard.canHandleClick()).toBe(true);
  });

  it("classifies current, pinned, and shared scenario membership", () => {
    const current = new Set(["a", "b"]);
    const pinned = new Set(["b", "c"]);
    expect(classifyScenarioMembership("a", current, pinned)).toBe("current");
    expect(classifyScenarioMembership("b", current, pinned)).toBe("shared");
    expect(classifyScenarioMembership("c", current, pinned)).toBe("pinned");
    expect(classifyScenarioMembership("d", current, pinned)).toBe("none");
  });

  it("supports tract-name and GEOID keyboard search", () => {
    const features = collection().features;
    expect(searchTracts(features, "tract 2")[0]?.geoid).toBe("36061000200");
    expect(searchTracts(features, "360610001")[0]?.geoid).toBe("36061000100");
  });
});
