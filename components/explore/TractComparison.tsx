"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  DomainKey,
  TractDetails,
  TractFeature,
  TractWorkloadRecord,
  Workload,
  WorkloadInterval,
} from "@/lib/artifacts";
import { DOMAIN_CONFIG } from "@/lib/domain";
import {
  formatCurrency,
  formatDecimal,
  formatExpected,
  formatInteger,
  formatPercent,
  formatSigned,
  formatTractName,
} from "@/lib/formatting";
import {
  MAP_METRICS,
  type NeighborhoodMetricKey,
} from "@/lib/map/metrics";
import type {
  NeighborhoodMetricSummary,
  NeighborhoodRadius,
} from "@/lib/spatial";

import styles from "./TractComparison.module.css";
import {
  buildTractPresentation,
  getTractUncertaintyPresentation,
  type ComplaintDomainPresentation,
  type RecordedResponsePresentation,
  type TractPresentation,
} from "./tractPresentation";

type TractDetailRecord = TractDetails["tracts"][string];

export interface TractNeighborhoodContext {
  geoid: string;
  metric: NeighborhoodMetricKey;
  radius: NeighborhoodRadius;
  isIsland: boolean;
  summary: NeighborhoodMetricSummary | null;
}

export interface TractComparisonProps {
  features: readonly TractFeature[];
  selectedGeoids: readonly string[];
  activeGeoid: string | null;
  domain: DomainKey;
  tractDetails: TractDetails | null;
  loading: boolean;
  detailError?: Error | null;
  onLoad: () => void | Promise<unknown>;
  workload: Workload | null;
  workloadLoading: boolean;
  workloadError?: Error | null;
  onLoadWorkload: () => void | Promise<unknown>;
  onActivate: (geoid: string) => void;
  onRemove?: (geoid: string) => void;
  neighborhoodSummary?: TractNeighborhoodContext | null;
}

function rate(value: number | null): string {
  return value === null ? "Not available" : `${formatDecimal(value)} per 1,000`;
}

function residentRate(value: number | null): string {
  return value === null ? "Not available" : `${rate(value)} residents`;
}

function days(value: number | null): string {
  return value === null ? "Not available" : `${formatDecimal(value)} days`;
}

function interval(
  values: readonly [number, number],
  formatter: (value: number) => string,
): string {
  return `${formatter(values[0])}–${formatter(values[1])}`;
}

function getWorkloadRecord(
  workload: Workload | null,
  geoid: string,
  domain: DomainKey,
): TractWorkloadRecord | undefined {
  return workload?.tracts[geoid]?.[domain];
}

function TractIdentity({
  presentation,
}: {
  presentation: TractPresentation;
}) {
  const { properties } = presentation.feature;
  return (
    <header className={styles.identity}>
      <div className={styles.eyebrow}>Selected tract</div>
      <h2 className={styles.title}>
        {formatTractName(properties.tractName, properties.borough)}
      </h2>
      <div className={styles.metadata}>
        <span>GEOID {properties.geoid}</span>
        <span>Population {formatInteger(properties.population)}</span>
        <span>
          Median household income {formatCurrency(properties.medianHouseholdIncome)}
        </span>
      </div>
    </header>
  );
}

