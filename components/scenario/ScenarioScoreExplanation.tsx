"use client";

import { useMemo, useState } from "react";

import type { Scenario, TractFeature } from "@/lib/artifacts";
import { formatTractName } from "@/lib/formatting";
import { explainScenarioTract } from "@/lib/scenario";

import styles from "./ScenarioLab.module.css";

const exactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

const INELIGIBILITY_LABELS: Record<string, string> = {
  missing_population: "Population is unavailable.",
  population_below_500: "Population is below the 500-person threshold.",
  missing_income: "Median household income is unavailable.",
};

function formatScore(value: number | null): string {
  return value === null ? "Not available" : exactNumber.format(value);
}

export function ScenarioScoreExplanation({
  scenario,
  features,
}: {
  scenario: Scenario;
  features: readonly TractFeature[];
}) {
  const [selectedGeoid, setSelectedGeoid] = useState("");
  const sortedFeatures = useMemo(
    () =>
      [...features].sort(
        (left, right) =>
          left.properties.borough.localeCompare(right.properties.borough) ||
          left.properties.tractName.localeCompare(
            right.properties.tractName,
            undefined,
            { numeric: true },
          ),
      ),
    [features],
  );
  const selectedFeature = useMemo(
    () =>
      features.find(
        (feature) => feature.properties.geoid === selectedGeoid,
      ) ?? null,
    [features, selectedGeoid],
  );
  const explanation = useMemo(
    () =>
      selectedFeature
        ? explainScenarioTract(
            scenario,
            selectedFeature.properties,
            features.map((feature) => feature.properties),
          )
        : null,
    [features, scenario, selectedFeature],
  );

  return (
    <div className={styles.explanation}>
      <div className="field-stack">
        <label className="field-label" htmlFor="scenario-explanation-tract">
          Census tract
        </label>
        <select
          id="scenario-explanation-tract"
          className="select"
          value={selectedGeoid}
          onChange={(event) => setSelectedGeoid(event.target.value)}
        >
          <option value="">Choose any tract…</option>
          {sortedFeatures.map((feature) => (
            <option
              key={feature.properties.geoid}
              value={feature.properties.geoid}
            >
              {formatTractName(
                feature.properties.tractName,
                feature.properties.borough,
              )}{" "}
              · {feature.properties.geoid}
            </option>
          ))}
        </select>
      </div>

      {!explanation ? (
        <p className="helper-text">
          Choose a tract to see whether it surfaces and why. Exact score
          components remain available in technical details.
        </p>
      ) : explanation.allocationEligible ? (
        <>
          <div className={styles.scoreIdentity}>
            <div>
              <span className="eyebrow">Rank among eligible tracts</span>
              <strong>
                {explanation.rank?.toLocaleString("en-US") ?? "Not available"}
              </strong>
            </div>
            <span
              className={`${styles.membershipBadge} ${
                explanation.isSelected ? styles.included : ""
              }`}
            >
              {explanation.isSelected
                ? "Surfaced by this definition"
                : "Not surfaced by this definition"}
            </span>
          </div>
          <p className="helper-text">
            The selected scoring approach scales complaint intensity and
            lower-income priority, blends them at the chosen balance, then
            ranks every eligible tract. This explanation does not change the
            map comparison selection.
          </p>
          <details className="disclosure">
            <summary>Technical score calculation</summary>
            <table className="data-table">
              <tbody>
                <tr>
                  <th scope="row">Deterministic score</th>
                  <td>{formatScore(explanation.score)}</td>
                </tr>
                <tr>
                  <th scope="row">
                    Complaint-intensity{" "}
                    {scenario.scalingMode === "rank_balanced"
                      ? "percentile"
                      : "z-score"}
                  </th>
                  <td>{formatScore(explanation.intensityValue)}</td>
                </tr>
                <tr>
                  <th scope="row">Complaint-intensity contribution</th>
                  <td>
                    {explanation.alphaIntensity.toFixed(1)} ×{" "}
                    {formatScore(explanation.intensityValue)} ={" "}
                    {formatScore(explanation.intensityContribution)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    Lower-income{" "}
                    {scenario.scalingMode === "rank_balanced"
                      ? "percentile"
                      : "z-score"}
                  </th>
                  <td>{formatScore(explanation.lowerIncomeValue)}</td>
                </tr>
                <tr>
                  <th scope="row">Lower-income contribution</th>
                  <td>
                    {explanation.alphaLowerIncome.toFixed(1)} ×{" "}
                    {formatScore(explanation.lowerIncomeValue)} ={" "}
                    {formatScore(explanation.lowerIncomeContribution)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Selection cutoff score</th>
                  <td>{formatScore(explanation.selectionCutoffScore)}</td>
                </tr>
                <tr>
                  <th scope="row">Distance from cutoff</th>
                  <td>
                    {explanation.distanceFromSelectionCutoff === null
                      ? "Not available"
                      : `${
                          explanation.distanceFromSelectionCutoff >= 0
                            ? "+"
                            : "−"
                        }${formatScore(
                          Math.abs(explanation.distanceFromSelectionCutoff),
                        )}`}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="helper-text">
              Score = complaint-intensity contribution + lower-income
              contribution. Ties are ordered by GEOID.
            </p>
          </details>
        </>
      ) : (
        <div className="status-box">
          <strong>Not allocation eligible</strong>
          <p>
            {INELIGIBILITY_LABELS[
              explanation.allocationIneligibilityReason ?? ""
            ] ?? "The artifact marks this tract as ineligible."}
          </p>
          <small className="metadata">No score or rank is assigned.</small>
        </div>
      )}
    </div>
  );
}
