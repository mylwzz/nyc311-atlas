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
  type WorkloadAggregate,
  type WorkloadModelConfig,
} from "@/lib/workload";

import { ArrivalsClosuresChart, OpenBalanceChart, OpenByAgeChart } from "./WorkloadCharts";

const SCOPE_LABELS: Record<WorkloadScope, string> = {
  active_tract: "Active tract",
  selected_tracts: "Selected tracts",
  active_neighborhood: "Active neighborhood",
  current_scenario: "Current Scenario Lab selection",
  pinned_scenario: "Pinned Scenario Lab selection",
};

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

function sparseMessage(status: WorkloadAggregate["sampleStatus"]): string {
  switch (status) {
    case "no_requests":
      return "No mapped requests occur in this scope and service domain. There is no closure curve, historical replay, open-at-age estimate, or uncertainty result.";
    case "no_known_timing":
      return "Mapped requests are present, but recorded closure timing is unavailable. Arrivals remain visible; closure-derived results are suppressed.";
    case "insufficient_sample":
      return "The pooled scope has fewer than 30 known timing outcomes. Arrivals remain visible; the closure curve, replay, open-at-age estimate, and uncertainty are suppressed.";
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

  if (loading && !workload) {
    return <div className="panel-section"><div className="loading-line" /><p className="helper-text">Loading workload records…</p></div>;
  }
  if (error && !workload) {
    return <div className="panel-section"><div className="error-state">{error.message}</div><button className="button" type="button" onClick={onLoad}>Retry</button></div>;
  }

  return (
    <>
      <header className="rail-header">
        <div className="eyebrow">Workload workspace</div>
        <h2 className="rail-title">Recorded closure replay</h2>
        <p className="helper-text">Historical arrivals and recorded administrative closure—not a forecast or full agency backlog.</p>
      </header>
      <section className="panel-section field-group">
        <div className="segmented" aria-label="Workload view">
          <button type="button" aria-pressed={tab === "historical"} onClick={() => onTabChange("historical")}>Historical Replay</button>
          <button type="button" aria-pressed={tab === "scenario"} onClick={() => onTabChange("scenario")}>Scenario</button>
        </div>
        <div className="field-stack">
          <label className="field-label" htmlFor="workload-domain">Service domain</label>
          <select id="workload-domain" className="select" value={domain} onChange={(event) => onDomainChange(event.target.value as DomainKey)}>
            {DOMAIN_KEYS.map((key) => <option key={key} value={key}>{DOMAIN_CONFIG[key].label}</option>)}
          </select>
        </div>
        <div className="field-stack">
          <label className="field-label" htmlFor="workload-scope">Scope</label>
          <select id="workload-scope" className="select" value={scope} onChange={(event) => onScopeChange(event.target.value as WorkloadScope)}>
            {Object.entries(SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="metadata-line">
          <span>{DOMAIN_CONFIG[domain].label}</span>
          <span>{scopeGeoids.length} tract{scopeGeoids.length === 1 ? "" : "s"}</span>
          {scopeGeoids.length > 1 ? <span>Pooled across {scopeGeoids.length} tracts</span> : null}
          <span>{aggregate ? `${formatInteger(aggregate.knownTiming)} known timing outcomes` : "No available scope"}</span>
        </div>
      </section>

      {tab === "scenario" ? (
        <section className="panel-section field-group" aria-labelledby="assumption-heading">
          <div>
            <div className="eyebrow">Assumptions</div>
            <h3 className="section-title" id="assumption-heading">Assumption-based workload scenario</h3>
          </div>
          <div className="field-stack">
            <label className="field-label" htmlFor="demand-change">Demand change</label>
            <div className="range-row">
              <input id="demand-change" type="range" min={-30} max={50} step={1} value={demandChangePct} onChange={(event) => onDemandChange(Number(event.target.value))} />
              <output className="range-value" htmlFor="demand-change">{formatSigned(demandChangePct, "%")}</output>
            </div>
          </div>
          <div className="field-stack">
            <label className="field-label" htmlFor="closure-shift">Recorded closure-curve shift</label>
            <div className="range-row">
              <input id="closure-shift" type="range" min={-15} max={15} step={1} value={closureCurveShiftPoints} onChange={(event) => onClosureShift(Number(event.target.value))} />
              <output className="range-value" htmlFor="closure-shift">{formatSigned(closureCurveShiftPoints, " pp")}</output>
            </div>
          </div>
          <p className="helper-text">Demand multiplies every historical arrival period. The closure shift adds percentage points at every request-age checkpoint and clamps to 0–100%.</p>
        </section>
      ) : null}

      {!workload ? (
        <div className="panel-section empty-state">Workload data has not loaded.</div>
      ) : !aggregate || !evaluation ? (
        <div className="panel-section empty-state">This scope is empty. Choose an active tract, selection, neighborhood, or Scenario Lab selection.</div>
      ) : (
        <>
          <section className="panel-section" aria-labelledby="arrival-heading">
            <div className="section-heading-row">
              <div>
                <div className="eyebrow">
                  {tab === "scenario"
                    ? "Assumption-based workload scenario"
                    : "Actual historical periods"}
                </div>
                <h3 className="section-title" id="arrival-heading">
                  {tab === "scenario"
                    ? "Historical arrival pattern under stated assumptions"
                    : "2016 historical 30-day arrival pattern"}
                </h3>
              </div>
              <span className="metadata">13 periods</span>
            </div>
            <div className="workload-summary">
              <div><strong>{formatExpected(evaluation.meanFullPeriodArrivals)}</strong><span className="helper-text">Mean complete-period arrivals</span></div>
              <div><strong>{formatInteger(aggregate.requestCount)}</strong><span className="helper-text">Mapped complaints</span></div>
            </div>
            <div
              className="period-strip"
              aria-label={tab === "scenario"
                ? "Arrival periods · Assumption-based workload scenario"
                : "Arrival periods"}
            >
              {workload.periods.map((period, index) => (
                <div key={period.index} className={`period-cell${period.isFullPeriod ? "" : " partial"}`}>
                  <span>P{index + 1}</span>
                  <strong>{formatExpected(evaluation.periodArrivals[index])}</strong>
                  <small>{formatDateRange(period.start, period.observedEnd)}</small>
                  <small>{period.isFullPeriod ? "30 days" : "6 days · partial"}</small>
                </div>
              ))}
            </div>
            <p className="helper-text">
              {tab === "scenario"
                ? "The stated demand change is applied to every displayed historical period. The final six-day period remains visibly partial and is excluded from complete-period means and uncertainty resampling."
                : "The final six-day period is visibly partial and excluded from complete-period means and uncertainty resampling."}
            </p>
          </section>

          {aggregate.sampleStatus !== "sufficient" ? (
            <section className="panel-section"><div className="warning-box">{sparseMessage(aggregate.sampleStatus)}</div></section>
          ) : evaluation.replay ? (
            <>
              {tab === "scenario" && baselineEvaluation?.replay ? (
                <section className="panel-section field-group" aria-labelledby="baseline-comparison-heading">
                  <div>
                    <div className="eyebrow">Assumption-based workload scenario</div>
                    <h3 className="section-title" id="baseline-comparison-heading">Change from historical replay</h3>
                  </div>
                  <div className="comparison-wrap">
                    <table className="data-table">
                      <thead><tr><th>Result</th><th>Historical replay</th><th>Assumption scenario</th><th>Change</th></tr></thead>
                      <tbody>
                        <tr>
                          <th scope="row">Mean complete-period arrivals</th>
                          <td>{formatExpected(baselineEvaluation.meanFullPeriodArrivals)}</td>
                          <td>{formatExpected(evaluation.meanFullPeriodArrivals)}</td>
                          <td>{formatSigned(evaluation.meanFullPeriodArrivals - baselineEvaluation.meanFullPeriodArrivals)}</td>
                        </tr>
                        <tr>
                          <th scope="row">Expected cohort open at age 30</th>
                          <td>{formatExpected(baselineEvaluation.cohortOpenAt30Days)}</td>
                          <td>{formatExpected(evaluation.cohortOpenAt30Days)}</td>
                          <td>{formatSigned((evaluation.cohortOpenAt30Days ?? 0) - (baselineEvaluation.cohortOpenAt30Days ?? 0))}</td>
                        </tr>
                        <tr>
                          <th scope="row">Expected cohort open at age 180</th>
                          <td>{formatExpected(baselineEvaluation.cohortOpenAt180Days)}</td>
                          <td>{formatExpected(evaluation.cohortOpenAt180Days)}</td>
                          <td>{formatSigned((evaluation.cohortOpenAt180Days ?? 0) - (baselineEvaluation.cohortOpenAt180Days ?? 0))}</td>
                        </tr>
                        <tr>
                          <th scope="row">Peak expected open balance</th>
                          <td>{formatExpected(Math.max(...baselineEvaluation.replay.map((period) => period.expectedOpenBalance)))}</td>
                          <td>{formatExpected(Math.max(...evaluation.replay.map((period) => period.expectedOpenBalance)))}</td>
                          <td>{formatSigned(Math.max(...evaluation.replay.map((period) => period.expectedOpenBalance)) - Math.max(...baselineEvaluation.replay.map((period) => period.expectedOpenBalance)))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <details className="disclosure">
                    <summary>Period and age-composition comparison</summary>
                    <div className="comparison-wrap">
                      <table className="data-table">
                        <thead><tr><th>Period</th><th>Arrival Δ</th><th>Expected recorded-closure Δ</th><th>Open balance Δ</th><th>Net open-workload Δ</th><th>0–30 Δ</th><th>31–180 Δ</th><th>181+ Δ</th></tr></thead>
                        <tbody>{evaluation.replay.map((period, index) => {
                          const baseline = baselineEvaluation.replay?.[index];
                          if (!baseline) return null;
                          const middle = period.openByAge["31_60"] + period.openByAge["61_90"] + period.openByAge["91_180"];
                          const baselineMiddle = baseline.openByAge["31_60"] + baseline.openByAge["61_90"] + baseline.openByAge["91_180"];
                          const older = period.openByAge["181_360"] + period.openByAge["361_plus"];
                          const baselineOlder = baseline.openByAge["181_360"] + baseline.openByAge["361_plus"];
                          return <tr key={period.periodIndex}>
                            <td>P{period.periodIndex + 1}</td>
                            <td>{formatSigned(period.newRequests - baseline.newRequests)}</td>
                            <td>{formatSigned(period.expectedRecordedClosures - baseline.expectedRecordedClosures)}</td>
                            <td>{formatSigned(period.expectedOpenBalance - baseline.expectedOpenBalance)}</td>
                            <td>{formatSigned(period.netOpenChange - baseline.netOpenChange)}</td>
                            <td>{formatSigned(period.openByAge["0_30"] - baseline.openByAge["0_30"])}</td>
                            <td>{formatSigned(middle - baselineMiddle)}</td>
                            <td>{formatSigned(older - baselineOlder)}</td>
                          </tr>;
                        })}</tbody>
                      </table>
                    </div>
                  </details>
                </section>
              ) : null}
              <section className="panel-section field-group">
                {tab === "scenario" ? <div className="eyebrow">Assumption-based workload scenario</div> : null}
                <ArrivalsClosuresChart replay={evaluation.replay} arrivalPeriodCount={workload.periods.length} />
                <OpenBalanceChart replay={evaluation.replay} />
                <OpenByAgeChart replay={evaluation.replay} />
                <details className="disclosure">
                  <summary>Replay period details</summary>
                  <div className="comparison-wrap">
                    <table className="data-table">
                      <thead><tr><th>Period</th><th>New requests</th><th>Expected recorded closures</th><th>Expected open balance</th><th>Net open-workload change</th></tr></thead>
                      <tbody>{evaluation.replay.map((period) => (
                        <tr key={period.periodIndex}>
                          <td>
                            P{period.periodIndex + 1}
                            {period.periodIndex < workload.periods.length
                              ? ` · ${formatDateRange(workload.periods[period.periodIndex].start, workload.periods[period.periodIndex].observedEnd)}`
                              : " · runoff"}
                            {period.periodIndex === 12 ? " · partial" : ""}
                          </td>
                          <td>{formatExpected(period.newRequests)}</td>
                          <td>{formatExpected(period.expectedRecordedClosures)}</td>
                          <td>{formatExpected(period.expectedOpenBalance)}</td>
                          <td>{formatSigned(period.netOpenChange)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </details>
              </section>

              <section className="panel-section field-group" aria-labelledby="request-age-heading">
                <div className="section-heading-row">
                  <div>
                    <div className="eyebrow">Request-age checkpoint</div>
                    <h3 className="section-title" id="request-age-heading">Evaluate a 30-day arrival cohort after</h3>
                  </div>
                  <div className="segmented">
                    {[30, 180].map((age) => <button key={age} type="button" aria-pressed={requestAgeDays === age} onClick={() => onRequestAgeChange(age as 30 | 180)}>Age {age}</button>)}
                  </div>
                </div>
                {tab === "scenario" ? <div className="eyebrow">Assumption-based workload scenario</div> : null}
                {uncertainty.status === "loading" ? <div className="loading-line" /> : uncertainty.error ? <div className="error-state">{uncertainty.error}</div> : uncertainty.result ? (
                  <>
                    <div className="metric-primary">{formatExpected(uncertainty.result.openMedian)}</div>
                    <div className="metric-secondary">expected open at age {requestAgeDays}</div>
                    <div className="metric-grid">
                      <div className="metric-cell"><span className="label">Median recorded closure</span><span className="value">{formatPercent(uncertainty.result.closureMedianPct)}</span></div>
                    </div>
                    <div className="status-box">
                      <strong>{formatExpected(uncertainty.result.open80[0])}–{formatExpected(uncertainty.result.open80[1])}</strong>
                      <div className="helper-text">80% uncertainty interval · 1,000 draws</div>
                    </div>
                    {tab === "scenario" && baselineUncertainty.result ? (
                      <details className="disclosure">
                        <summary>Historical and assumption uncertainty</summary>
                        <div className="comparison-wrap">
                          <table className="data-table">
                            <thead><tr><th>Uncertainty result</th><th>Historical replay</th><th>Assumption scenario</th></tr></thead>
                            <tbody>
                              <tr><th scope="row">Median open</th><td>{formatExpected(baselineUncertainty.result.openMedian)}</td><td>{formatExpected(uncertainty.result.openMedian)}</td></tr>
                              <tr><th scope="row">80% open interval</th><td>{formatExpected(baselineUncertainty.result.open80[0])}–{formatExpected(baselineUncertainty.result.open80[1])}</td><td>{formatExpected(uncertainty.result.open80[0])}–{formatExpected(uncertainty.result.open80[1])}</td></tr>
                              <tr><th scope="row">95% open interval</th><td>{formatExpected(baselineUncertainty.result.open95[0])}–{formatExpected(baselineUncertainty.result.open95[1])}</td><td>{formatExpected(uncertainty.result.open95[0])}–{formatExpected(uncertainty.result.open95[1])}</td></tr>
                              <tr><th scope="row">Median recorded closure</th><td>{formatPercent(baselineUncertainty.result.closureMedianPct)}</td><td>{formatPercent(uncertainty.result.closureMedianPct)}</td></tr>
                              <tr><th scope="row">80% closure interval</th><td>{formatPercent(baselineUncertainty.result.closure80Pct[0])}–{formatPercent(baselineUncertainty.result.closure80Pct[1])}</td><td>{formatPercent(uncertainty.result.closure80Pct[0])}–{formatPercent(uncertainty.result.closure80Pct[1])}</td></tr>
                              <tr><th scope="row">95% closure interval</th><td>{formatPercent(baselineUncertainty.result.closure95Pct[0])}–{formatPercent(baselineUncertainty.result.closure95Pct[1])}</td><td>{formatPercent(uncertainty.result.closure95Pct[0])}–{formatPercent(uncertainty.result.closure95Pct[1])}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : (
                      <details className="disclosure">
                        <summary>95% interval and recorded-closure uncertainty</summary>
                        <dl className="metric-grid">
                          <div className="metric-cell"><dt className="label">95% open interval</dt><dd className="value">{formatExpected(uncertainty.result.open95[0])}–{formatExpected(uncertainty.result.open95[1])}</dd></div>
                          <div className="metric-cell"><dt className="label">Median recorded closure</dt><dd className="value">{formatPercent(uncertainty.result.closureMedianPct)}</dd></div>
                          <div className="metric-cell"><dt className="label">80% closure interval</dt><dd className="value">{formatPercent(uncertainty.result.closure80Pct[0])}–{formatPercent(uncertainty.result.closure80Pct[1])}</dd></div>
                          <div className="metric-cell"><dt className="label">95% closure interval</dt><dd className="value">{formatPercent(uncertainty.result.closure95Pct[0])}–{formatPercent(uncertainty.result.closure95Pct[1])}</dd></div>
                        </dl>
                      </details>
                    )}
                  </>
                ) : null}
                <p className="helper-text">This evaluates a 30-day arrival cohort after reaching request age {requestAgeDays}. It is not a projection horizon.</p>
                <p className="helper-text">This interval reflects variation across the twelve complete 2016 arrival periods and finite-sample uncertainty in recorded closure. It does not include all possible future structural change.</p>
              </section>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