function ComplaintBreakdown({
  domains,
}: {
  domains: readonly ComplaintDomainPresentation[];
}) {
  const maximum = Math.max(0, ...domains.map((item) => item.count));
  return (
    <details className={styles.disclosure}>
      <summary>Five-domain breakdown</summary>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th scope="col">Domain</th>
            <th scope="col">Mapped complaints</th>
            <th scope="col">Per 1,000</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((item) => {
            const magnitude = maximum === 0 ? 0 : (100 * item.count) / maximum;
            return (
              <tr key={item.domain}>
                <td>{item.label}</td>
                <td className={styles.magnitudeTrack}>
                  <span
                    aria-hidden="true"
                    className={styles.magnitudeBar}
                    style={{ "--magnitude": `${magnitude}%` } as CSSProperties}
                  />
                  <span className={styles.magnitudeValue}>
                    {formatInteger(item.count)}
                  </span>
                </td>
                <td>{rate(item.ratePer1000)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function ComplaintActivity({
  presentation,
}: {
  presentation: TractPresentation;
}) {
  return (
    <section className={styles.section} aria-labelledby="complaint-activity-heading">
      <div className={styles.eyebrow}>Complaint activity</div>
      <h3 id="complaint-activity-heading" className={styles.sectionTitle}>
        {presentation.activeDomain.label}
      </h3>
      <div className={styles.primaryMetric}>
        {formatInteger(presentation.activeDomain.count)}
      </div>
      <div className={styles.primaryLabel}>mapped complaints</div>
      <div className={styles.secondaryMetric}>
        {residentRate(presentation.activeDomain.ratePer1000)}
      </div>
      <ComplaintBreakdown domains={presentation.complaintDomains} />
    </section>
  );
}

function RankedDetail({
  heading,
  items,
  noun,
}: {
  heading: string;
  items: ReadonlyArray<{
    label: string;
    count: number;
    sharePct: number;
  }>;
  noun: string;
}) {
  return (
    <div>
      <h4 className={styles.subheading}>{heading}</h4>
      {items.length > 0 ? (
        <ol className={styles.rankedList}>
          {items.map((item) => (
            <li className={styles.rankedItem} key={item.label}>
              <span>{item.label}</span>
              <span className={styles.rankedValue}>
                {formatInteger(item.count)} · {formatPercent(item.sharePct)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.note}>No {noun} are present for this tract-domain.</p>
      )}
    </div>
  );
}

function ComplaintComposition({
  detail,
  domain,
  loading,
  error,
  onRetry,
}: {
  detail: TractDetailRecord | undefined;
  domain: DomainKey;
  loading: boolean;
  error: Error | null;
  onRetry: () => void | Promise<unknown>;
}) {
  const complaintTypes = detail?.topComplaintTypesByDomain[domain] ?? [];
  const agencies = detail?.topAgenciesByDomain[domain] ?? [];

  return (
    <section className={styles.section} aria-labelledby="composition-heading">
      <div className={styles.eyebrow}>Complaint-type detail</div>
      <h3 id="composition-heading" className={styles.sectionTitle}>
        {DOMAIN_CONFIG[domain].label}
      </h3>
      {loading && !detail ? (
        <p className={styles.note} role="status">
          Loading complaint-type detail…
        </p>
      ) : !detail && error ? (
        <div className={styles.detailError} role="alert">
          <strong>Complaint-type detail could not be loaded.</strong>
          <p>{error.message}</p>
          <button
            className={styles.retryButton}
            type="button"
            onClick={() => void onRetry()}
          >
            Retry detail
          </button>
        </div>
      ) : !detail ? (
        <p className={styles.note}>Complaint-type detail is unavailable.</p>
      ) : (
        <div className={styles.compositionColumns}>
          <RankedDetail
            heading="Top complaint types"
            items={complaintTypes.map((item) => ({
              label: item.complaintType,
              count: item.count,
              sharePct: item.sharePct,
            }))}
            noun="complaint types"
          />
          <RankedDetail
            heading="Top agencies"
            items={agencies.map((item) => ({
              label: item.agency,
              count: item.count,
              sharePct: item.sharePct,
            }))}
            noun="agencies"
          />
        </div>
      )}
      <p className={styles.note} style={{ marginTop: 10 }}>
        Complaint type describes the administrative record; it does not establish
        cause.
      </p>
    </section>
  );
}

function SparseResponse({ response }: { response: RecordedResponsePresentation }) {
  return (
    <div className={styles.status}>
      <strong className={styles.statusTitle}>{response.title}</strong>
      {response.status === "insufficient_sample" ? (
        <p>{formatInteger(response.knownTimingOutcomes30d)} known timing outcomes</p>
      ) : null}
      <p>{response.detail}</p>
    </div>
  );
}

function ResponseDetail({
  response,
  workloadRecord,
  workloadLoading,
  workloadError,
  onEvidenceOpen,
}: {
  response: RecordedResponsePresentation;
  workloadRecord: TractWorkloadRecord | undefined;
  workloadLoading: boolean;
  workloadError: Error | null;
  onEvidenceOpen: () => void;
}) {
  if (response.metrics === null) return <SparseResponse response={response} />;
  const metrics = response.metrics;
  return (
    <>
      <div className={styles.responseLead}>
        <div>
          <span className={styles.responseValue}>
            {formatPercent(metrics.recordedClosureWithin30dPct)}
          </span>
          <span className={styles.responseLabel}>
            recorded closure within 30 days
          </span>
        </div>
        <div>
          <span className={styles.responseValue}>
            {days(metrics.medianRecordedDaysToClose)}
          </span>
          <span className={styles.responseLabel}>
            median recorded closure time
          </span>
        </div>
      </div>
      <details
        className={styles.disclosure}
        onToggle={(event) => {
          if (event.currentTarget.open) onEvidenceOpen();
        }}
      >
        <summary>Response evidence and age checkpoints</summary>
        <div className={styles.metricGrid}>
          <Metric label="Known timing outcomes · 30d">
            {formatInteger(response.knownTimingOutcomes30d)}
          </Metric>
          <Metric label="Known timing outcomes · 180d">
            {formatInteger(response.knownTimingOutcomes180d)}
          </Metric>
          <Metric label="Valid recorded closures">
            {formatInteger(response.validRecordedClosures)}
          </Metric>
          <Metric label="Recorded closure · 180d">
            {formatPercent(metrics.recordedClosureWithin180dPct)}
          </Metric>
          <Metric label="Not recorded closed · age 30">
            {formatInteger(metrics.notRecordedClosedWithin30dCount)}
          </Metric>
          <Metric label="Not recorded closed · age 180">
            {formatInteger(metrics.notRecordedClosedWithin180dCount)}
          </Metric>
          <Metric label="Not recorded closed · age 30 per 1K">
            {rate(metrics.notRecordedClosedWithin30dPer1000)}
          </Metric>
          <Metric label="Not recorded closed · age 180 per 1K">
            {rate(metrics.notRecordedClosedWithin180dPer1000)}
          </Metric>
          <Metric label="Expected cohort open · age 30">
            {formatExpected(metrics.expectedCohortOpenAt30d)}
          </Metric>
          <Metric label="Expected cohort open · age 180">
            {formatExpected(metrics.expectedCohortOpenAt180d)}
          </Metric>
        </div>
        <p className={styles.note} style={{ marginTop: 12 }}>
          Recorded administrative closure is not evidence of physical resolution.
        </p>
        <UncertaintyDetail
          record={workloadRecord}
          loading={workloadLoading}
          error={workloadError}
          onRetry={onEvidenceOpen}
        />
      </details>
    </>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.metricCell}>
      <span className={styles.cellLabel}>{label}</span>
      <span className={styles.cellValue}>{children}</span>
    </div>
  );
}

function IntervalTable({
  age,
  value,
}: {
  age: 30 | 180;
  value: WorkloadInterval;
}) {
  return (
    <div className={styles.intervalBlock}>
      <h4 className={styles.subheading}>Request age {age} days</h4>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Median</th>
            <th scope="col">80% interval</th>
            <th scope="col">95% interval</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Expected cohort open</th>
            <td>{formatExpected(value.openMedian)}</td>
            <td>{interval(value.open80, formatExpected)}</td>
            <td>{interval(value.open95, formatExpected)}</td>
          </tr>
          <tr>
            <th scope="row">Recorded closure</th>
            <td>{formatPercent(value.closureMedianPct)}</td>
            <td>{interval(value.closure80Pct, formatPercent)}</td>
            <td>{interval(value.closure95Pct, formatPercent)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function UncertaintyDetail({
  record,
  loading,
  error,
  onRetry,
}: {
  record: TractWorkloadRecord | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (!record) {
    if (error && !loading) {
      return (
        <div className={styles.detailError} role="alert">
          <strong>Tract uncertainty could not be loaded.</strong>
          <p>{error.message}</p>
          <button
            className={styles.retryButton}
            type="button"
            onClick={onRetry}
          >
            Retry uncertainty
          </button>
        </div>
      );
    }
    return (
      <div className={styles.uncertaintyStatus} role="status">
        {loading
          ? "Loading exported tract uncertainty…"
          : "Exported tract uncertainty is unavailable."}
      </div>
    );
  }
  const uncertainty = getTractUncertaintyPresentation(record);
  if (uncertainty.status !== "sufficient") {
    return (
      <div className={styles.uncertaintyStatus}>
        {uncertainty.title}. Tract-specific uncertainty is not shown.
      </div>
    );
  }
  return (
    <div className={styles.uncertainty}>
      <h4 className={styles.subheading}>Tract-specific uncertainty</h4>
      <p className={styles.note}>
        Exported intervals from 1,000 deterministic uncertainty draws.
      </p>
      <IntervalTable age={30} value={uncertainty.age30} />
      <IntervalTable age={180} value={uncertainty.age180} />
    </div>
  );
}

function RecordedResponse({
  response,
  workloadRecord,
  workloadLoading,
  workloadError,
  onEvidenceOpen,
}: {
  response: RecordedResponsePresentation;
  workloadRecord: TractWorkloadRecord | undefined;
  workloadLoading: boolean;
  workloadError: Error | null;
  onEvidenceOpen: () => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="response-heading">
      <div className={styles.eyebrow}>Recorded administrative response</div>
      <h3 id="response-heading" className={styles.sectionTitle}>
        Request-age evidence
      </h3>
      <ResponseDetail
        response={response}
        workloadRecord={workloadRecord}
        workloadLoading={workloadLoading}
        workloadError={workloadError}
        onEvidenceOpen={onEvidenceOpen}
      />
    </section>
  );
}

function formatNeighborhoodValue(
  value: number,
  metric: NeighborhoodMetricKey,
): string {
  switch (MAP_METRICS[metric].format) {
    case "count":
      return Number.isInteger(value) ? formatInteger(value) : formatExpected(value);
    case "percent":
      return formatPercent(value);
    case "rate":
      return rate(value);
    case "days":
      return days(value);
    case "currency":
      return formatCurrency(value);
    case "boolean":
      return value ? "Eligible" : "Not eligible";
  }
}

function NeighborhoodContext({
  context,
}: {
  context: TractNeighborhoodContext;
}) {
  const summary = context.summary;
  return (
    <section className={styles.section} aria-labelledby="neighborhood-context-heading">
      <div className={styles.eyebrow}>Neighborhood context</div>
      <h3 id="neighborhood-context-heading" className={styles.sectionTitle}>
        {MAP_METRICS[context.metric].shortLabel} · radius {context.radius}
      </h3>
      {context.isIsland ? (
        <div className={styles.status}>
          No contiguous tract neighbors are available.
        </div>
      ) : summary === null ? (
        <div className={styles.status}>
          The active tract value is unavailable for this neighborhood metric.
        </div>
      ) : (
        <div className={styles.metricGrid}>
          <Metric label="Active tract">
            {formatNeighborhoodValue(summary.activeValue, context.metric)}
          </Metric>
          <Metric label="Neighborhood median">
            {formatNeighborhoodValue(summary.neighborhoodMedian, context.metric)}
          </Metric>
          <Metric label="Absolute difference">
            {formatSigned(summary.absoluteDifference)}
          </Metric>
          <Metric label="Relative difference">
            {summary.relativeDifferencePct === null
              ? "Not available"
              : formatSigned(summary.relativeDifferencePct, "%")}
          </Metric>
          <Metric label="Active rank">
            {summary.activeRank} of {summary.availableTractCount}
          </Metric>
          <Metric label="Included tracts">
            {summary.includedTractCount}
          </Metric>
        </div>
      )}
    </section>
  );
}

function WarningsAndMethodology({
  presentation,
}: {
  presentation: TractPresentation;
}) {
  return (
    <section className={styles.section} aria-labelledby="warnings-heading">
      <div className={styles.eyebrow}>Warnings and methodology</div>
      <h3 id="warnings-heading" className={styles.sectionTitle}>
        Reading this tract
      </h3>
      {presentation.warnings.length > 0 ? (
        <ul className={styles.warningList}>
          {presentation.warnings.map((warning) => (
            <li className={styles.warning} key={warning}>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={styles.note} style={{ marginTop: 10 }}>
        Complaint counts are mapped requests; rates use the tract population.
        Recorded administrative closure describes the source-system record and does
        not establish service outcome or cause.
      </p>
    </section>
  );
}

function DetailDrawer({
  presentation,
  detail,
  domain,
  loading,
  detailError,
  onRetryDetail,
  neighborhoodSummary,
  workloadRecord,
  workloadLoading,
  workloadError,
  onEvidenceOpen,
}: {
  presentation: TractPresentation;
  detail: TractDetailRecord | undefined;
  domain: DomainKey;
  loading: boolean;
  detailError: Error | null;
  onRetryDetail: () => void | Promise<unknown>;
  neighborhoodSummary: TractNeighborhoodContext | null;
  workloadRecord: TractWorkloadRecord | undefined;
  workloadLoading: boolean;
  workloadError: Error | null;
  onEvidenceOpen: () => void;
}) {
  return (
    <article className={styles.drawer} aria-label="Active tract detail">
      <TractIdentity presentation={presentation} />
      <ComplaintActivity presentation={presentation} />
      <ComplaintComposition
        detail={detail}
        domain={domain}
        loading={loading}
        error={detailError}
        onRetry={onRetryDetail}
      />
      <RecordedResponse
        response={presentation.response}
        workloadRecord={workloadRecord}
        workloadLoading={workloadLoading}
        workloadError={workloadError}
        onEvidenceOpen={onEvidenceOpen}
      />
      {neighborhoodSummary ? (
        <NeighborhoodContext context={neighborhoodSummary} />
      ) : null}
      <WarningsAndMethodology presentation={presentation} />
    </article>
  );
}

function HeaderCell({
  presentation,
  active,
  onActivate,
  onRemove,
}: {
  presentation: TractPresentation;
  active: boolean;
  onActivate: (geoid: string) => void;
  onRemove?: (geoid: string) => void;
}) {
  const { properties } = presentation.feature;
  return (
    <th className={active ? styles.activeColumn : undefined} scope="col">
      <button
        className={styles.headerButton}
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={() => onActivate(properties.geoid)}
      >
        <strong>{formatTractName(properties.tractName, properties.borough)}</strong>
        <span className={styles.headerMetadata}>
          GEOID {properties.geoid}
          <br />
          Population {formatInteger(properties.population)}
          <br />
          Median income {formatCurrency(properties.medianHouseholdIncome)}
        </span>
      </button>
      {onRemove ? (
        <button
          className={styles.removeButton}
          type="button"
          onClick={() => onRemove(properties.geoid)}
          aria-label={`Remove ${formatTractName(properties.tractName, properties.borough)}`}
        >
          Remove
        </button>
      ) : null}
    </th>
  );
}

function Cell({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return <td className={active ? styles.activeColumn : undefined}>{children}</td>;
}

function GroupRow({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <tr className={styles.groupRow}>
      <th colSpan={count + 1} scope="rowgroup">
        {label}
      </th>
    </tr>
  );
}

function ComplaintTypesCompact({
  detail,
  domain,
  loading,
  error,
  onRetry,
}: {
  detail: TractDetailRecord | undefined;
  domain: DomainKey;
  loading: boolean;
  error: Error | null;
  onRetry: () => void | Promise<unknown>;
}) {
  if (!detail) {
    if (loading) return <span className={styles.unavailable}>Loading…</span>;
    if (error) {
      return (
        <div className={styles.comparisonStatus} role="alert">
          <strong>Detail fetch failed</strong>
          <span className={styles.unavailable}>{error.message}</span>
          <button
            className={styles.retryButton}
            type="button"
            onClick={() => void onRetry()}
          >
            Retry detail
          </button>
        </div>
      );
    }
    return <span className={styles.unavailable}>Unavailable</span>;
  }
  const types = detail.topComplaintTypesByDomain[domain].slice(0, 5);
  const agencies = detail.topAgenciesByDomain[domain].slice(0, 3);
  return (
    <div className={styles.comparisonStatus}>
      <strong>Top complaint types</strong>
      {types.length > 0 ? (
        <ol className={styles.compactList}>
          {types.map((item) => (
            <li key={item.complaintType}>
              <span>{item.complaintType}</span>
              <span>
                {formatInteger(item.count)} · {formatPercent(item.sharePct)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <span className={styles.unavailable}>No complaint types</span>
      )}
      <strong style={{ marginTop: 5 }}>Top agencies</strong>
      {agencies.length > 0 ? (
        <ol className={styles.compactList}>
          {agencies.map((item) => (
            <li key={item.agency}>
              <span>{item.agency}</span>
              <span>{formatInteger(item.count)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <span className={styles.unavailable}>No agencies</span>
      )}
    </div>
  );
}

function SparseCell({
  response,
  includeEvidence = false,
}: {
  response: RecordedResponsePresentation;
  includeEvidence?: boolean;
}) {
  return (
    <span className={styles.unavailable}>
      {response.title}
      {includeEvidence && response.status === "insufficient_sample"
        ? ` · ${formatInteger(response.knownTimingOutcomes30d)} known timing outcomes`
        : ""}
    </span>
  );
}

function ResponseCell({
  response,
  metric,
}: {
  response: RecordedResponsePresentation;
  metric:
    | "summary"
    | "closure180"
    | "evidence"
    | "notClosed30"
    | "notClosed180"
    | "open30"
    | "open180";
}) {
  if (response.metrics === null) {
    return <SparseCell response={response} includeEvidence={metric === "summary"} />;
  }
  switch (metric) {
    case "summary":
      return (
        <span className={styles.comparisonStatus}>
          <strong>
            {formatPercent(response.metrics.recordedClosureWithin30dPct)} within
            30 days
          </strong>
          <span>{days(response.metrics.medianRecordedDaysToClose)} median</span>
        </span>
      );
    case "closure180":
      return formatPercent(response.metrics.recordedClosureWithin180dPct);
    case "evidence":
      return (
        <span>
          {formatInteger(response.knownTimingOutcomes30d)} known timing outcomes
          <br />
          {formatInteger(response.validRecordedClosures)} valid recorded closures
        </span>
      );
    case "notClosed30":
      return (
        <span>
          {formatInteger(response.metrics.notRecordedClosedWithin30dCount)}
          <br />
          <span className={styles.unavailable}>
            {rate(response.metrics.notRecordedClosedWithin30dPer1000)}
          </span>
        </span>
      );
    case "notClosed180":
      return (
        <span>
          {formatInteger(response.metrics.notRecordedClosedWithin180dCount)}
          <br />
          <span className={styles.unavailable}>
            {rate(response.metrics.notRecordedClosedWithin180dPer1000)}
          </span>
        </span>
      );
    case "open30":
      return formatExpected(response.metrics.expectedCohortOpenAt30d);
    case "open180":
      return formatExpected(response.metrics.expectedCohortOpenAt180d);
  }
}

function CompactInterval({
  age,
  value,
}: {
  age: 30 | 180;
  value: WorkloadInterval;
}) {
  return (
    <div className={styles.compactInterval}>
      <strong>Age {age}</strong>
      <span>
        Expected open {formatExpected(value.openMedian)} median
        <br />
        80% {interval(value.open80, formatExpected)} · 95%{" "}
        {interval(value.open95, formatExpected)}
      </span>
      <span>
        Recorded closure {formatPercent(value.closureMedianPct)} median
        <br />
        80% {interval(value.closure80Pct, formatPercent)} · 95%{" "}
        {interval(value.closure95Pct, formatPercent)}
      </span>
    </div>
  );
}

function UncertaintyCell({
  response,
  record,
  loading,
  error,
  onRetry,
}: {
  response: RecordedResponsePresentation;
  record: TractWorkloadRecord | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void | Promise<unknown>;
}) {
  if (response.metrics === null) return <SparseCell response={response} />;
  if (!record) {
    if (error && !loading) {
      return (
        <span className={styles.comparisonStatus} role="alert">
          <strong>Uncertainty fetch failed</strong>
          <span className={styles.unavailable}>{error.message}</span>
          <button
            className={styles.retryButton}
            type="button"
            onClick={() => void onRetry()}
          >
            Retry uncertainty
          </button>
        </span>
      );
    }
    return (
      <span className={styles.unavailable}>
        {loading ? "Loading exported uncertainty…" : "Uncertainty unavailable"}
      </span>
    );
  }
  const uncertainty = getTractUncertaintyPresentation(record);
  if (uncertainty.status !== "sufficient") {
    return <span className={styles.unavailable}>{uncertainty.title}</span>;
  }
  return (
    <div className={styles.compactIntervals}>
      <CompactInterval age={30} value={uncertainty.age30} />
      <CompactInterval age={180} value={uncertainty.age180} />
    </div>
  );
}

function ComparisonNeighborhoodCell({
  context,
  geoid,
}: {
  context: TractNeighborhoodContext;
  geoid: string;
}) {
  if (geoid !== context.geoid) {
    return <span className={styles.unavailable}>Active tract only</span>;
  }
  if (context.isIsland) return <>No contiguous tract neighbors</>;
  if (!context.summary) return <>Active value unavailable</>;
  return (
    <span>
      {formatNeighborhoodValue(context.summary.activeValue, context.metric)} active
      <br />
      {formatNeighborhoodValue(
        context.summary.neighborhoodMedian,
        context.metric,
      )}{" "}
      median
      <br />
      <span className={styles.unavailable}>
        Rank {context.summary.activeRank} of {context.summary.availableTractCount} ·
        radius {context.radius}
      </span>
    </span>
  );
}

function ComparisonGrid({
  presentations,
  activeGeoid,
  domain,
  details,
  loading,
  detailError,
  onRetryDetail,
  workload,
  workloadLoading,
  workloadError,
  onRetryWorkload,
  onActivate,
  onRemove,
  neighborhoodSummary,
}: {
  presentations: readonly TractPresentation[];
  activeGeoid: string | null;
  domain: DomainKey;
  details: TractDetails | null;
  loading: boolean;
  detailError: Error | null;
  onRetryDetail: () => void | Promise<unknown>;
  workload: Workload | null;
  workloadLoading: boolean;
  workloadError: Error | null;
  onRetryWorkload: () => void | Promise<unknown>;
  onActivate: (geoid: string) => void;
  onRemove?: (geoid: string) => void;
  neighborhoodSummary: TractNeighborhoodContext | null;
}) {
  const active = (presentation: TractPresentation) =>
    presentation.feature.properties.geoid === activeGeoid;
  const cells = (render: (presentation: TractPresentation) => ReactNode) =>
    presentations.map((presentation) => (
      <Cell key={presentation.feature.properties.geoid} active={active(presentation)}>
        {render(presentation)}
      </Cell>
    ));

  return (
    <div className={styles.comparisonWrap}>
      <table
        className={styles.comparisonTable}
        data-count={presentations.length}
        aria-label={`${presentations.length}-tract comparison`}
      >
        <thead>
          <tr>
            <th className={styles.metricHeader} scope="col">
              Metric
            </th>
            {presentations.map((presentation) => (
              <HeaderCell
                key={presentation.feature.properties.geoid}
                presentation={presentation}
                active={active(presentation)}
                onActivate={onActivate}
                onRemove={onRemove}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          <GroupRow label="Complaint activity" count={presentations.length} />
          <tr>
            <th className={styles.metricLabel} scope="row">
              {DOMAIN_CONFIG[domain].label}
            </th>
            {cells((presentation) => (
              <>
                <span className={styles.comparisonCount}>
                  {formatInteger(presentation.activeDomain.count)}
                </span>
                <span className={styles.comparisonRate}>
                  mapped complaints
                  <br />
                  {rate(presentation.activeDomain.ratePer1000)}
                </span>
              </>
            ))}
          </tr>
          <tr>
            <th className={styles.metricLabel} scope="row">
              Five-domain breakdown
            </th>
            {cells((presentation) => (
              <details className={styles.disclosure} style={{ marginTop: 0 }}>
                <summary>Show five domains</summary>
                <ul className={styles.compactList}>
                  {presentation.complaintDomains.map((item) => (
                    <li key={item.domain}>
                      <span>{DOMAIN_CONFIG[item.domain].shortLabel}</span>
                      <span>
                        {formatInteger(item.count)} · {rate(item.ratePer1000)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </tr>
          <GroupRow label="Complaint-type detail" count={presentations.length} />
          <tr>
            <th className={styles.metricLabel} scope="row">
              Types and agencies
            </th>
            {cells((presentation) => (
              <ComplaintTypesCompact
                detail={details?.tracts[presentation.feature.properties.geoid]}
                domain={domain}
                loading={loading}
                error={detailError}
                onRetry={onRetryDetail}
              />
            ))}
          </tr>
          <GroupRow
            label="Recorded administrative response"
            count={presentations.length}
          />
          {(
            [
              ["Request-age summary", "summary"],
              ["Recorded closure · 180d", "closure180"],
              ["Response evidence", "evidence"],
              ["Not recorded closed · age 30", "notClosed30"],
              ["Not recorded closed · age 180", "notClosed180"],
              ["Expected cohort open · age 30", "open30"],
              ["Expected cohort open · age 180", "open180"],
            ] as const
          ).map(([label, metric]) => (
            <tr key={metric}>
              <th className={styles.metricLabel} scope="row">
                {label}
              </th>
              {cells((presentation) => (
                <ResponseCell response={presentation.response} metric={metric} />
              ))}
            </tr>
          ))}
          <tr>
            <th className={styles.metricLabel} scope="row">
              Tract uncertainty
            </th>
            {cells((presentation) => {
              const geoid = presentation.feature.properties.geoid;
              return (
                <UncertaintyCell
                  response={presentation.response}
                  record={getWorkloadRecord(workload, geoid, domain)}
                  loading={workloadLoading}
                  error={workloadError}
                  onRetry={onRetryWorkload}
                />
              );
            })}
          </tr>
          {neighborhoodSummary ? (
            <>
              <GroupRow label="Neighborhood context" count={presentations.length} />
              <tr>
                <th className={styles.metricLabel} scope="row">
                  {MAP_METRICS[neighborhoodSummary.metric].shortLabel}
                </th>
                {cells((presentation) => (
                  <ComparisonNeighborhoodCell
                    context={neighborhoodSummary}
                    geoid={presentation.feature.properties.geoid}
                  />
                ))}
              </tr>
            </>
          ) : null}
          <GroupRow label="Warnings and methodology" count={presentations.length} />
          <tr>
            <th className={styles.metricLabel} scope="row">
              Warnings
            </th>
            {cells((presentation) =>
              presentation.warnings.length > 0 ? (
                <ul className={styles.compactList}>
                  {presentation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <span className={styles.unavailable}>
                  No sparse-response or allocation warning
                </span>
              ),
            )}
          </tr>
          <tr>
            <th className={styles.metricLabel} scope="row">
              Methodology note
            </th>
            {cells(() => (
              <span>
                Counts are mapped requests; rates use tract population. Recorded
                administrative closure does not establish physical resolution.
              </span>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function TractComparison({
  features,
  selectedGeoids,
  activeGeoid,
  domain,
  tractDetails,
  loading,
  detailError = null,
  onLoad,
  workload,
  workloadLoading,
  workloadError = null,
  onLoadWorkload,
  onActivate,
  onRemove,
  neighborhoodSummary = null,
}: TractComparisonProps) {
  const loadRequested = useRef(false);
  const multiWorkloadLoadRequested = useRef(false);
  const presentations = useMemo(() => {
    const byGeoid = new Map(
      features.map((feature) => [feature.properties.geoid, feature] as const),
    );
    return selectedGeoids.flatMap((geoid) => {
      const feature = byGeoid.get(geoid);
      return feature ? [buildTractPresentation(feature, domain)] : [];
    });
  }, [domain, features, selectedGeoids]);

  useEffect(() => {
    if (presentations.length === 0) {
      loadRequested.current = false;
      return;
    }
    if (!tractDetails && !loading && !loadRequested.current) {
      loadRequested.current = true;
      void onLoad();
    }
  }, [loading, onLoad, presentations.length, tractDetails]);

  useEffect(() => {
    if (presentations.length < 2) {
      multiWorkloadLoadRequested.current = false;
      return;
    }
    if (
      !workload &&
      !workloadLoading &&
      !multiWorkloadLoadRequested.current
    ) {
      multiWorkloadLoadRequested.current = true;
      void onLoadWorkload();
    }
  }, [onLoadWorkload, presentations.length, workload, workloadLoading]);

  if (presentations.length === 0) {
    return (
      <div className={styles.empty}>
        Select a census tract on the map to inspect complaint activity and recorded
        administrative response.
      </div>
    );
  }

  if (presentations.length === 1) {
    const presentation = presentations[0];
    const geoid = presentation.feature.properties.geoid;
    return (
      <DetailDrawer
        presentation={presentation}
        detail={tractDetails?.tracts[geoid]}
        domain={domain}
        loading={loading}
        detailError={detailError}
        onRetryDetail={onLoad}
        workloadRecord={getWorkloadRecord(workload, geoid, domain)}
        workloadLoading={workloadLoading}
        workloadError={workloadError}
        onEvidenceOpen={() => {
          if (!workload && !workloadLoading) void onLoadWorkload();
        }}
        neighborhoodSummary={
          neighborhoodSummary?.geoid === geoid ? neighborhoodSummary : null
        }
      />
    );
  }

  return (
    <ComparisonGrid
      presentations={presentations}
      activeGeoid={activeGeoid}
      domain={domain}
      details={tractDetails}
      loading={loading}
      detailError={detailError}
      onRetryDetail={onLoad}
      workload={workload}
      workloadLoading={workloadLoading}
      workloadError={workloadError}
      onRetryWorkload={onLoadWorkload}
      onActivate={onActivate}
      onRemove={onRemove}
      neighborhoodSummary={neighborhoodSummary}
    />
  );
}
