import { expect, test, type Locator, type Page } from "@playwright/test";

import { REPRESENTATIVE_TRACTS } from "../fixtures/representative-tracts";
import { openAtlas, selectTract, setRange } from "./helpers";

async function expectNoMapFailure(page: Page) {
  await expect(page.getByText(/map could not|map failed/i)).toHaveCount(0);
  await expect.poll(
    () => page.locator(".map-stage canvas").count(),
  ).toBeGreaterThanOrEqual(2);
}

async function openSummary(page: Page, name: string): Promise<Locator> {
  const summary = page.getByText(name, { exact: true });
  await summary.click();
  await expect(summary.locator("..")).toHaveAttribute("open", "");
  return summary;
}

test.describe("interactive control audit", () => {
  test("global navigation, sharing, methodology, and map navigation are live", async ({
    page,
  }) => {
    await openAtlas(page);

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByRole("status")).toContainText(
      /Share link copied|analytical state is encoded/,
    );

    const methodology = page.getByRole("button", { name: "Open methodology" });
    await methodology.click();
    await expect(page.getByRole("dialog", { name: "How to read the Atlas" })).toBeVisible();
    await expect(page.getByText("Artifact provenance", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close methodology" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await methodology.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "Reset map view" }).click();
    await expectNoMapFailure(page);

    await page.locator("#domain-control").selectOption("noise");
    await expect(page.getByRole("heading", { name: "Noise" })).toBeVisible();
    await page.locator("#domain-control").selectOption("housing_building");
    await expect(page.getByRole("heading", { name: "Housing & Building" })).toBeVisible();
  });

  test("Explore disclosures, chip removal, and neighborhood controls are live", async ({
    page,
  }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await expect(page.getByText("Top complaint types")).toBeVisible();

    await openSummary(page, "Five-domain breakdown");
    await expect(page.getByRole("columnheader", { name: "Domain" })).toBeVisible();
    await openSummary(page, "Response evidence and age checkpoints");
    await expect(
      page
        .getByLabel("Analysis panel")
        .getByText("Recorded closure · 180d", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Tract-specific uncertainty")).toBeVisible({
      timeout: 20_000,
    });

    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Queen neighborhood" }),
    });
    await neighborhood.getByRole("button", { name: "Off" }).click();
    await neighborhood.locator("#neighborhood-radius").selectOption("3");
    await neighborhood.locator("#neighborhood-metric").selectOption(
      "mapped_complaint_count",
    );
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveValue("3");
    await expect(neighborhood.locator("#neighborhood-metric")).toHaveValue(
      "mapped_complaint_count",
    );
    await expect(page.getByLabel("Map legend")).toContainText(
      "Relative to active tract",
    );
    await neighborhood.getByRole("button", { name: "On" }).click();
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveCount(0);

    await page.getByRole("button", {
      name: `Remove Census Tract ${REPRESENTATIVE_TRACTS.sufficient.properties.tractName}`,
    }).click();
    await expect(page.getByLabel("Selected census tracts")).toHaveCount(0);
  });

  test("Scenario details, finder, method controls, and pin lifecycle are live", async ({
    page,
  }) => {
    await openAtlas(page);
    await page.getByRole("tab", { name: "Scenario Lab" }).click();
    await expect(page.getByText(/Explore all 550/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Magnitude-sensitive" }).click();
    await page.locator("#scenario-domain").selectOption("street_infrastructure");
    await page.locator("#scenario-k").selectOption("150");
    await setRange(page.locator("#scenario-alpha"), 0.8);
    await expect(
      page.getByText(
        "magnitude_sensitive-street_infrastructure-k150-a080",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "1 exact match · magnitude_sensitive-street_infrastructure-k150-a080",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Rank-balanced" }).click();
    await expect(
      page.getByText("rank_balanced-street_infrastructure-k150-a080", {
        exact: true,
      }),
    ).toBeVisible();

    await openSummary(page, "Alpha sensitivity");
    await expect(page.getByRole("columnheader", { name: "Alpha" })).toBeVisible();
    await openSummary(page, "All exact scenario metrics");
    await expect(page.getByText("Request-age uncertainty", { exact: true })).toBeVisible();

    await page.locator("#scenario-explanation-tract").selectOption(
      REPRESENTATIVE_TRACTS.high.properties.geoid,
    );
    await expect(page.getByText("Deterministic score", { exact: true })).toBeVisible();
    await expect(page.getByText("Rank among eligible tracts", { exact: true })).toBeVisible();
    await page.locator("#scenario-explanation-tract").selectOption(
      REPRESENTATIVE_TRACTS.ineligible.properties.geoid,
    );
    await expect(page.getByText("Not allocation eligible", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Pin current" }).click();
    await expect(page.getByRole("button", { name: "Unpin" })).toBeVisible();
    await page.getByRole("button", { name: "Unpin" }).click();
    await expect(page.getByRole("button", { name: "Pin current" })).toBeVisible();
  });

  test("Workload scope, replay, request-age, and assumption controls are live", async ({
    page,
  }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("tab", { name: "Workload" }).click();
    await expect(page.getByText("13 periods")).toBeVisible({ timeout: 20_000 });

    await page.locator("#workload-domain").selectOption("noise");
    await expect(page.locator("#workload-domain")).toHaveValue("noise");
    await expect(
      page.locator(".metadata-line").getByText("Noise", { exact: true }),
    ).toBeVisible();
    await page.locator("#workload-domain").selectOption("housing_building");
    await page.locator("#workload-scope").selectOption("selected_tracts");
    await expect(page.locator("#workload-scope")).toHaveValue("selected_tracts");
    await page.locator("#workload-scope").selectOption("active_neighborhood");
    await expect(page.locator("#workload-scope")).toHaveValue(
      "active_neighborhood",
    );
    const workloadMetadata = page
      .locator(".panel-section.field-group")
      .filter({ has: page.locator("#workload-scope") })
      .locator(".metadata-line");
    await expect(workloadMetadata).toContainText(/\d+ tracts?/);
    await page.locator("#workload-scope").selectOption("pinned_scenario");
    await expect(page.getByText("This scope is empty.")).toBeVisible();
    await page.locator("#workload-scope").selectOption("active_tract");
    await expect(page.getByText("13 periods")).toBeVisible();

    const arrivalPeriods = page.getByLabel("Arrival periods");
    const partialPeriod = arrivalPeriods.locator(".period-cell").nth(12);
    await partialPeriod.evaluate((element) => {
      element.scrollIntoView({ block: "nearest", inline: "end" });
    });
    await expect(partialPeriod).toBeInViewport({ ratio: 0.9 });
    await expect(partialPeriod).toContainText("P13");
    await expect(partialPeriod).toContainText("6 days · partial");

    await openSummary(page, "Replay period details");
    await expect(page.getByRole("columnheader", { name: "New requests" })).toBeVisible();
    await expect(page.getByText("80% uncertainty interval · 1,000 draws")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Age 180" }).click();
    await expect(page.getByText("expected open at age 180")).toBeVisible();
    await openSummary(page, "95% interval and recorded-closure uncertainty");
    await expect(page.getByText("95% closure interval", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Scenario", exact: true }).click();
    await setRange(page.locator("#demand-change"), -30);
    await setRange(page.locator("#closure-shift"), 15);
    await expect(page.locator('output[for="demand-change"]')).toHaveText("−30.0%");
    await expect(page.locator('output[for="closure-shift"]')).toHaveText("+15.0 pp");
    await openSummary(page, "Period and age-composition comparison");
    await expect(page.getByRole("columnheader", { name: "Arrival Δ" })).toBeVisible();
    await page.getByRole("button", { name: "Historical Replay" }).click();
    await expect(page.getByRole("button", { name: "Historical Replay" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Workload lazy-loads the current scenario directly and keeps an unpinned scope empty", async ({
    page,
  }) => {
    const artifactRequests: string[] = [];
    page.on("request", (request) => artifactRequests.push(request.url()));

    await openAtlas(page);
    await page.getByRole("tab", { name: "Workload" }).click();
    await expect(page.locator("#workload-scope")).toBeVisible({
      timeout: 20_000,
    });
    expect(
      artifactRequests.some((url) => url.endsWith("/data/scenarios.json")),
    ).toBe(false);

    await page.locator("#workload-scope").selectOption("current_scenario");
    const scopeMetadata = page.locator(".metadata-line");
    await expect(
      scopeMetadata.getByText("100 tracts", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      scopeMetadata.getByText("Pooled across 100 tracts", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("This scope is empty.")).toHaveCount(0);
    await expect(page.getByText("13 periods")).toBeVisible();
    expect(
      artifactRequests.filter((url) => url.endsWith("/data/scenarios.json")),
    ).toHaveLength(1);

    await page.locator("#workload-scope").selectOption("pinned_scenario");
    await expect(page.getByText("This scope is empty.")).toBeVisible();
  });

  test("mobile controls remain in bounds, separated, and touch-sized", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAtlas(page);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    for (const selector of [
      ".topbar",
      ".map-controls",
      ".analysis-rail",
      ".mobile-workspace-tabs",
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      if (!box) continue;
      expect(box.x, selector).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(390.5);
    }

    const mobileWorkspace = page.getByRole("tablist", {
      name: "Mobile workspace",
    });
    const mobileTabs = mobileWorkspace.getByRole("tab");
    await expect(mobileTabs).toHaveCount(4);
    for (const name of ["Explore", "Scenario Lab", "Workload", "Claude"]) {
      await expect(mobileWorkspace.getByRole("tab", { name })).toBeVisible();
    }

    const tabs = await mobileWorkspace.boundingBox();
    const rail = await page.locator(".analysis-rail").boundingBox();
    if (!tabs || !rail) throw new Error("Mobile fixed controls have no bounds.");
    const horizontalOverlap = Math.max(
      0,
      Math.min(tabs.x + tabs.width, rail.x + rail.width) -
        Math.max(tabs.x, rail.x),
    );
    const verticalOverlap = Math.max(
      0,
      Math.min(tabs.y + tabs.height, rail.y + rail.height) -
        Math.max(tabs.y, rail.y),
    );
    expect(
      horizontalOverlap * verticalOverlap,
      `workspace tabs ${JSON.stringify(tabs)} must not overlap analysis rail ${JSON.stringify(rail)}`,
    ).toBe(0);

    await page.getByRole("button", { name: "Share" }).click();
    const shareStatus = page.getByRole("status").filter({
      hasText: /Share link copied|analytical state is encoded/,
    });
    await expect(shareStatus).toBeVisible();
    const toast = await shareStatus.boundingBox();
    if (!toast) throw new Error("Mobile Share status has no bounds.");
    const toastTabOverlap = Math.max(
      0,
      Math.min(toast.x + toast.width, tabs.x + tabs.width) -
        Math.max(toast.x, tabs.x),
    ) * Math.max(
      0,
      Math.min(toast.y + toast.height, tabs.y + tabs.height) -
        Math.max(toast.y, tabs.y),
    );
    expect(
      toastTabOverlap,
      `Share status ${JSON.stringify(toast)} must not be obscured by workspace tabs ${JSON.stringify(tabs)}`,
    ).toBe(0);

    await mobileWorkspace.getByRole("tab", { name: "Claude" }).click();
    await expect(
      mobileWorkspace.getByRole("tab", { name: "Claude" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".analysis-rail .rail-scroll")).toBeHidden();
    await expect(page.locator(".analysis-rail .assistant-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Claude interpretation" }),
    ).toBeVisible();

    await mobileWorkspace.getByRole("tab", { name: "Explore" }).click();
    await expect(page.locator(".analysis-rail .rail-scroll")).toBeVisible();
    await expect(page.locator(".analysis-rail .assistant-panel")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Housing & Building" }),
    ).toBeVisible();

    const mobileMapNavigation = page.getByLabel("Map navigation");
    await expect(mobileMapNavigation).toBeVisible();
    for (const name of ["Zoom in", "Zoom out", "Reset map view"]) {
      await page.getByRole("button", { name }).click({ trial: true });
    }
    const visibleFixedAndMapControls = page.locator(
      ".topbar button:visible, .map-controls select:visible, .mobile-workspace-tabs button:visible",
    );
    for (
      let index = 0;
      index < await visibleFixedAndMapControls.count();
      index += 1
    ) {
      await visibleFixedAndMapControls.nth(index).click({ trial: true });
    }

    const visibleControls = page.locator(
      "button:visible, select:visible, input:visible, textarea:visible, summary:visible",
    );
    for (let index = 0; index < await visibleControls.count(); index += 1) {
      const control = visibleControls.nth(index);
      const box = await control.boundingBox();
      if (!box) continue;
      expect(box.height, await control.getAttribute("aria-label") ?? `control ${index}`).toBeGreaterThanOrEqual(43.5);
    }

    await page.setViewportSize({ width: 320, height: 844 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    const narrowTabs = await mobileWorkspace.boundingBox();
    if (!narrowTabs) throw new Error("320px mobile workspace has no bounds.");
    expect(narrowTabs.x).toBeGreaterThanOrEqual(0);
    expect(narrowTabs.x + narrowTabs.width).toBeLessThanOrEqual(320.5);
    await expect(mobileMapNavigation).toBeHidden();
    for (
      let index = 0;
      index < await visibleFixedAndMapControls.count();
      index += 1
    ) {
      await visibleFixedAndMapControls.nth(index).click({ trial: true });
    }
  });
});
