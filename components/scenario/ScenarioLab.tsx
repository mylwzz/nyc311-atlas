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
}

function ScenarioHeader({ scenario }: { scenario: Scenario }) {
  return (
    <div className={styles.scenarioHeader}>
      <div>
        <div className="eyebrow">Current selection scenario</div>
        <h3 className={styles.scenarioTitle}>{scenario.domainLabel}</h3>
        <p className="metadata">
          {scenario.scalingMode === "rank_balanced"
            ? "Rank-balanced"
            : "Magnitude-sensitive"}
          {" · priority portfolio size "}
          {scenario.k}
          {" · alpha "}
          {scenario.alphaIntensity.toFixed(1)}
        </p>
      </div>
      <code className={styles.scenarioId}>{scenario.id}</code>
    </div>
  );
}

function SensitivityTable({
  tradeoff,
  current,
}: {
  tradeoff: Tradeoff;
  current: Scenario;
}) {
  const points = tradeoff.points.filter(
    (point) =>
      point.scalingMode === current.scalingMode &&
      point.domainKey === current.domainKey &&
      point.k === current.k,
  );

  return (
    <details className="disclosure">
      <summary>Alpha sensitivity</summary>
      <div className={styles.sensitivityTableWrap}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Alpha</th>
              <th scope="col">Intensity retained</th>
              <th scope="col">Q1 tract share</th>
              <th scope="col">Mapped volume</th>
              <th scope="col">Population share</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr
                key={point.scenarioId}
                className={
                  point.scenarioId === current.id ? styles.currentPoint : undefined
                }
              >
                <th scope="row">{point.alphaIntensity.toFixed(1)}</th>
                <td>{formatPercent(point.intensityRetentionVsRateMaxPct)}</td>
                <td>{formatPercent(point.selectedQ1TractSharePct)}</td>
                <td>{formatPercent(point.mappedComplaintVolumeCapturedPct)}</td>
                <td>{formatPercent(point.cityPopulationInSelectedTractsPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="helper-text">
        This table holds scoring method, domain, and priority portfolio size
        constant while showing all eleven artifact-defined alpha values.
      </p>
    </details>
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
}: ScenarioLabProps) {
  useEffect(() => {
    if (loadStatus === "idle") void onLoad();
  }, [loadStatus, onLoad]);

  const scenarioIndex = useMemo(
    () => {
      if (!scenarios) return null;
      createScenarioIndex(scenarios.scenarios);
      return new Map<string, Scenario>(
        scenarios.scenarios.map((scenario) => [scenario.id, scenario]),
      );
    },
    [scenarios],
  );
  const current = useMemo(
    () => {
      if (!scenarioIndex) return null;
      const id = scenarioId({
        scalingMode,
        domainKey: domain,
        k,
        alphaIntensity: alpha,
      });
      return id ? (scenarioIndex.get(id) ?? null) : null;
    },
    [alpha, domain, k, scalingMode, scenarioIndex],
  );
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
    return (
      <section className="panel-section" aria-labelledby="scenario-lab-heading">
        <div className="eyebrow">Selection scenarios</div>
        <h2 id="scenario-lab-heading" className="section-title">
          Scenario Lab
        </h2>
        <div className={styles.loading} role="status" aria-live="polite">
          <span className="loading-line" />
          <span className="loading-line" />
          <span className="loading-line" />
          <p className="helper-text">Validating 550 selection scenarios…</p>
        </div>
      </section>
    );
  }

  if (loadStatus === "error" || !scenarios || !tradeoff) {
    return (
      <section className="panel-section" aria-labelledby="scenario-lab-heading">
        <div className="eyebrow">Selection scenarios</div>
        <h2 id="scenario-lab-heading" className="section-title">
          Scenario Lab
        </h2>
        <div className="error-state" role="alert">
          <strong>Selection scenarios could not be loaded.</strong>
          <p>{loadError?.message ?? "The validated scenario artifacts are unavailable."}</p>
          <button className="button" type="button" onClick={() => void onLoad()}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="panel-section" aria-labelledby="scenario-lab-heading">
        <div className="error-state" role="alert">
          <strong>No matching selection scenario exists.</strong>
          <p>
            The validated artifact does not contain this exact combination of
            scoring method, domain, K, and alpha.
          </p>
        </div>
      </section>
    );
  }

  const pinIsCurrent = pinnedScenarioId === current.id;

  return (
    <section className={styles.lab} aria-labelledby="scenario-lab-heading">
      <header className={styles.labHeader}>
        <div>
          <div className="eyebrow">Selection scenarios</div>
          <h2 id="scenario-lab-heading" className="section-title">
            Scenario Lab
          </h2>
          <p className="helper-text">
            Explore all {scenarios.scenarios.length} deterministic selection
            scenarios. Scenario membership remains separate from manual tract
            comparison.
          </p>
        </div>
      </header>

      <div className={styles.section} aria-labelledby="scenario-finder-heading">
        <div className="eyebrow">Exported scenario library</div>
        <h3 id="scenario-finder-heading" className={styles.subheading}>
          Scenario Finder
        </h3>
        <p className="helper-text">
          Filter the {scenarios.scenarios.length} exported scenarios by scoring
          method, domain, priority portfolio size, and alpha. Each combination
          opens an existing scenario; it never generates a new result.
        </p>
        <ScenarioControls
          scalingMode={scalingMode}
          domain={domain}
          k={k}
          alpha={alpha}
          onChange={onControlsChange}
        />
        <p className={styles.finderResult} role="status" aria-live="polite">
          1 exact match · {current.id}
        </p>
      </div>

      <div className={styles.section}>
        <ScenarioHeader scenario={current} />
        <div className={styles.definitionGrid}>
          <div>
            <span>Eligible tracts evaluated</span>
            <strong>{current.selection.eligibleTractCount.toLocaleString("en-US")}</strong>
          </div>
          <div>
            <span>Tracts in selection</span>
            <strong>{current.selection.rankedSelectedGeoids.length}</strong>
          </div>
          <div>
            <span>Complaint metric</span>
            <strong>{current.targetMetric}</strong>
          </div>
          <div>
            <span>Count metric</span>
            <strong>{current.countMetric}</strong>
          </div>
        </div>
        <ScenarioMetrics scenario={current} />
        <SensitivityTable tradeoff={tradeoff} current={current} />
      </div>

      <div className={styles.section}>
        <div className="section-heading-row">
          <div>
            <div className="eyebrow">Controlled comparison</div>
            <h3 className={styles.subheading}>Pinned selection scenario</h3>
          </div>
          <button
            type="button"
            className={`button${pinIsCurrent ? " active" : ""}`}
            onClick={() =>
              onPinnedScenarioChange(pinIsCurrent ? null : current.id)
            }
          >
            {pinIsCurrent
              ? "Unpin"
              : pinnedScenarioId
                ? "Replace pin"
                : "Pin current"}
          </button>
        </div>

        {pinnedScenarioId && !pinned ? (
          <div className="warning-box" role="status">
            <strong>The pinned scenario is not in this artifact set.</strong>
            <p className="helper-text">Pinned ID: {pinnedScenarioId}</p>
            <button
              className="button"
              type="button"
              onClick={() => onPinnedScenarioChange(null)}
            >
              Clear pin
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
            Pin the current selection scenario, then change one or more controls
            to see entered, exited, and shared tracts.
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className="eyebrow">Transparent scoring</div>
        <h3 className={styles.subheading}>Explain any tract</h3>
        <p className="helper-text">
          Recompute an artifact-defined tract score without changing the selection.
        </p>
        <ScenarioScoreExplanation
          scenario={current}
          features={tracts.features}
        />
      </div>
    </section>
  );
}
