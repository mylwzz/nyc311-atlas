"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Workload, WorkloadInterval } from "@/lib/artifacts";
import { DOMAIN_CONFIG, DOMAIN_KEYS, type DomainKey, type WorkloadScope, type WorkloadTab } from "@/lib/domain";
import { formatDateRange, formatExpected, formatInteger, formatPercent, formatSigned } from "@/lib/formatting";
import {
  deterministicUncertainty,
  exportedBaselineInterval,
  type ExportedBaselineUncertainty,
  type UncertaintySummary,
} from "@/lib/uncertainty";
import {
  aggregateWorkloadScope,
  evaluateWorkload,
  type WorkloadAgeBucket,
  type WorkloadAggregate,
  type WorkloadModelConfig,
} from "@/lib/workload";
import { InfoMarker } from "@/components/ui/InfoMarker";

import {
  ArrivalsClosuresChart,
  OpenBalanceChart,
  OpenByAgeChart,
  UncertaintyIntervalBand,
} from "./WorkloadCharts";
import styles from "./WorkloadPanel.module.css";

const SCOPE_LABELS: Record<WorkloadScope, string> = {
  active_tract: "Active tract",
  selected_tracts: "Selected tracts",
  active_neighborhood: "Nearby tracts",
  current_scenario: "Current priority selection",
  pinned_scenario: "Saved priority comparison",
};

const AGE_BUCKET_LABELS: readonly {
  key: WorkloadAgeBucket;
  label: string;
}[] = [
  { key: "0_30", label: "First month" },
  { key: "31_60", label: "1–2 months" },
  { key: "61_90", label: "2–3 months" },
  { key: "91_180", label: "3–6 months" },
  { key: "181_360", label: "6–12 months" },
  { key: "361_plus", label: "Over a year" },
];

function scopeDescription(scope: WorkloadScope, tractCount: number): string {
  const tractWord = tractCount === 1 ? "tract" : "tracts";
  switch (scope) {
    case "active_tract":
      return tractCount === 1 ? "active tract" : "no active tract";
    case "selected_tracts":
      return tractCount > 1
        ? `pooled across ${tractCount} selected tracts`
        : `${tractCount} selected ${tractWord}`;
    case "active_neighborhood":
      return tractCount > 0
        ? `pooled across ${tractCount} nearby ${tractWord}`
        : "no nearby tracts";
    case "current_scenario":
      return tractCount > 0
        ? `pooled across ${tractCount} tracts in the current priority selection`
        : "no current priority selection";
    case "pinned_scenario":
      return tractCount > 0
        ? `pooled across ${tractCount} tracts in the saved priority comparison`
        : "no saved priority comparison";
  }
}

interface WorkerReply {
  id: number;
  result?: UncertaintySummary | null;
  error?: string;
}

interface UncertaintyState {
  key: string;
  result: WorkloadInterval | UncertaintySummary | null;
  error: string | null;
}

function modelConfig(workload: Workload): WorkloadModelConfig {
  return {
    periods: workload.periods,
    fullPeriodIndices: workload.fullPeriodIndices,
    ageCheckpointsDays: workload.ageCheckpointsDays,
    minimumKnownTimingSample: workload.uncertainty.minimumKnownTimingSample,
    periodDays: 30,
    replayRunoffPeriods: 6,
  };
}

function sparseMessage(aggregate: WorkloadAggregate): string {
  switch (aggregate.sampleStatus) {
    case "no_requests":
      return "No mapped requests in this scope and service domain.";
    case "no_known_timing":
      return "Closure timing is unavailable for this scope. Request arrivals remain visible.";
    case "insufficient_sample":
      return `Sample: ${formatInteger(aggregate.knownTiming)} requests · 30 needed for response modeling. Request arrivals remain visible.`;
    case "sufficient":
      return "";
  }
}

