import type { StyleSpecification } from "maplibre-gl";

/**
 * A locally pinned OpenFreeMap Positron style. Its vector/raster sources remain
 * remote and carry explicit OpenStreetMap/OpenFreeMap attribution in the style.
 */
export const ATLAS_BASEMAP_STYLE_PATH = "/map/positron.json";

/** Immediate analytical fallback while the contextual style is parsed. */
export const ATLAS_FALLBACK_STYLE: StyleSpecification = {
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

export async function loadAtlasBasemapStyle(
  signal?: AbortSignal,
): Promise<StyleSpecification> {
  const response = await fetch(ATLAS_BASEMAP_STYLE_PATH, {
    cache: "force-cache",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Basemap style returned HTTP ${response.status}.`);
  }
  return await response.json() as StyleSpecification;
}
