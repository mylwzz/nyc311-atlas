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
    await expect(page.getByRole("heading", { name: "Housing & Building" })).toBeVisible();
    await expect(page.getByLabel("Map legend")).toContainText(
      "Complaints per 1,000",
    );
    await expect(page.getByText("Begin with the map")).toBeVisible();

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
    const actual = REPRESENTATIVE_TRACTS.high;
    const point = await hoverActualTract(page, actual);
    const tooltip = page.getByLabel(`Map details for ${nameOf(actual)}`);
    await expect(tooltip).toContainText("Housing & Building mapped complaints");
    await expect(tooltip).toContainText("Complaints per 1,000");

    await page.mouse.click(point.x, point.y);
    await expect(page.getByLabel("Selected census tracts")).toContainText(
      `Tract ${actual.properties.tractName}`,
    );
    await page.mouse.click(point.x, point.y);
    await expect(page.getByLabel("Selected census tracts")).toHaveCount(0);

    const metric = page.locator("#metric-control");
    const legend = page.getByLabel("Map legend");
    await metric.selectOption("mapped_complaint_count");
    await expect(legend).toContainText("Mapped complaints");

    await metric.selectOption("recorded_closure_30d");
    await expect(legend).toContainText("Recorded closed within 30 days");
    await expect(legend).toContainText("Not available / insufficient sample");

    await metric.selectOption("expected_cohort_open_age_30d");
    await expect(legend).toContainText("Expected cohort open at age 30");
    await expect(legend).toContainText("Not available / insufficient sample");

    await selectTract(page, actual);
    const mapCanvas = page.getByLabel(
      /Interactive New York City census tract map/,
    );
    await mapCanvas.focus();
    const keyboardTooltip = page.getByLabel(`Map details for ${nameOf(actual)}`);
    await expect(keyboardTooltip).toBeVisible();
    await expect(keyboardTooltip).toHaveAttribute("tabindex", "0");
    await keyboardTooltip.focus();
    await expect(keyboardTooltip).toBeFocused();
  });

  test("actual high, low, ineligible, island, zero, sparse, and sufficient tracts render honestly", async ({
    page,
  }) => {
    const tracts = REPRESENTATIVE_TRACTS;
    await openAtlas(page);

    await selectTract(page, tracts.high);
    await expect(page.getByRole("heading", { name: nameOf(tracts.high) })).toBeVisible();
    await expect(page.getByText("recorded closure within 30 days")).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.low);
    await expect(page.getByRole("heading", { name: nameOf(tracts.low) })).toBeVisible();
    await expect(page.getByText("1.1 per 1,000 residents")).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.ineligible);
    await expect(
      page.getByRole("heading", { name: nameOf(tracts.ineligible) }),
    ).toBeVisible();
    await expect(page.getByText(/allocation eligibility is unavailable|not allocation eligible/i).first()).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.zeroRequest);
    await expect(page.getByText("No mapped requests", { exact: true }).first()).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.sparse);
    await expect(
      page.getByText("Insufficient tract-specific sample", { exact: true }).first(),
    ).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.sufficient);
    await expect(page.getByText("recorded closure within 30 days")).toBeVisible();
    await clearSelection(page);

    await selectTract(page, tracts.island);
    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Queen neighborhood" }),
    });
    await neighborhood.getByRole("button", { name: "Off" }).click();
    await expect(
      page.getByText("No contiguous tract neighbors are available.").first(),
    ).toBeVisible();
  });

  test("selection caps at five, chips activate, neighborhood expands, and Escape clears", async ({
    page,
  }) => {
    await openAtlas(page);
    const six = REPRESENTATIVE_TRACTS.fiveSufficient;
    for (const tract of six.slice(0, 5)) await selectTract(page, tract);
    await page.locator("#tract-search").selectOption(six[5].properties.geoid);

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
    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Queen neighborhood" }),
    });
    await neighborhood.getByRole("button", { name: "Off" }).click();
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

  test("Scenario Lab exposes the exact overlay and pinned comparison", async ({
    page,
  }) => {
    await openAtlas(page);
    await page.getByRole("tab", { name: "Scenario Lab" }).click();

    await expect(page.getByRole("heading", { name: "Scenario Lab" })).toBeVisible();
    await expect(page.getByText(/Explore all 550 deterministic selection scenarios/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText("rank_balanced-housing_building-k100-a050", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("#scenario-k")).toHaveValue("100");
    await expect(page.getByLabel("Map legend")).toContainText(
      "Current selection scenario",
    );

    await page.getByRole("button", { name: "Magnitude-sensitive" }).click();
    await page.locator("#scenario-domain").selectOption("noise");
    await page.locator("#scenario-k").selectOption("25");
    await setRange(page.locator("#scenario-alpha"), 0.7);
    await expect(
      page.getByText("magnitude_sensitive-noise-k25-a070", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "1 exact match · magnitude_sensitive-noise-k25-a070",
        { exact: true },
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Pin current" }).click();
    await setRange(page.locator("#scenario-alpha"), 0);
    await expect(page.locator('output[for="scenario-alpha"]')).toHaveText("0.0");
    await expect(page.getByText("Entered", { exact: true })).toBeVisible();
    await expect(page.getByText("Exited", { exact: true })).toBeVisible();
    await expect(page.getByText("Shared", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Map legend")).toContainText(
      "Shared by both scenarios",
    );
  });

  test("workload keeps sparse single scopes suppressed and permits explicit pooling", async ({
    page,
  }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sparse);
    await page.getByRole("tab", { name: "Workload" }).click();
    await expect(page.getByText(/fewer than 30 known timing outcomes/)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("tab", { name: "Explore" }).click();
    await clearSelection(page);
    for (const tract of REPRESENTATIVE_TRACTS.pooledSparse) {
      await selectTract(page, tract);
    }
    await page.getByRole("tab", { name: "Workload" }).click();
    await page.locator("#workload-scope").selectOption("selected_tracts");
    await expect(page.getByText(
      `Pooled across ${REPRESENTATIVE_TRACTS.pooledSparse.length} tracts`,
    )).toBeVisible();
    await expect(page.getByText("13 periods")).toBeVisible();
    await expect(page.getByText("6 days · partial")).toBeVisible();
    await expect(page.getByText("Expected open balance", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("80% uncertainty interval · 1,000 draws")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Age 180" }).click();
    await expect(page.getByText("expected open at age 180")).toBeVisible({
      timeout: 20_000,
    });
    const intervalDetails = page.getByText(
      "95% interval and recorded-closure uncertainty",
      { exact: true },
    );
    await intervalDetails.click();
    await expect(page.getByText("95% open interval", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Scenario", exact: true }).click();
    await setRange(page.locator("#demand-change"), 20);
    await setRange(page.locator("#closure-shift"), 5);
    await expect(page.locator('output[for="demand-change"]')).toHaveText("+20.0%");
    await expect(page.locator('output[for="closure-shift"]')).toHaveText("+5.0 pp");
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
    const neighborhood = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Queen neighborhood" }),
    });
    await neighborhood.getByRole("button", { name: "Off" }).click();
    await expect(neighborhood.locator("#neighborhood-radius")).toHaveValue("1");

    await page.getByRole("button", { name: "Claude interpretation" }).click();
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
