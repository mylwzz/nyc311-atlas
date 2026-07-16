import { expect, test } from "@playwright/test";

import { REPRESENTATIVE_TRACTS } from "../fixtures/representative-tracts";
import {
  clearSelection,
  hoverActualTract,
  nameOf,
  openAtlas,
  selectTract,
  setRange,
} from "./helpers";

test.describe("launch-critical Atlas workflows", () => {
  test("startup renders Explore before optional artifact workspaces", async ({
    page,
  }) => {
    const artifactRequests: string[] = [];
    page.on("request", (request) => artifactRequests.push(request.url()));

    await openAtlas(page);

    await expect(page.getByRole("tab", { name: "Explore" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("#domain-control")).toHaveValue(
      "housing_building",
    );
    await expect(page.locator("#metric-control")).toHaveValue(
      "complaint_intensity",
    );
    await expect(page.getByRole("heading", { name: "Explore the historical record" })).toBeVisible();
    await expect(page.getByLabel("Map legend")).toContainText(
      "Complaints per 1,000",
    );
    await expect(page.getByText("Choose a tract to begin")).toBeVisible();

    expect(
      artifactRequests.some((url) => url.endsWith("/data/tract_details.json")),
    ).toBe(false);
    expect(
      artifactRequests.some((url) => url.endsWith("/data/scenarios.json")),
    ).toBe(false);
    expect(
      artifactRequests.some((url) => url.endsWith("/data/workload.json")),
    ).toBe(false);
  });

  test("actual canvas hover, click-again removal, and named map layers stay coordinated", async ({
    page,
  }) => {
    await openAtlas(page);
    // Use a broad, sufficient tract so both clicks exercise a stable polygon
    // interior before and after the responsive Explore rail resize.
    const actual = REPRESENTATIVE_TRACTS.sufficient;
    const point = await hoverActualTract(page, actual);
    const tooltip = page.getByLabel(`Map details for ${nameOf(actual)}`);
    await expect(tooltip).toContainText(`GEOID ${actual.properties.geoid}`);
    await expect(tooltip).toContainText("Population");
    await expect(tooltip).toContainText("Median income");
    await expect(tooltip).toContainText("Mapped complaints · Housing & Building");
    await expect(tooltip).toContainText("Complaints per 1,000");
    await expect(tooltip.locator("dl")).not.toContainText("Median household income");

    await hoverActualTract(page, REPRESENTATIVE_TRACTS.missingDemographics);
    const unavailableTooltip = page.getByLabel(
      `Map details for ${nameOf(REPRESENTATIVE_TRACTS.missingDemographics)}`,
    );
    await expect(unavailableTooltip).toContainText("Population N/A");
    await expect(unavailableTooltip).toContainText("Median income N/A");

    await page.mouse.click(point.x, point.y);
    await expect(page.getByLabel("Selected census tracts")).toContainText(
      `Tract ${actual.properties.tractName}`,
    );
    // Selecting a tract expands the Explore rail, so re-project against the
    // resized map before exercising click-again removal.
    const selectedPoint = await hoverActualTract(page, actual);
    await page.mouse.click(selectedPoint.x, selectedPoint.y);
    await expect(page.getByLabel("Selected census tracts")).toHaveCount(0);

    const metric = page.locator("#metric-control");
    const legend = page.getByLabel("Map legend");
    await metric.selectOption("mapped_complaint_count");
    await expect(legend).toContainText("Mapped complaints");

    await metric.selectOption("recorded_closure_30d");
    await expect(legend).toContainText("Closed within 30 days");
    await expect(legend).toContainText("Not available / insufficient sample");

    await metric.selectOption("expected_cohort_open_age_30d");
    await expect(legend).toContainText("Modeled still open after 30 days");
    await expect(legend).toContainText("Not available / insufficient sample");

    await selectTract(page, actual);
    const mapCanvas = page.getByLabel(
      /Interactive New York City census tract map/,
    );
    await mapCanvas.focus();
    const keyboardTooltip = page.getByLabel(`Map details for ${nameOf(actual)}`);
    await expect(keyboardTooltip).toBeVisible();
    await expect(keyboardTooltip.getByRole("button")).toHaveCount(0);
    await expect(keyboardTooltip).not.toContainText("About");
  });

  test("actual high, low, ineligible, island, zero, sparse, and sufficient tracts render honestly", async ({
    page,
  }) => {
    const tracts = REPRESENTATIVE_TRACTS;
    await openAtlas(page);

    await selectTract(page, tracts.high);
    await expect(page.getByRole("heading", { name: `Census Tract ${tracts.high.properties.tractName}` })).toBeVisible();
    await expect(
      page.getByText("closed within 30 days", { exact: true }),
    ).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.low);
    await expect(page.getByRole("heading", { name: `Census Tract ${tracts.low.properties.tractName}` })).toBeVisible();
    await expect(page.getByText("1.1 per 1,000 residents")).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.ineligible);
    await expect(
      page.getByRole("heading", { name: `Census Tract ${tracts.ineligible.properties.tractName}` }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Data notes for this view" }).click();
    await expect(page.getByText("Not eligible for prioritization", { exact: true })).toBeVisible();
    await expect(page.getByText("Per 1,000 residents", { exact: true })).toBeVisible();
    await expect(page.getByText("Response sample", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close data notes" }).click();
    await clearSelection(page);

    await selectTract(page, tracts.zeroRequest);
    await expect(page.getByText("No mapped requests", { exact: true }).first()).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.sparse);
    await expect(
      page.getByText("Small response sample", { exact: true }).first(),
    ).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.sufficient);
    await expect(
      page.getByText("closed within 30 days", { exact: true }),
    ).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.island);
    await page.getByRole("button", { name: "Compare with nearby tracts" }).click();
    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Nearby tract comparison" }),
    });
    await expect(neighborhood).toBeVisible();
    await expect(
      page.getByText(/No nearby tracts share a boundary or corner/).first(),
    ).toBeVisible();
  });

  test("selection caps at five, chips activate, neighborhood expands, and Escape clears", async ({
    page,
  }) => {
    await openAtlas(page);
    const six = REPRESENTATIVE_TRACTS.fiveSufficient;
    for (const tract of six.slice(0, 5)) await selectTract(page, tract);
    const search = page.getByRole("combobox", {
      name: "Search by tract number, GEOID, or borough",
    });
    await search.fill(six[5].properties.geoid);
    await page
      .getByRole("option")
      .filter({ hasText: six[5].properties.geoid })
      .click();

    const selected = page.getByLabel("Selected census tracts");
    await expect(selected.locator(".tract-chip")).toHaveCount(5);
    await expect(page.getByRole("status")).toContainText(
      "Compare up to 5 tracts at once.",
    );

    await selected
      .getByRole("button", {
        name: `Make ${nameOf(six[0])} active`,
      })
      .click();
    await expect(selected.locator(".tract-chip").first()).toHaveAttribute(
      "data-active",
      "true",
    );
    await clearSelection(page);

    await selectTract(page, REPRESENTATIVE_TRACTS.high);
    await page.getByRole("button", { name: "Compare with nearby tracts" }).click();
    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Nearby tract comparison" }),
    });
    const included = neighborhood.locator(".metric-cell").filter({
      hasText: "Included tracts",
    }).locator(".value");
    const radiusOneCount = Number(await included.textContent());
    await neighborhood.locator("#neighborhood-radius").selectOption("5");
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveValue("5");
    await expect.poll(async () => Number(await included.textContent())).toBeGreaterThan(
      radiusOneCount,
    );
    await expect(page.getByLabel("Map legend")).toContainText(
      "Neighborhood outer perimeter",
    );
    await clearSelection(page);
  });

  test("Prioritize exposes the exact overlay and saved comparison", async ({
    page,
  }) => {
    await openAtlas(page);
    await page.getByRole("tab", { name: "Prioritize" }).click();

    await expect(page.getByRole("heading", { name: "Prioritize tracts" })).toBeVisible();
    await expect(
      page.getByText(
        "Rank eligible tracts by complaint intensity and lower-income priority, then choose how many of the highest-ranked tracts to show.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Set the definition" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Rank eligible tracts by the combined score/),
    ).toBeVisible();
    await expect(
      page.getByText(/one of 550 validated historical definitions/),
    ).toBeVisible();
    await expect(page.getByText("100 tracts surfaced", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("#scenario-k")).toHaveValue("100");
    await expect(page.getByLabel("Map legend")).toContainText(
      "Current priority definition",
    );

    await page.getByRole("button", { name: "Magnitude-sensitive" }).click();
    await page.locator("#scenario-domain").selectOption("noise");
    await page.locator("#scenario-k").selectOption("25");
    await setRange(page.locator("#scenario-alpha"), 0.7);
    await expect(page.getByText("25 tracts surfaced", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save current definition" }).click();
    await setRange(page.locator("#scenario-alpha"), 0);
    await expect(page.locator('output[for="scenario-alpha"]')).toContainText(
      "0% weight to complaint intensity",
    );
    await expect(page.getByText("Newly surfaced", { exact: true })).toBeVisible();
    await expect(page.getByText("No longer surfaced", { exact: true })).toBeVisible();
    await expect(page.getByText("Shared", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Map legend")).toContainText(
      "Shared by both definitions",
    );
  });

  test("workload keeps sparse single scopes suppressed and permits explicit pooling", async ({
    page,
  }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sparse);
    await page.getByRole("tab", { name: "Model" }).click();
    await expect(page.getByText(/Sample: \d+ requests · 30 needed for response modeling/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText("Not enough response data for this chart.", {
        exact: true,
      }),
    ).toHaveCount(2);

    await page.getByRole("tab", { name: "Explore" }).click();
    await clearSelection(page);
    for (const tract of REPRESENTATIVE_TRACTS.pooledSparse) {
      await selectTract(page, tract);
    }
    await page.getByRole("tab", { name: "Model" }).click();
    await page.locator("#workload-scope").selectOption("selected_tracts");
    await expect(
      page
        .locator("p[aria-live='polite']")
        .filter({ hasText: "Housing & Building" }),
    ).toContainText(
      `pooled across ${REPRESENTATIVE_TRACTS.pooledSparse.length} selected tracts`,
    );
    await expect(page.getByText("13 periods")).toBeVisible();
    await expect(page.getByText("6 days · partial")).toBeVisible();
    await expect(page.getByText("Requests in this scope", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("figure", {
        name: /Modeled requests still open over time/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Typical range (middle 80%) · based on 1,000 resamples of complete historical months and closure uncertainty.",
      ),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "180 days" }).click();
    await expect(page.getByText("median modeled still open after ~6 months")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/does not represent 180 days of accumulated arrivals/),
    ).toBeVisible();
    const intervalDetails = page.getByText("Technical details", { exact: true });
    await intervalDetails.click();
    await expect(page.getByText("95% modeled still-open range", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "What-if", exact: true }).click();
    await setRange(page.locator("#demand-change"), 20);
    await setRange(page.locator("#closure-shift"), 5);
    await expect(page.locator('output[for="demand-change"]')).toHaveText("+20.0%");
    await expect(page.locator('output[for="closure-shift"]')).toHaveText(
      "+5.0 percentage points",
    );
    await expect(
      page.getByRole("heading", { name: "Assumption-based workload scenario" }),
    ).toBeVisible();
  });

  test("Claude control proposals remain inert until the user presses Apply", async ({
    page,
  }) => {
    await page.route("**/api/assistant", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ available: true }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          available: true,
          narrative:
            "The supplied Queen-contiguity context can also be inspected at radius five.",
          action: { type: "set_neighborhood", enabled: true, radius: 5 },
        }),
      });
    });

    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("button", { name: "Compare with nearby tracts" }).click();
    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Nearby tract comparison" }),
    });
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveValue("1");

    await page.getByRole("button", { name: "Interpretation with Claude" }).click();
    await page.locator("#assistant-task").selectOption(
      "explain_neighborhood_context",
    );
    await page.locator("#assistant-prompt").fill(
      "Show a wider neighborhood context using only the supplied controls.",
    );
    await page.getByRole("button", { name: "Interpret", exact: true }).click();
    await expect(page.getByText("Proposed control change")).toBeVisible();
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveValue("1");

    await page.getByRole("button", { name: "Apply" }).click();
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveValue("5");
    await expect(page.getByText("Proposed control change")).toHaveCount(0);
  });
});
