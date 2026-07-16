import { expect, type Locator, type Page } from "@playwright/test";

import {
  tractInteriorPoint,
  tractName,
  type TractFixture,
} from "../fixtures/representative-tracts";

type RepresentativeFeature = Parameters<typeof tractName>[0];

export async function openAtlas(page: Page, path = "/"): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Validating artifact contract")).toBeHidden({
    timeout: 20_000,
  });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Analysis panel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(/Interactive New York City census tract map/),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(
    () => page.locator(".map-stage canvas").count(),
    { message: "The interleaved MapLibre/deck.gl canvas should be mounted." },
  ).toBeGreaterThanOrEqual(1);
  const controls = page.getByLabel("Map controls");
  await expect(controls).toBeVisible();
  await expect.poll(async () => (await controls.boundingBox())?.width ?? 0, {
    message: "Map controls must remain a compact overlay over the choropleth.",
  }).toBeLessThanOrEqual(320);
  await expect.poll(async () => (await controls.boundingBox())?.height ?? 0, {
    message: "Map controls must not cover the map canvas.",
  }).toBeLessThanOrEqual(280);
  await expect.poll(
    () => page.locator(".maplibregl-map").getAttribute("data-basemap"),
    { message: "The local basemap style should settle without blocking the tract layer." },
  ).toMatch(/positron|fallback/);
  await page.waitForTimeout(750);
}

export async function selectTract(
  page: Page,
  feature: RepresentativeFeature,
): Promise<void> {
  const search = page.getByRole("combobox", {
    name: "Search by tract number, GEOID, or borough",
  });
  await search.fill(feature.properties.geoid);
  await page
    .getByRole("option")
    .filter({ hasText: feature.properties.geoid })
    .click();
  const selected = page.getByLabel("Selected census tracts");
  await expect(selected).toContainText(`Tract ${feature.properties.tractName}`);
}

export async function clearSelection(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Selected census tracts")).toHaveCount(0);
  await expect(page.getByText("Choose a tract to begin")).toBeVisible();
}

export async function setRange(locator: Locator, value: number): Promise<void> {
  await locator.fill(String(value));
  await expect(locator).toHaveValue(String(value));
}

function mercatorWorldPoint(
  coordinate: readonly [number, number],
  worldSize: number,
): readonly [number, number] {
  const longitude = coordinate[0];
  const latitudeRadians = coordinate[1] * Math.PI / 180;
  return [
    ((longitude + 180) / 360) * worldSize,
    ((1 - Math.log(
      Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians),
    ) / Math.PI) / 2) * worldSize,
  ];
}

/** Projects an actual artifact geometry point through Atlas's default map view. */
export async function defaultMapPoint(
  page: Page,
  feature: TractFixture,
): Promise<{ x: number; y: number }> {
  const stage = await page.locator(".map-stage").boundingBox();
  if (!stage) throw new Error("Map stage has no browser bounds.");
  const worldSize = 512 * 2 ** 9.45;
  const center = mercatorWorldPoint([-73.97, 40.705], worldSize);
  const target = mercatorWorldPoint(tractInteriorPoint(feature), worldSize);
  return {
    x: stage.x + stage.width / 2 + target[0] - center[0],
    y: stage.y + stage.height / 2 + target[1] - center[1],
  };
}

export async function hoverActualTract(
  page: Page,
  feature: TractFixture,
): Promise<{ x: number; y: number }> {
  const point = await defaultMapPoint(page, feature);
  const expectedLabel = `Map details for ${tractName(feature)}`;
  const tooltip = page.locator('.map-stage [aria-label^="Map details for "]');
  // The public vector style can settle at a sub-pixel transform that differs
  // slightly from the deterministic Mercator estimate. Probe a tight area
  // around the known interior coordinate while still exercising deck.gl pick.
  const offsets = [0, 4, -4, 8, -8, 12, -12, 16, -16];
  for (const yOffset of offsets) {
    for (const xOffset of offsets) {
      const candidate = { x: point.x + xOffset, y: point.y + yOffset };
      await page.mouse.move(candidate.x, candidate.y);
      await page.waitForTimeout(35);
      if ((await tooltip.getAttribute("aria-label")) === expectedLabel) {
        // Confirm the label after React's hover update has settled so a
        // delayed result from the prior probe cannot return an adjacent point.
        await page.waitForTimeout(65);
        if ((await tooltip.getAttribute("aria-label")) === expectedLabel) {
          return candidate;
        }
      }
    }
  }
  await expect(page.getByLabel(expectedLabel)).toBeVisible();
  return point;
}

export async function settleVisual(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await expect.poll(
    () => page.locator(".maplibregl-map").getAttribute("data-basemap"),
    { message: "The pinned contextual basemap style should settle before capture." },
  ).toMatch(/positron|fallback/);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  await page.waitForTimeout(550);
}

export function nameOf(feature: RepresentativeFeature): string {
  return tractName(feature);
}
