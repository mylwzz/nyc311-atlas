"use client";

import { useEffect, useMemo } from "react";

import type {
  Scenario,
  Scenarios,
  Tradeoff,
  TractsGeoJson,
} from "@/lib/artifacts";
import type {
  AlphaValue,
  DomainKey,
  KValue,
  ScalingMode,
} from "@/lib/domain";
import { formatPercent } from "@/lib/formatting";
import { createScenarioIndex, scenarioId } from "@/lib/scenario";

import { Chart } from "../ui/Chart";
import {
  ScenarioControls,
  type ScenarioControlValues,
} from "./ScenarioControls";
import { ScenarioComparison } from "./ScenarioComparison";
import styles from "./ScenarioLab.module.css";
import { ScenarioMetrics } from "./ScenarioMetrics";
import { ScenarioScoreExplanation } from "./ScenarioScoreExplanation";

export type ScenarioLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ScenarioLabProps {
  scenarios: Scenarios | null;
  tradeoff: Tradeoff | null;
  tracts: TractsGeoJson;
  loadStatus: ScenarioLoadStatus;
  loadError?: Error | null;
  scalingMode: ScalingMode;
  domain: DomainKey;
  k: KValue;
  alpha: AlphaValue;
  currentScenarioId?: string | null;
  pinnedScenarioId: string | null;
  onLoad: () => void | Promise<unknown>;
  onControlsChange: (controls: Partial<ScenarioControlValues>) => void;
  onCurrentScenarioChange: (scenarioId: string | null) => void;
  onPinnedScenarioChange: (scenarioId: string | null) => void;
  onReadMethod?: () => void;
}

const SCALING_LABELS: Record<ScalingMode, string> = {
  rank_balanced: "Rank-balanced",
  magnitude_sensitive: "Magnitude-sensitive",
};

const technicalNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

