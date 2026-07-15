import { expect, test, type Page } from "@playwright/test";

import { REPRESENTATIVE_TRACTS } from "../fixtures/representative-tracts";
import {
  openAtlas,
  selectTract,
  setRange,
  settleVisual,
} from "./helpers";

async function capture(page: Page, name: string): Promise<void> {
  await settleVisual(page);
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
  });
}

async function enableNeighborhood(page: Page, radius: "1" | "5") {
  const neighborhood = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Queen neighborhood" }),
  });
  await neighborhood.getByRole("button", { name: "Off" }).click();
  await neighborhood.locator("#neighborhood-radius").selectOption(radius);
  await expect(neighborhood.locator("#neighborhood-radius")).toHaveValue(radius);
  await expect(page.getByLabel("Map legend")).toContainText(
    "Neighborhood outer perimeter",
  );
}

test.describe("@visual launch-state regression", () => {
  test("default Explore", async ({ page }) => {
    await openAtlas(page);
    await capture(page, "atlas-default.png");
  });

  test("single tract", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.high);
    await expect(page.getByText("Top complaint types")).toBeVisible();
    await capture(page, "atlas-single-tract.png");
  });

  test("five-tract comparison", async ({ page }) => {
    await openAtlas(page);
    for (const tract of REPRESENTATIVE_TRACTS.fiveSufficient.slice(0, 5)) {
      await selectTract(page, tract);
    }
    await expect(page.getByLabel("Selected census tracts").locator(".tract-chip")).toHaveCount(5);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await capture(page, "atlas-five-tracts.png");
  });

  test("Queen radius one", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.high);
    await enableNeighborhood(page, "1");
    await capture(page, "atlas-neighborhood-radius-1.png");
  });

  test("Queen radius five", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.high);
    await enableNeighborhood(page, "5");
    await capture(page, "atlas-neighborhood-radius-5.png");
  });

  test("sparse tract", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sparse);
    await expect(
      page.getByText("Insufficient tract-specific sample", { exact: true }).first(),
    ).toBeVisible();
    await capture(page, "atlas-sparse-tract.png");
  });

  test("Scenario Lab", async ({ page }) => {
    await openAtlas(page);
    await page.getByRole("tab", { name: "Scenario Lab" }).click();
    await expect(page.getByText(/Explore all 550 deterministic selection scenarios/)).toBeVisible({
      timeout: 20_000,
    });
    await capture(page, "atlas-scenario-lab.png");
  });

  test("pinned Scenario Lab comparison", async ({ page }) => {
    await openAtlas(page);
    await page.getByRole("tab", { name: "Scenario Lab" }).click();
    await expect(page.getByText(/Explore all 550 deterministic selection scenarios/)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Pin current" }).click();
    await setRange(page.locator("#scenario-alpha"), 0);
    await expect(page.getByText("Entered", { exact: true })).toBeVisible();
    await capture(page, "atlas-scenario-pinned.png");
  });

  test("Workload historical replay", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("tab", { name: "Workload" }).click();
    await expect(page.getByText("13 periods")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Expected open balance", { exact: true }).first()).toBeVisible();
    await capture(page, "atlas-workload-replay.png");
  });

  test("Workload assumption scenario", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("tab", { name: "Workload" }).click();
    await expect(page.getByText("13 periods")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Scenario", exact: true }).click();
    await setRange(page.locator("#demand-change"), 20);
    await setRange(page.locator("#closure-shift"), 5);
    await capture(page, "atlas-workload-scenario.png");
  });

  test("Claude confirmation", async ({ page }) => {
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
            "The supplied neighborhood values can be inspected at radius five without changing any deterministic result.",
          action: { type: "set_neighborhood", enabled: true, radius: 5 },
        }),
      });
    });
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await enableNeighborhood(page, "1");
    await page.getByRole("button", { name: "Claude interpretation" }).click();
    await page.locator("#assistant-task").selectOption(
      "explain_neighborhood_context",
    );
    await page.locator("#assistant-prompt").fill(
      "Explain this context and offer the supported wider-radius control.",
    );
    await page.getByRole("button", { name: "Interpret", exact: true }).click();
    await expect(page.getByText("Proposed control change")).toBeVisible();
    await capture(page, "atlas-claude-confirmation.png");
  });

  test("mobile Explore", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAtlas(page);
    await capture(page, "atlas-mobile.png");
  });
});