function useUncertainty(
  workload: Workload | null,
  aggregate: WorkloadAggregate | null,
  ageDays: 30 | 180,
  demandChangePct: number,
  closureCurveShiftPoints: number,
  exportedBaseline: WorkloadInterval | null,
  enabled = true,
) {
  const [response, setResponse] = useState<UncertaintyState | null>(null);
  const requestId = useRef(0);
  const available = Boolean(
    enabled && workload && aggregate && aggregate.sampleStatus === "sufficient",
  );
  const key = available && workload && aggregate
    ? [
        workload.artifactSetId,
        aggregate.geoids.join(","),
        aggregate.domainKey,
        ageDays,
        demandChangePct,
        closureCurveShiftPoints,
      ].join("|")
    : "";

  useEffect(() => {
    if (!available || !workload || !aggregate || exportedBaseline) return;
    const ageIndex = workload.ageCheckpointsDays.indexOf(ageDays);
    if (ageIndex < 0) return;
    const id = ++requestId.current;
    const request = {
      artifactSetId: workload.artifactSetId,
      baseSeed: workload.uncertainty.seed,
      geoids: aggregate.geoids,
      domainKey: aggregate.domainKey,
      ageDays,
      periodArrivals: aggregate.periodArrivals,
      fullPeriodIndices: workload.fullPeriodIndices,
      knownTiming: aggregate.knownTiming,
      closedByAge: aggregate.closedByAge[ageIndex],
      minimumKnownTimingSample: workload.uncertainty.minimumKnownTimingSample,
      draws: workload.uncertainty.draws,
      demandChangePct,
      closureCurveShiftPoints,
    } as const;
    if (typeof Worker === "undefined") {
      let cancelled = false;
      void Promise.resolve().then(() => deterministicUncertainty(request)).then(
        (result) => {
          if (!cancelled) setResponse({ key, result, error: null });
        },
        (caught: unknown) => {
          if (!cancelled) {
            setResponse({
              key,
              result: null,
              error: caught instanceof Error
                ? caught.message
                : "Uncertainty could not be evaluated.",
            });
          }
        },
      );
      return () => {
        cancelled = true;
      };
    }

    const worker = new Worker(new URL("../../workers/workload.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.id !== id || requestId.current !== id) return;
      if (event.data.error) {
        setResponse({ key, result: null, error: event.data.error });
      } else {
        setResponse({ key, result: event.data.result ?? null, error: null });
      }
      worker.terminate();
    };
    worker.onerror = () => {
      if (requestId.current === id) {
        setResponse({
          key,
          result: null,
          error: "Uncertainty could not be evaluated in the background worker.",
        });
      }
      worker.terminate();
    };
    worker.postMessage({ id, request });
    return () => worker.terminate();
  }, [ageDays, aggregate, available, closureCurveShiftPoints, demandChangePct, exportedBaseline, key, workload]);

  if (!available) return { result: null, status: "idle" as const, error: null };
  if (exportedBaseline) {
    return {
      result: exportedBaseline,
      status: "ready" as const,
      error: null,
    };
  }
  if (!response || response.key !== key) {
    return { result: null, status: "loading" as const, error: null };
  }
  if (response.error) {
    return { result: null, status: "error" as const, error: response.error };
  }
  return { result: response.result, status: "ready" as const, error: null };
}

export interface WorkloadPanelProps {
  workload: Workload | null;
  loading: boolean;
  error?: Error | null;
  onLoad: () => void | Promise<unknown>;
  domain: DomainKey;
  onDomainChange: (domain: DomainKey) => void;
  scope: WorkloadScope;
  scopeGeoids: readonly string[];
  tab: WorkloadTab;
  requestAgeDays: 30 | 180;
  demandChangePct: number;
  closureCurveShiftPoints: number;
  exportedBaselineUncertainty: ExportedBaselineUncertainty | null;
  onTabChange: (tab: WorkloadTab) => void;
  onScopeChange: (scope: WorkloadScope) => void;
  onRequestAgeChange: (age: 30 | 180) => void;
  onDemandChange: (value: number) => void;
  onClosureShift: (value: number) => void;
  onReadMethod?: () => void;
}

export function WorkloadPanel(props: WorkloadPanelProps) {
  const {
    workload,
    loading,
    error,
    onLoad,
    domain,
    onDomainChange,
    scope,
    scopeGeoids,
    tab,
    requestAgeDays,
    demandChangePct,
    closureCurveShiftPoints,
    exportedBaselineUncertainty,
    onTabChange,
    onScopeChange,
    onRequestAgeChange,
    onDemandChange,
    onClosureShift,
    onReadMethod,
  } = props;

  useEffect(() => {
    void onLoad();
  }, [onLoad]);

  const config = useMemo(() => (workload ? modelConfig(workload) : null), [workload]);
  const aggregate = useMemo(() => {
    if (!workload || !config || scopeGeoids.length === 0) return null;
    const value = aggregateWorkloadScope(workload.tracts, scopeGeoids, domain, config);
    return value.kind === "aggregate" ? value : null;
  }, [config, domain, scopeGeoids, workload]);
  const appliedDemand = tab === "scenario" ? demandChangePct : 0;
  const appliedShift = tab === "scenario" ? closureCurveShiftPoints : 0;
  const evaluation = useMemo(
    () => aggregate && config
      ? evaluateWorkload(aggregate, config, {
          demandChangePct: appliedDemand,
          closureCurveShiftPoints: appliedShift,
        })
      : null,
    [aggregate, appliedDemand, appliedShift, config],
  );
  const baselineEvaluation = useMemo(
    () => aggregate && config
      ? evaluateWorkload(aggregate, config, {
          demandChangePct: 0,
          closureCurveShiftPoints: 0,
        })
      : null,
    [aggregate, config],
  );
  const uncertainty = useUncertainty(
    workload,
    aggregate,
    requestAgeDays,
    appliedDemand,
    appliedShift,
    exportedBaselineInterval(
      exportedBaselineUncertainty,
      requestAgeDays,
      appliedDemand,
      appliedShift,
    ),
  );
  const baselineUncertainty = useUncertainty(
    workload,
    aggregate,
    requestAgeDays,
    0,
    0,
    exportedBaselineInterval(
      exportedBaselineUncertainty,
      requestAgeDays,
      0,
      0,
    ),
    tab === "scenario",
  );

  const assumptionBased = tab === "scenario";
  const scopeSummary = `${DOMAIN_CONFIG[domain].label} · ${scopeDescription(
    scope,
    scopeGeoids.length,
  )}`;

  return (
    <>
      <header className="rail-header">
        <h2 className="rail-title">Model request flow</h2>
        <p className="helper-text">
          Replay historical request cohorts and test explicit assumptions.
        </p>
        <p className={styles.localBoundary}>
          Historical replay and assumption-based modeling—not a current agency
          forecast.
        </p>
      </header>

      <section className={`panel-section field-group ${styles.scopeSection}`}>
        <div className="field-stack">
          <label className="field-label" htmlFor="workload-scope">
            Analyze
          </label>
          <select
            id="workload-scope"
            className="select"
            value={scope}
            onChange={(event) =>
              onScopeChange(event.target.value as WorkloadScope)
            }
          >
            {Object.entries(SCOPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field-stack">
          <label className="field-label" htmlFor="workload-domain">
            Service domain
          </label>
          <select
            id="workload-domain"
            className="select"
            value={domain}
            onChange={(event) =>
              onDomainChange(event.target.value as DomainKey)
            }
          >
            {DOMAIN_KEYS.map((key) => (
              <option key={key} value={key}>
                {DOMAIN_CONFIG[key].label}
              </option>
            ))}
          </select>
        </div>
        <p className={styles.scopeSummary} aria-live="polite">
          {scopeSummary}
        </p>
      </section>

      <div className={`panel-section ${styles.modelTabs}`}>
        <div className="segmented" aria-label="Model view">
          <button
            type="button"
            aria-pressed={tab === "historical"}
            onClick={() => onTabChange("historical")}
          >
            Historical
          </button>
          <button
            type="button"
            aria-pressed={tab === "scenario"}
            onClick={() => onTabChange("scenario")}
          >
            What-if
          </button>
        </div>
      </div>

      {loading && !workload ? (
        <div className="panel-section" role="status">
          <div className="loading-line" />
          <p className="helper-text">Loading workload records…</p>
        </div>
      ) : error && !workload ? (
        <div className="panel-section">
          <div className="error-state" role="alert">
            {error.message}
          </div>
          <button className="button" type="button" onClick={onLoad}>
            Retry
          </button>
        </div>
      ) : null}

      {assumptionBased ? (
        <section
          className="panel-section field-group"
          aria-labelledby="assumption-heading"
        >
          <div>
            <div className="eyebrow">What-if assumptions</div>
            <h3 className="section-title" id="assumption-heading">
              Assumption-based workload scenario
            </h3>
          </div>
          <div className="field-stack">
            <label className="field-label" htmlFor="demand-change">
              Change expected request arrivals
            </label>
            <div className="range-row">
              <input
                id="demand-change"
                type="range"
                min={-30}
                max={50}
                step={1}
                value={demandChangePct}
                onChange={(event) =>
                  onDemandChange(Number(event.target.value))
                }
              />
              <output className="range-value" htmlFor="demand-change">
                {formatSigned(demandChangePct, "%")}
              </output>
            </div>
            <p className="helper-text">
              The arrival change applies to every historical period.
            </p>
          </div>
          <div className="field-stack">
            <div className={styles.labelWithHelp}>
              <label className="field-label" htmlFor="closure-shift">
                Change closure pace
              </label>
              <InfoMarker
                label="About the recorded-closure pace assumption"
                onReadMethod={onReadMethod}
              >
                <p>
                  This shifts the historical closure curve directly by
                  the stated number of percentage points. It is not a validated
                  staffing or policy effect.
                </p>
              </InfoMarker>
            </div>
            <div className="range-row">
              <input
                id="closure-shift"
                type="range"
                min={-15}
                max={15}
                step={1}
                value={closureCurveShiftPoints}
                onChange={(event) =>
                  onClosureShift(Number(event.target.value))
                }
              />
              <output className="range-value" htmlFor="closure-shift">
                {formatSigned(closureCurveShiftPoints, " pts")}
              </output>
            </div>
            <p className="helper-text">
              The closure change adds the stated percentage points at every
              request-age checkpoint and clamps each probability to 0–1
              (0%–100%).
            </p>
          </div>
        </section>
      ) : null}

      {!workload && !loading && !error ? (
        <div className="panel-section empty-state">
          Workload data has not loaded.
        </div>
      ) : workload && (!aggregate || !evaluation) ? (
        <div className="panel-section empty-state">
          This scope is empty. Choose an active tract, selected tracts, nearby
          tracts, or a priority selection.
        </div>
      ) : workload && aggregate && evaluation ? (
        <>
          <section className="panel-section" aria-labelledby="arrival-heading">
            <div className="section-heading-row">
              <div>
                {assumptionBased ? (
                  <div className={styles.assumptionLabel}>
                    Assumption-based workload scenario
                  </div>
                ) : (
                  <div className="eyebrow">Observed arrival record</div>
                )}
                <h3 className="section-title" id="arrival-heading">
                  Historical arrival pattern
                </h3>
              </div>
              <span className="metadata">13 periods</span>
            </div>
            <div className="workload-summary">
              <div>
                <strong>
                  {formatExpected(evaluation.meanFullPeriodArrivals)}
                </strong>
                <span className="helper-text">
                  Average new requests per full month
                </span>
              </div>
              <div>
                <strong>{formatInteger(aggregate.requestCount)}</strong>
                <span className="helper-text">Requests in this scope</span>
              </div>
            </div>
            <div
              className={`period-strip ${styles.periodStrip}`}
              aria-label={
                assumptionBased
                  ? "Arrival periods · Assumption-based workload scenario"
                  : "Arrival periods"
              }
            >
              {workload.periods.map((period, index) => (
                <div
                  key={period.index}
                  className={`period-cell${
                    period.isFullPeriod ? "" : " partial"
                  }`}
                >
                  <span>P{index + 1}</span>
                  <strong>
                    {formatExpected(evaluation.periodArrivals[index])}
                  </strong>
                  <small>
                    {formatDateRange(period.start, period.observedEnd)}
                  </small>
                  <small>
                    {period.isFullPeriod ? "30 days" : "6 days · partial"}
                  </small>
                </div>
              ))}
            </div>
            <p className="helper-text">
              {assumptionBased
                ? "The stated arrival assumption is applied to every displayed historical period. The average uses the twelve complete historical months. The final six-day period remains partial and is excluded from the average and uncertainty resampling."
                : "The average uses the twelve complete historical months. The final six-day period is partial and excluded from the average and uncertainty resampling."}
            </p>
            {evaluation.replay ? (
              <ArrivalsClosuresChart
                replay={evaluation.replay}
                arrivalPeriodCount={workload.periods.length}
                assumptionBased={assumptionBased}
              />
            ) : null}
          </section>

          {aggregate.sampleStatus !== "sufficient" ? (
            <>
              <section className="panel-section">
                <div className="warning-box">
                  {sparseMessage(aggregate)}
                </div>
              </section>
              <section className="panel-section field-group">
                <OpenBalanceChart replay={[]} />
              </section>
              <section className="panel-section field-group">
                <OpenByAgeChart replay={[]} />
              </section>
            </>
          ) : evaluation.replay ? (
            <>
              {assumptionBased && baselineEvaluation?.replay ? (
                <section
                  className="panel-section field-group"
                  aria-labelledby="baseline-comparison-heading"
                >
                  <div className={styles.assumptionLabel}>
                    Assumption-based workload scenario
                  </div>
                  <h3
                    className="section-title"
                    id="baseline-comparison-heading"
                  >
                    Change from historical replay
                  </h3>
                  <div className="comparison-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Result</th>
                          <th>Historical</th>
                          <th>What-if</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th scope="row">
                            Average new requests per full month
                          </th>
                          <td>
                            {formatExpected(
                              baselineEvaluation.meanFullPeriodArrivals,
                            )}
                          </td>
                          <td>
                            {formatExpected(evaluation.meanFullPeriodArrivals)}
                          </td>
                          <td>
                            {formatSigned(
                              evaluation.meanFullPeriodArrivals -
                                baselineEvaluation.meanFullPeriodArrivals,
                            )}
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">
                            Modeled still open after 30 days
                          </th>
                          <td>
                            {formatExpected(
                              baselineEvaluation.cohortOpenAt30Days,
                            )}
                          </td>
                          <td>
                            {formatExpected(evaluation.cohortOpenAt30Days)}
                          </td>
                          <td>
                            {formatSigned(
                              (evaluation.cohortOpenAt30Days ?? 0) -
                                (baselineEvaluation.cohortOpenAt30Days ?? 0),
                            )}
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">
                            Modeled still open after ~6 months
                          </th>
                          <td>
                            {formatExpected(
                              baselineEvaluation.cohortOpenAt180Days,
                            )}
                          </td>
                          <td>
                            {formatExpected(evaluation.cohortOpenAt180Days)}
                          </td>
                          <td>
                            {formatSigned(
                              (evaluation.cohortOpenAt180Days ?? 0) -
                                (baselineEvaluation.cohortOpenAt180Days ?? 0),
                            )}
                          </td>
                        </tr>
                        <tr>
                          <th scope="row">
                            Peak modeled requests still open
                          </th>
                          <td>
                            {formatExpected(
                              Math.max(
                                ...baselineEvaluation.replay.map(
                                  (period) => period.expectedOpenBalance,
                                ),
                              ),
                            )}
                          </td>
                          <td>
                            {formatExpected(
                              Math.max(
                                ...evaluation.replay.map(
                                  (period) => period.expectedOpenBalance,
                                ),
                              ),
                            )}
                          </td>
                          <td>
                            {formatSigned(
                              Math.max(
                                ...evaluation.replay.map(
                                  (period) => period.expectedOpenBalance,
                                ),
                              ) -
                                Math.max(
                                  ...baselineEvaluation.replay.map(
                                    (period) => period.expectedOpenBalance,
                                  ),
                                ),
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              <section className="panel-section field-group">
                <OpenBalanceChart
                  replay={evaluation.replay}
                  assumptionBased={assumptionBased}
                />
                <p className={styles.runoffNote}>
                  After the 13 observed arrival periods, six model-only
                  follow-through periods add no new requests. They carry the
                  existing cohorts forward with the active recorded-closure
                  curve to show how the number still open changes.
                </p>
              </section>

              <section className="panel-section field-group">
                <OpenByAgeChart
                  replay={evaluation.replay}
                  assumptionBased={assumptionBased}
                />
              </section>

              <section
                className="panel-section field-group"
                aria-labelledby="request-age-heading"
              >
                {assumptionBased ? (
                  <div className={styles.assumptionLabel}>
                    Assumption-based workload scenario
                  </div>
                ) : null}
                <div>
                  <div className="eyebrow">Request-age checkpoint</div>
                  <h3 className="section-title" id="request-age-heading">
                    Evaluate a 30-day arrival cohort after
                  </h3>
                </div>
                <div className="segmented" aria-label="Request age">
                  {[30, 180].map((age) => (
                    <button
                      key={age}
                      type="button"
                      aria-pressed={requestAgeDays === age}
                      onClick={() => onRequestAgeChange(age as 30 | 180)}
                    >
                      {age} days
                    </button>
                  ))}
                </div>
                {uncertainty.status === "loading" ? (
                  <div className="loading-line" />
                ) : uncertainty.error ? (
                  <div className="error-state">{uncertainty.error}</div>
                ) : uncertainty.result ? (
                  <>
                    <div className={styles.checkpointHero}>
                      <div className="metric-primary">
                        {formatExpected(uncertainty.result.openMedian)}
                      </div>
                      <div className="metric-secondary">
                        median modeled still open after {requestAgeDays === 30 ? "30 days" : "~6 months"}
                      </div>
                    </div>
                    <UncertaintyIntervalBand
                      lower={uncertainty.result.open80[0]}
                      median={uncertainty.result.openMedian}
                      upper={uncertainty.result.open80[1]}
                      label="Typical range (middle 80%)"
                      onReadMethod={onReadMethod}
                    />
                    <div className="status-box">
                      <strong>
                        {formatExpected(uncertainty.result.open80[0])}{" – "}
                        {formatExpected(uncertainty.result.open80[1])}
                      </strong>
                      <div className="helper-text">
                        Typical range (middle 80%) · based on {workload.uncertainty.draws.toLocaleString("en-US")} resamples of complete historical months and closure uncertainty.
                      </div>
                    </div>
                  </>
                ) : null}
                <p className="helper-text">
                  This evaluates one 30-day arrival cohort after reaching request
                  age {requestAgeDays}. It does not represent {requestAgeDays}
                  {" "}days of accumulated arrivals.
                </p>
              </section>

              <section className="panel-section">
                <details className="disclosure">
                  <summary>Technical details</summary>
                  <div className={styles.technicalStack}>
                    {uncertainty.result ? (
                      <>
                        <dl className="metric-grid">
                          <div className="metric-cell">
                            <dt className="label">95% modeled still-open range</dt>
                            <dd className="value">
                              {formatExpected(uncertainty.result.open95[0])}{" – "}
                              {formatExpected(uncertainty.result.open95[1])}
                            </dd>
                          </div>
                          <div className="metric-cell">
                            <dt className="label">
                              Median closure
                            </dt>
                            <dd className="value">
                              {formatPercent(
                                uncertainty.result.closureMedianPct,
                              )}
                            </dd>
                          </div>
                          <div className="metric-cell">
                            <dt className="label">Closure range (middle 80%)</dt>
                            <dd className="value">
                              {formatPercent(
                                uncertainty.result.closure80Pct[0],
                              )}
                              {" – "}
                              {formatPercent(
                                uncertainty.result.closure80Pct[1],
                              )}
                            </dd>
                          </div>
                          <div className="metric-cell">
                            <dt className="label">Closure range (95%)</dt>
                            <dd className="value">
                              {formatPercent(
                                uncertainty.result.closure95Pct[0],
                              )}
                              {" – "}
                              {formatPercent(
                                uncertainty.result.closure95Pct[1],
                              )}
                            </dd>
                          </div>
                        </dl>
                        {assumptionBased && baselineUncertainty.result ? (
                          <div className="comparison-wrap">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Uncertainty result</th>
                                  <th>Historical</th>
                                  <th>What-if</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <th scope="row">Median open</th>
                                  <td>
                                    {formatExpected(
                                      baselineUncertainty.result.openMedian,
                                    )}
                                  </td>
                                  <td>
                                    {formatExpected(
                                      uncertainty.result.openMedian,
                                    )}
                                  </td>
                                </tr>
                                <tr>
                                  <th scope="row">Still-open range (middle 80%)</th>
                                  <td>
                                    {formatExpected(
                                      baselineUncertainty.result.open80[0],
                                    )}
                                    {" – "}
                                    {formatExpected(
                                      baselineUncertainty.result.open80[1],
                                    )}
                                  </td>
                                  <td>
                                    {formatExpected(
                                      uncertainty.result.open80[0],
                                    )}
                                    {" – "}
                                    {formatExpected(
                                      uncertainty.result.open80[1],
                                    )}
                                  </td>
                                </tr>
                                <tr>
                                  <th scope="row">Still-open range (95%)</th>
                                  <td>
                                    {formatExpected(
                                      baselineUncertainty.result.open95[0],
                                    )}
                                    {" – "}
                                    {formatExpected(
                                      baselineUncertainty.result.open95[1],
                                    )}
                                  </td>
                                  <td>
                                    {formatExpected(
                                      uncertainty.result.open95[0],
                                    )}
                                    {" – "}
                                    {formatExpected(
                                      uncertainty.result.open95[1],
                                    )}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                        <div className={styles.methodNote}>
                          <p>{workload.uncertainty.method}</p>
                          <p>
                            Recorded-closure probability uses a Jeffreys beta
                            posterior: Beta(closed + 0.5, known − closed + 0.5).
                          </p>
                          <p>
                            Deterministic seed: {"seed" in uncertainty.result
                              ? uncertainty.result.seed.toLocaleString("en-US")
                              : `${workload.uncertainty.seed.toLocaleString("en-US")} (artifact base seed)`}
                            .
                          </p>
                        </div>
                      </>
                    ) : null}

                    <div className="comparison-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th>New requests</th>
                            <th>Modeled closures</th>
                            <th>Modeled requests still open</th>
                            <th>Net open-workload change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evaluation.replay.map((period) => (
                            <tr key={period.periodIndex}>
                              <td>
                                P{period.periodIndex + 1}
                                {period.periodIndex < workload.periods.length
                                  ? ` · ${formatDateRange(
                                      workload.periods[period.periodIndex].start,
                                      workload.periods[period.periodIndex]
                                        .observedEnd,
                                    )}`
                                  : " · model-only follow-through"}
                                {period.periodIndex === 12
                                  ? " · partial"
                                  : ""}
                              </td>
                              <td>{formatExpected(period.newRequests)}</td>
                              <td>
                                {formatExpected(
                                  period.expectedRecordedClosures,
                                )}
                              </td>
                              <td>
                                {formatExpected(period.expectedOpenBalance)}
                              </td>
                              <td>{formatSigned(period.netOpenChange)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {assumptionBased && baselineEvaluation?.replay ? (
                      <details className="disclosure">
                        <summary>Period and age-composition comparison</summary>
                        <div className="comparison-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Period</th>
                                <th>Arrival Δ</th>
                                <th>Expected closure Δ</th>
                                <th>Still-open requests Δ</th>
                                <th>Net open Δ</th>
                                {AGE_BUCKET_LABELS.map((bucket) => (
                                  <th key={bucket.key}>{bucket.label} Δ</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {evaluation.replay.map((period, index) => {
                                const baseline =
                                  baselineEvaluation.replay?.[index];
                                if (!baseline) return null;
                                return (
                                  <tr key={period.periodIndex}>
                                    <td>P{period.periodIndex + 1}</td>
                                    <td>
                                      {formatSigned(
                                        period.newRequests -
                                          baseline.newRequests,
                                      )}
                                    </td>
                                    <td>
                                      {formatSigned(
                                        period.expectedRecordedClosures -
                                          baseline.expectedRecordedClosures,
                                      )}
                                    </td>
                                    <td>
                                      {formatSigned(
                                        period.expectedOpenBalance -
                                          baseline.expectedOpenBalance,
                                      )}
                                    </td>
                                    <td>
                                      {formatSigned(
                                        period.netOpenChange -
                                          baseline.netOpenChange,
                                      )}
                                    </td>
                                    {AGE_BUCKET_LABELS.map((bucket) => (
                                      <td key={bucket.key}>
                                        {formatSigned(
                                          period.openByAge[bucket.key] -
                                            baseline.openByAge[bucket.key],
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : null}
                  </div>
                </details>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
