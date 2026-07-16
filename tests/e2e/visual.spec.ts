import { expect, test, type Page } from "@playwright/test";

import { REPRESENTATIVE_TRACTS } from "../fixtures/representative-tracts";
import {
  hoverActualTract,
  nameOf,
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
  await page.getByRole("button", { name: "Compare with nearby tracts" }).click();
  const neighborhood = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Nearby tract comparison" }),
  });
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
    await expect(page.getByText("Complaint types and agencies", { exact: true })).toBeVisible();
    await expect(page.getByText("Top complaint types")).toHaveCount(0);
    await capture(page, "atlas-single-tract.png");
  });

  test("tract hover details", async ({ page }) => {
    await openAtlas(page);
    await hoverActualTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await expect(
      page.getByLabel(
        `Map details for ${nameOf(REPRESENTATIVE_TRACTS.sufficient)}`,
      ),
    ).toContainText("Median income");
    await capture(page, "atlas-tract-hover.png");
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
      page.getByText("Small response sample", { exact: true }).first(),
    ).toBeVisible();
    await capture(page, "atlas-sparse-tract.png");
  });

  test("Prioritize", async ({ page }) => {
    await openAtlas(page);
    await page.getByRole("tab", { name: "Prioritize" }).click();
    await expect(page.getByText("100 tracts surfaced", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await capture(page, "atlas-scenario-lab.png");
  });

  test("saved Prioritize comparison", async ({ page }) => {
    await openAtlas(page);
    await page.getByRole("tab", { name: "Prioritize" }).click();
    await expect(page.getByText("100 tracts surfaced", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Save current definition" }).click();
    await setRange(page.locator("#scenario-alpha"), 0);
    await expect(page.getByText("Newly surfaced", { exact: true })).toBeVisible();
    await capture(page, "atlas-scenario-pinned.png");
  });

  test("Model Historical", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("tab", { name: "Model" }).click();
    await expect(page.getByText("13 periods")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("figure", {
        name: /Modeled requests still open over time/,
      }),
    ).toBeVisible();
    await capture(page, "atlas-workload-replay.png");
  });

  test("Model What-if", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.sufficient);
    await page.getByRole("tab", { name: "Model" }).click();
    await expect(page.getByText("13 periods")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "What-if", exact: true }).click();
    await setRange(page.locator("#demand-change"), 20);
    await setRange(page.locator("#closure-shift"), 5);
    await capture(page, "atlas-workload-scenario.png");
  });

  test("Interpretation confirmation", async ({ page }) => {
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
    await page.getByRole("button", { name: "Interpretation with Claude" }).click();
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

  test("Methodology topics", async ({ page }) => {
    await openAtlas(page);
    await page.getByRole("button", { name: "Methodology" }).click();
    await expect(page.getByRole("dialog", { name: "How to read the Atlas" })).toBeVisible();
    await page.getByRole("button", { name: "Map metrics" }).click();
    await expect(page.getByRole("heading", { name: "Population and exposure" })).toBeVisible();
    await capture(page, "atlas-methodology.png");
  });

  test("context-aware data notes", async ({ page }) => {
    await openAtlas(page);
    await selectTract(page, REPRESENTATIVE_TRACTS.ineligible);
    await page.getByRole("button", { name: "Data notes for this view" }).click();
    await expect(page.getByRole("dialog", { name: "Data notes" })).toContainText(
      "Not eligible for prioritization",
    );
    await capture(page, "atlas-data-notes.png");
  });

  test("mobile Explore", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAtlas(page);
    await capture(page, "atlas-mobile.png");
  });
});
