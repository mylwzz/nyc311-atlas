import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ATLAS_BASEMAP_STYLE_PATH } from "@/lib/map/basemap";

interface StyleLayer {
  id: string;
  type: string;
  [key: string]: unknown;
}

describe("context basemap contract", () => {
  it("pins a licensed, attributed vector style with geographic context", () => {
    expect(ATLAS_BASEMAP_STYLE_PATH).toBe("/map/positron.json");
    const style = JSON.parse(
      readFileSync("public/map/positron.json", "utf8"),
    ) as {
      version: number;
      sources: Record<string, { type?: string; attribution?: string }>;
      layers: StyleLayer[];
      metadata?: Record<string, string>;
    };

    expect(style.version).toBe(8);
    expect(style.sources.openmaptiles?.type).toBe("vector");
    expect(style.sources.openmaptiles?.attribution).toContain("OpenStreetMap");
    expect(style.metadata?.["atlas:license"]).toBe("MIT");

    const ids = new Set(style.layers.map((layer) => layer.id));
    expect(ids.has("water")).toBe(true);
    expect(ids.has("park")).toBe(true);
    expect(ids.has("building")).toBe(true);
    expect([...ids].some((id) => id.includes("highway"))).toBe(true);
    expect(style.layers.some((layer) => layer.type === "symbol")).toBe(true);
  });
});