function PriorityTradeoff({
  tradeoff,
  current,
}: {
  tradeoff: Tradeoff;
  current: Scenario;
}) {
  const points = tradeoff.points
    .filter(
      (point) =>
        point.scalingMode === current.scalingMode &&
        point.domainKey === current.domainKey &&
        point.k === current.k,
    )
    .sort((left, right) => left.alphaIntensity - right.alphaIntensity);

  const data = points.map((point) => ({
    key: point.scenarioId,
    label: `${Math.round(point.alphaIntensity * 100)}%`,
    values: {
      intensity: point.intensityRetentionVsRateMaxPct,
      lowerIncome: point.selectedQ1TractSharePct,
      current:
        point.scenarioId === current.id
          ? point.intensityRetentionVsRateMaxPct
          : null,
    },
  }));

  return (
    <div className={styles.tradeoff}>
      <Chart
        title="How the selection changes"
        description="Move from lower-income priority toward complaint intensity. The active balance is marked on the complaint-intensity line."
        data={data}
        series={[
          {
            key: "intensity",
            label: "Complaint intensity retained",
            color: "#596f65",
            type: "line",
          },
          {
            key: "lowerIncome",
            label: "Lower-income tract share",
            color: "#a57859",
            type: "line",
          },
          {
            key: "current",
            label: "Current definition",
            color: "#a13f32",
            type: "line",
          },
        ]}
        yLabel="Percent"
        height={246}
        valueFormatter={formatPercent}
        tableSummary={null}
      />
      <p className={styles.currentBalance}>
        Current balance: {Math.round(current.alphaIntensity * 100)}% complaint
        intensity · {Math.round(current.alphaLowerIncome * 100)}% lower-income
        priority
      </p>
      <details className="disclosure">
        <summary>View data table</summary>
        <div className={styles.sensitivityTableWrap}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Priority balance</th>
                <th scope="col">Intensity retained</th>
                <th scope="col">Lower-income tract share</th>
                <th scope="col">Mapped volume</th>
                <th scope="col">Population share</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr
                  key={point.scenarioId}
                  className={
                    point.scenarioId === current.id
                      ? styles.currentPoint
                      : undefined
                  }
                >
                  <th scope="row">
                    {Math.round(point.alphaIntensity * 100)}% complaint intensity
                  </th>
                  <td>
                    {formatPercent(point.intensityRetentionVsRateMaxPct)}
                  </td>
                  <td>{formatPercent(point.selectedQ1TractSharePct)}</td>
                  <td>
                    {formatPercent(point.mappedComplaintVolumeCapturedPct)}
                  </td>
                  <td>
                    {formatPercent(point.cityPopulationInSelectedTractsPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function DefinitionTechnicalDetails({ scenario }: { scenario: Scenario }) {
  return (
    <details className="disclosure">
      <summary>Technical details</summary>
      <div className={styles.technicalDetails}>
        <table className="data-table">
          <tbody>
            <tr>
              <th scope="row">Scenario ID</th>
              <td>
                <code>{scenario.id}</code>
              </td>
            </tr>
            <tr>
              <th scope="row">K</th>
              <td>{scenario.k}</td>
            </tr>
            <tr>
              <th scope="row">Alpha</th>
              <td>{scenario.alphaIntensity.toFixed(1)}</td>
            </tr>
            <tr>
              <th scope="row">Eligible tract count</th>
              <td>
                {scenario.selection.eligibleTractCount.toLocaleString("en-US")}
              </td>
            </tr>
            <tr>
              <th scope="row">Selection cutoff score</th>
              <td>
                {technicalNumber.format(
                  scenario.selection.selectionCutoffScore,
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Target metric field</th>
              <td>
                <code>{scenario.targetMetric}</code>
              </td>
            </tr>
            <tr>
              <th scope="row">Count metric field</th>
              <td>
                <code>{scenario.countMetric}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="helper-text">
          score = alpha × scaled complaint intensity + (1 − alpha) × scaled
          lower-income priority. Tracts are ranked by score, ties are ordered by
          GEOID, and the first K are surfaced.
        </p>
      </div>
    </details>
  );
}

function LoadingState() {
  return (
    <section className="panel-section" aria-labelledby="prioritize-heading">
      <h2 id="prioritize-heading" className="section-title">
        Prioritize tracts
      </h2>
      <p className="helper-text">
        Rank tracts prioritizing complaint intensity and lower-income priority,
        then choose how many highest-ranked tracts show.
      </p>
      <div className={styles.loading} role="status" aria-live="polite">
        <span className="loading-line" />
        <span className="loading-line" />
        <span className="loading-line" />
        <p className="helper-text">Loading validated priority definitions…</p>
      </div>
    </section>
  );
}

export function ScenarioLab({
  scenarios,
  tradeoff,
  tracts,
  loadStatus,
  loadError = null,
  scalingMode,
  domain,
  k,
  alpha,
  currentScenarioId,
  pinnedScenarioId,
  onLoad,
  onControlsChange,
  onCurrentScenarioChange,
  onPinnedScenarioChange,
  onReadMethod,
}: ScenarioLabProps) {
  useEffect(() => {
    if (loadStatus === "idle") void onLoad();
  }, [loadStatus, onLoad]);

  const scenarioIndex = useMemo(() => {
    if (!scenarios) return null;
    createScenarioIndex(scenarios.scenarios);
    return new Map<string, Scenario>(
      scenarios.scenarios.map((scenario) => [scenario.id, scenario]),
    );
  }, [scenarios]);
  const current = useMemo(() => {
    if (!scenarioIndex) return null;
    const id = scenarioId({
      scalingMode,
      domainKey: domain,
      k,
      alphaIntensity: alpha,
    });
    return id ? (scenarioIndex.get(id) ?? null) : null;
  }, [alpha, domain, k, scalingMode, scenarioIndex]);
  const pinned = useMemo(
    () =>
      pinnedScenarioId && scenarioIndex
        ? (scenarioIndex.get(pinnedScenarioId) ?? null)
        : null,
    [pinnedScenarioId, scenarioIndex],
  );

  useEffect(() => {
    const nextId = current?.id ?? null;
    if (currentScenarioId !== nextId) onCurrentScenarioChange(nextId);
  }, [current, currentScenarioId, onCurrentScenarioChange]);

  if (loadStatus === "idle" || loadStatus === "loading") {
    return <LoadingState />;
  }

  if (loadStatus === "error" || !scenarios || !tradeoff) {
    return (
      <section className="panel-section" aria-labelledby="prioritize-heading">
        <h2 id="prioritize-heading" className="section-title">
          Prioritize tracts
        </h2>
        <div className="error-state" role="alert">
          <strong>Priority definitions could not be loaded.</strong>
          <p>
            {loadError?.message ??
              "The validated prioritization artifacts are unavailable."}
          </p>
          <button className="button" type="button" onClick={() => void onLoad()}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="panel-section" aria-labelledby="prioritize-heading">
        <h2 id="prioritize-heading" className="section-title">
          Prioritize tracts
        </h2>
        <div className="error-state" role="alert">
          <strong>No validated priority definition matches these settings.</strong>
          <p>Choose another supported combination and try again.</p>
        </div>
      </section>
    );
  }

  const pinIsCurrent = pinnedScenarioId === current.id;

  return (
    <section className={styles.lab} aria-labelledby="prioritize-heading">
      <header className={styles.labHeader}>
        <h2 id="prioritize-heading" className="section-title">
          Prioritize tracts
        </h2>
        <p className="helper-text">
          Rank eligible tracts by complaint intensity and lower-income priority,
          then choose how many of the highest-ranked tracts to show.
        </p>
      </header>

      <div className={styles.section} aria-labelledby="priority-settings-heading">
        <div className="eyebrow">How priority is defined</div>
        <h3 id="priority-settings-heading" className={styles.subheading}>
          Set the definition
        </h3>
        <ol className={styles.definitionSteps}>
          <li>
            Compare complaint intensity (<em>complaints per 1,000 residents</em>) with
            lower-income priority, based on median household income.
          </li>
          <li>
            Choose how the two measures are scaled and how much each counts.
          </li>
          <li>
            Rank eligible tracts by the combined score, then show the number of
            highest-ranked tracts you select.
          </li>
        </ol>
        <ScenarioControls
          scalingMode={scalingMode}
          domain={domain}
          k={k}
          alpha={alpha}
          onReadMethod={onReadMethod}
          onChange={onControlsChange}
        />
        <p className="helper-text">
          Every supported combination opens one of {scenarios.scenarios.length}{" "}
          validated historical definitions. It does not generate a policy
          recommendation.
        </p>
      </div>

      <div className={styles.section} aria-labelledby="priority-result-heading">
        <div className="eyebrow">Current priority definition</div>
        <h3 id="priority-result-heading" className={styles.scenarioTitle}>
          {current.domainLabel}
        </h3>
        <p className="metadata">
          {SCALING_LABELS[current.scalingMode]} ·{" "}
          {Math.round(current.alphaIntensity * 100)}% complaint intensity ·{" "}
          {Math.round(current.alphaLowerIncome * 100)}% lower-income priority
        </p>
        <ScenarioMetrics scenario={current} />
        <PriorityTradeoff tradeoff={tradeoff} current={current} />
        <DefinitionTechnicalDetails scenario={current} />
      </div>

      <div className={styles.section}>
        <div className="section-heading-row">
          <div>
            <div className="eyebrow">Controlled comparison</div>
            <h3 className={styles.subheading}>
              Compare with another definition
            </h3>
          </div>
          <div className={styles.comparisonActions}>
            <button
              type="button"
              className="button"
              disabled={pinIsCurrent}
              onClick={() => onPinnedScenarioChange(current.id)}
            >
              {pinIsCurrent ? "Definition saved" : "Save current definition"}
            </button>
            {pinnedScenarioId ? (
              <button
                type="button"
                className="button"
                onClick={() => onPinnedScenarioChange(null)}
              >
                Clear comparison
              </button>
            ) : null}
          </div>
        </div>

        {pinnedScenarioId && !pinned ? (
          <div className="warning-box" role="status">
            <strong>
              The saved definition is not available in this artifact set.
            </strong>
            <button
              className="button"
              type="button"
              onClick={() => onPinnedScenarioChange(null)}
            >
              Clear comparison
            </button>
          </div>
        ) : pinned ? (
          <ScenarioComparison
            current={current}
            pinned={pinned}
            features={tracts.features}
          />
        ) : (
          <div className="status-box">
            Save the current definition, then change a setting to see shared,
            newly surfaced, and no-longer-surfaced tracts.
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className="eyebrow">Transparent scoring</div>
        <h3 className={styles.subheading}>Explain any tract</h3>
        <p className="helper-text">
          See how an artifact-defined score leads to rank and membership without
          changing the priority definition.
        </p>
        <ScenarioScoreExplanation
          scenario={current}
          features={tracts.features}
        />
      </div>
    </section>
  );
}
