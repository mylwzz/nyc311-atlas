import { expect, test, type Locator, type Page } from "@playwright/test";

import { REPRESENTATIVE_TRACTS } from "../fixtures/representative-tracts";
import { openAtlas, selectTract, setRange } from "./helpers";

async function expectNoMapFailure(page: Page) {
  await expect(page.getByText(/map could not|map failed/i)).toHaveCount(0);
  await expect.poll(
    () => page.locator(".map-stage canvas").count(),
  ).toBeGreaterThanOrEqual(1);
}

async function openSummary(page: Page, name: string): Promise<Locator> {
  const summary = page.locator("summary").filter({ hasText: name }).first();
  await summary.click();
  await expect(summary.locator("..")).toHaveAttribute("open", "");
  return summary;
}

test.describe("interactive control audit", () => {
  test("global navigation, sharing, methodology, and map navigation are live", async ({
    page,
  }) => {
    await openAtlas(page);

    const topbarActions = page.locator(".topbar-actions");
    await expect(topbarActions.getByRole("button")).toHaveCount(3);
    await expect(topbarActions.getByRole("button").nth(0)).toHaveAccessibleName(
      "Data notes for this view",
    );
    await expect(topbarActions.getByRole("button").nth(1)).toHaveAccessibleName(
      "Methodology",
    );
    await expect(topbarActions.getByRole("button").nth(2)).toHaveAccessibleName(
      "Copy a link to this view",
    );

    await page.getByRole("button", { name: "Data notes for this view" }).click();
    await expect(page.getByRole("dialog", { name: "Data notes" })).toContainText(
      "Historical scope",
    );
    await expect(page.getByRole("dialog", { name: "Data notes" })).toContainText(
      "Per 1,000 residents",
    );
    await expect(page.getByRole("dialog", { name: "Data notes" })).toContainText(
      "Agency counts",
    );
    await page
      .getByRole("dialog", { name: "Data notes" })
      .getByRole("button", { name: "Read the method" })
      .click();
    await expect(page.getByRole("dialog", { name: "How to read the Atlas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Map metrics", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close methodology" }).click();

    await page.getByRole("button", { name: "Copy a link to this view" }).click();
    await expect(page.getByRole("status")).toContainText(
      /Share link copied|analytical state is encoded/,
    );

    const methodology = page.getByRole("button", { name: "Methodology" });
    await methodology.click();
    await expect(page.getByRole("dialog", { name: "How to read the Atlas" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Methodology topics" })).toBeVisible();
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await expect(page.getByText("Technical provenance", { exact: true })).toBeVisible();
    await openSummary(page, "Technical provenance");
    await expect(page.getByText("Artifact-set ID", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close methodology" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await methodology.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "Reset map view" }).click();
    await expectNoMapFailure(page);
    await expect(page.locator(".maplibregl-map")).toHaveAttribute(
      "data-basemap",
      "positron",
    );
    await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(
      /OpenFreeMap|OpenStreetMap/,
    );

    await page.locator("#domain-control").selectOption("noise");
    await expect(page.locator("#domain-control")).toHaveValue("noise");
    await page.locator("#domain-control").selectOption("housing_building");
    await expect(page.locator("#domain-control")).toHaveValue("housing_building");
  });

  test("Explore disclosures, chip removal, and neighborhood controls are live", async ({
    page,
  }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await expect(page.getByText("Top complaint types")).toHaveCount(0);

    await openSummary(page, "All service domains");
    await expect(page.getByRole("columnheader", { name: "Domain" })).toBeVisible();
    await openSummary(page, "Complaint types and agencies");
    await expect(page.getByText("Top complaint types")).toBeVisible();
    await expect(
      page.getByText("Top agencies by request count", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Each count is the number of mapped requests/),
    ).toBeVisible();
    await expect(
      page.getByText(/^\d[\d,]* requests · \d+\.\d%$/).first(),
    ).toBeVisible();
    await openSummary(page, "Closure timing details");
    await expect(
      page
        .getByLabel("Analysis panel")
        .getByText("Closed within ~6 months", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Tract-specific uncertainty")).toHaveCount(0);

    await page.getByRole("button", { name: "Compare with nearby tracts" }).click();
    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Nearby tract comparison" }),
    });
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
    await neighborhood.getByRole("button", { name: "Hide" }).click();
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveCount(0);

    await page.getByRole("button", {
      name: `Remove Census Tract ${REPRESENTATIVE_TRACTS.sufficient.properties.tractName}`,
    }).click();
    await expect(page.getByLabel("Selected census tracts")).toHaveCount(0);
  });

  test("Collective sums complaint activity while keeping response analysis domain-specific", async ({
    page,
  }) => {
    await openAtlas(page);
    await page.locator("#domain-control").selectOption("collective");
    await expect(page.locator("#domain-control")).toHaveValue("collective");
    await expect(page.locator("#metric-control option")).toHaveCount(4);
    await expect(page.getByLabel("Map legend")).toContainText(
      "Collective complaints per 1,000",
    );

    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    const panel = page.getByRole("complementary", {
      name: "Analysis panel",
      exact: true,
    });
    await expect(panel).toContainText(
      "Collective combines complaint activity only. Choose one service domain to view closure timing.",
    );

    const compositionSummary = await openSummary(
      page,
      "Complaint types and agencies",
    );
    const composition = compositionSummary.locator("..");
    await expect(composition.locator("[class*='domainTag']").first()).toBeVisible();
    await expect(composition).toContainText(
      "Exact agency totals are available within each service domain",
    );

    await page.getByRole("tab", { name: "Prioritize" }).click();
    await expect(panel).toContainText(
      "Collective is not part of the 550 validated priority scenarios. Showing Housing & Building",
    );
    await expect(page.locator("#scenario-domain")).toHaveValue(
      "housing_building",
      { timeout: 20_000 },
    );
    await expect(page.locator("#scenario-domain option")).toHaveCount(5);

    await page.getByRole("tab", { name: "Model" }).click();
    await expect(panel).toContainText(
      "Collective has no validated cross-domain workload or closure curve. Showing Housing & Building",
    );
    await expect(page.locator("#workload-domain")).toHaveValue(
      "housing_building",
    );
    await expect(page.locator("#workload-domain option")).toHaveCount(5);

    await page.getByRole("tab", { name: "Explore" }).click();

    await page.locator("#domain-control").selectOption("housing_building");
    await expect(composition.locator("[class*='domainTag']")).toHaveCount(0);
    const dob = composition.locator('[title="Department of Buildings"]').first();
    await expect(dob).toHaveText("DOB");
    await expect(panel).toContainText("Recorded response");
  });

  test("Info markers escape overflow and dismiss, Space toggles context, and rail width persists", async ({
    page,
  }) => {
    await openAtlas(page);

    const separator = page.getByRole("separator", {
      name: "Resize analysis panel",
    });
    const rail = page.getByRole("complementary", {
      name: "Analysis panel",
      exact: true,
    });
    const initialWidth = (await rail.boundingBox())?.width ?? 0;
    await separator.focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await rail.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initialWidth);
    const persistedWidth = (await rail.boundingBox())?.width ?? 0;
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(localStorage.getItem("nyc311-atlas:analysis-rail-width")),
        ),
      )
      .toBeCloseTo(persistedWidth, 0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await openAtlas(page);
    await expect
      .poll(async () => (await rail.boundingBox())?.width ?? 0)
      .toBeCloseTo(persistedWidth, 0);

    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    const search = page.getByRole("combobox", {
      name: "Search by tract number, GEOID, or borough",
    });
    await search.focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("button", { name: "Compare with nearby tracts" }),
    ).toBeVisible();

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Space");
    await expect(page.getByText("Nearby tract comparison on.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nearby tract comparison" }),
    ).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByText("Nearby tract comparison off.")).toBeVisible();

    await openSummary(page, "Closure timing details");
    const infoTrigger = page.getByRole("button", {
      name: "About sufficient sample status",
    });
    await infoTrigger.click();
    const bubble = page.getByRole("dialog", {
      name: "About sufficient sample status",
    });
    await expect(bubble).toBeVisible();
    expect(
      await bubble.evaluate((element) => element.parentElement === document.body),
    ).toBe(true);
    const bounds = await bubble.boundingBox();
    if (!bounds) throw new Error("Info marker bubble has no viewport bounds.");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerHeight),
    );
    await page.getByRole("heading", { name: "Explore the historical record" }).click();
    await expect(bubble).toBeHidden();
    await infoTrigger.click();
    await page.keyboard.press("Escape");
    await expect(bubble).toBeHidden();
    await expect(page.getByLabel("Selected census tracts")).toHaveCount(1);
  });

  test("Priority settings, method controls, and comparison lifecycle are live", async ({
    page,
  }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("tab", { name: "Prioritize" }).click();
    await expect(page.getByText("100 tracts surfaced", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#scenario-explanation-tract")).toHaveValue(
      REPRESENTATIVE_TRACTS.sufficient.properties.geoid,
    );
    await expect(
      page.getByText("Rank among eligible tracts", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "About the scoring approaches" }).click();
    await page
      .getByRole("dialog", { name: "About the scoring approaches" })
      .getByRole("button", { name: "Read the method" })
      .click();
    await expect(page.getByRole("heading", { name: "Prioritization", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close methodology" }).click();

    await page.getByRole("button", { name: "Magnitude-sensitive" }).click();
    await page.locator("#scenario-domain").selectOption("street_infrastructure");
    await page.locator("#scenario-k").selectOption("150");
    await setRange(page.locator("#scenario-alpha"), 0.8);
    await expect(page.getByText("150 tracts surfaced", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Rank-balanced" }).click();

    await openSummary(page, "View data table");
    await expect(page.getByRole("columnheader", { name: "Priority balance" })).toBeVisible();
    await openSummary(page, "All result measures");
    const modelEstimates = page
      .getByRole("heading", { name: "Model estimates" })
      .locator("..");
    await expect(
      modelEstimates.getByRole("rowheader", { name: "Still open after 30 days" }),
    ).toBeVisible();

    await page.locator("#scenario-explanation-tract").selectOption(
      REPRESENTATIVE_TRACTS.high.properties.geoid,
    );
    await expect(page.getByText("Rank among eligible tracts", { exact: true })).toBeVisible();
    await openSummary(page, "Technical score calculation");
    await expect(page.getByText("Deterministic score", { exact: true })).toBeVisible();
    await page.locator("#scenario-explanation-tract").selectOption(
      REPRESENTATIVE_TRACTS.ineligible.properties.geoid,
    );
    await expect(page.getByText("Not allocation eligible", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save current definition" }).click();
    await expect(page.getByRole("button", { name: "Clear comparison" })).toBeVisible();
    await page.getByRole("button", { name: "Clear comparison" }).click();
    await expect(page.getByRole("button", { name: "Save current definition" })).toBeVisible();
  });

  test("Model scope, replay, request-age, and assumption controls are live", async ({
    page,
  }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("tab", { name: "Model" }).click();
    await expect(page.getByText("13 periods")).toBeVisible({ timeout: 20_000 });

    await page.locator("#workload-domain").selectOption("noise");
    await expect(page.locator("#workload-domain")).toHaveValue("noise");
    await page.locator("#workload-domain").selectOption("housing_building");
    await page.locator("#workload-scope").selectOption("selected_tracts");
    await expect(page.locator("#workload-scope")).toHaveValue("selected_tracts");
    await page.locator("#workload-scope").selectOption("active_neighborhood");
    await expect(page.locator("#workload-scope")).toHaveValue(
      "active_neighborhood",
    );
    const modelControls = page
      .locator(".panel-section.field-group")
      .filter({ has: page.locator("#workload-scope") });
    await expect(modelControls).toContainText(
      /pooled across \d+ nearby tracts/,
    );
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

    await openSummary(page, "Technical details");
    await expect(page.getByRole("columnheader", { name: "New requests" })).toBeVisible();
    await expect(
      page.getByText(
        "Typical range (middle 80%) · based on 1,000 resamples of complete historical months and closure uncertainty.",
      ),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "180 days" }).click();
    await expect(page.getByText("median modeled still open after ~6 months")).toBeVisible();
    await expect(page.getByText("95% modeled still-open range", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "About this uncertainty interval" }).click();
    await page
      .getByRole("dialog", { name: "About this uncertainty interval" })
      .getByRole("button", { name: "Read the method" })
      .click();
    await expect(page.getByRole("heading", { name: "Modeling", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close methodology" }).click();

    await page.getByRole("button", { name: "What-if", exact: true }).click();
    const arrivalAssumption = page.locator(".field-stack").filter({
      has: page.locator("#demand-change"),
    });
    const closureAssumption = page.locator(".field-stack").filter({
      has: page.locator("#closure-shift"),
    });
    await expect(arrivalAssumption).toContainText(
      "The arrival change applies to every historical period.",
    );
    await expect(closureAssumption).toContainText(
      "The closure change adds the stated percentage points at every request-age checkpoint",
    );
    await expect(page.locator("#closure-shift")).toHaveAttribute("min", "-15");
    await expect(page.locator("#closure-shift")).toHaveAttribute("max", "15");
    const [demandTrackWidth, closureTrackWidth] = await Promise.all([
      page.locator("#demand-change").evaluate(
        (element) => element.getBoundingClientRect().width,
      ),
      page.locator("#closure-shift").evaluate(
        (element) => element.getBoundingClientRect().width,
      ),
    ]);
    expect(Math.abs(demandTrackWidth - closureTrackWidth)).toBeLessThanOrEqual(1);
    await setRange(page.locator("#demand-change"), -30);
    await setRange(page.locator("#closure-shift"), 15);
    await expect(page.locator('output[for="demand-change"]')).toHaveText("−30.0%");
    await expect(page.locator('output[for="closure-shift"]')).toHaveText(
      "+15.0 pts",
    );
    await openSummary(page, "Period and age-composition comparison");
    await expect(page.getByRole("columnheader", { name: "Arrival Δ" })).toBeVisible();
    await page.getByRole("button", { name: "Historical", exact: true }).click();
    await expect(page.getByRole("button", { name: "Historical", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Model lazy-loads the current priority selection and keeps an unsaved scope empty", async ({
    page,
  }) => {
    const artifactRequests: string[] = [];
    page.on("request", (request) => artifactRequests.push(request.url()));

    await openAtlas(page);
    await page.getByRole("tab", { name: "Model" }).click();
    await expect(page.locator("#workload-scope")).toBeVisible({
      timeout: 20_000,
    });
    expect(
      artifactRequests.some((url) => url.endsWith("/data/scenarios.json")),
    ).toBe(false);

    await page.locator("#workload-scope").selectOption("current_scenario");
    const scopeMetadata = page
      .locator("p[aria-live='polite']")
      .filter({ hasText: "current priority selection" });
    await expect(scopeMetadata).toContainText(
      "pooled across 100 tracts in the current priority selection",
      { timeout: 20_000 },
    );
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
    for (const name of ["Explore", "Prioritize", "Model", "Interpretation with Claude"]) {
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

    await page.getByRole("button", { name: "Copy a link to this view" }).click();
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

    await mobileWorkspace.getByRole("tab", { name: "Interpretation with Claude" }).click();
    await expect(
      mobileWorkspace.getByRole("tab", { name: "Interpretation with Claude" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".analysis-rail .rail-scroll")).toBeHidden();
    await expect(page.locator(".analysis-rail .assistant-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Interpretation with Claude" }),
    ).toBeVisible();

    await mobileWorkspace.getByRole("tab", { name: "Explore" }).click();
    await expect(page.locator(".analysis-rail .rail-scroll")).toBeVisible();
    await expect(page.locator(".analysis-rail .assistant-panel")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Explore the historical record" }),
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
