"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  TractDetails,
  TractFeature,
  TractFeatureProperties,
} from "@/lib/artifacts";
import {
  DOMAIN_CONFIG,
  EXPLORE_DOMAIN_CONFIG,
  type ExploreDomainKey,
} from "@/lib/domain";
import {
  formatCurrency,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatTractName,
} from "@/lib/formatting";
import { PopulationDenominatorInfo } from "@/components/ui/PopulationDenominatorInfo";
import { InfoMarker } from "@/components/ui/InfoMarker";

import styles from "./TractComparison.module.css";
import {
  buildTractPresentation,
  COLLECTIVE_RESPONSE_NOTE,
  getComplaintCompositionPresentation,
  type ComplaintDomainPresentation,
  type RecordedResponsePresentation,
  type TractPresentation,
} from "./tractPresentation";

type TractDetailRecord = TractDetails["tracts"][string];

export interface TractComparisonProps {
  features: readonly TractFeature[];
  selectedGeoids: readonly string[];
  activeGeoid: string | null;
  domain: ExploreDomainKey;
  tractDetails: TractDetails | null;
  loading: boolean;
  detailError?: Error | null;
  onLoad: () => void | Promise<unknown>;
  onActivate: (geoid: string) => void;
  onRemove?: (geoid: string) => void;
  onReadPopulationMethod?: () => void;
}

function rate(value: number | null): string {
  return value === null ? "Not available" : `${formatDecimal(value)} per 1,000`;
}

function rateValue(value: number | null): string {
  return value === null ? "Not available" : formatDecimal(value);
}

function residentRate(value: number | null): string {
  return value === null ? "Not available" : `${rate(value)} residents`;
}

function days(value: number | null): string {
  return value === null ? "Not available" : `${formatDecimal(value)} days`;
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
        Census Tract {properties.tractName}
      </h2>
      <div className={styles.contextLine}>
        {properties.borough} · GEOID {properties.geoid}
      </div>
      <div className={styles.demographicFacts}>
        <div>
          <span className={styles.demographicLabel}>Population</span>
          <span className={styles.demographicValue}>
            {formatInteger(properties.population)}
          </span>
        </div>
        <div>
          <span className={styles.demographicLabel}>
            Median household income
          </span>
          <span className={styles.demographicValue}>
            {formatCurrency(properties.medianHouseholdIncome)}
          </span>
        </div>
      </div>
    </header>
  );
}

function ComplaintBreakdown({
  domains,
  onReadPopulationMethod,
}: {
  domains: readonly ComplaintDomainPresentation[];
  onReadPopulationMethod?: () => void;
}) {
  const maximum = Math.max(0, ...domains.map((item) => item.count));
  return (
    <details className={styles.disclosure}>
      <summary>All service domains</summary>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th scope="col">Domain</th>
            <th scope="col">Mapped complaints</th>
            <th scope="col">
              <span className={styles.inlineInfoLabel}>
                Per 1,000
                <PopulationDenominatorInfo
                  onReadMethod={onReadPopulationMethod}
                />
              </span>
            </th>
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
                <td>{rateValue(item.ratePer1000)}</td>
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
  onReadPopulationMethod,
}: {
  presentation: TractPresentation;
  onReadPopulationMethod?: () => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="complaint-activity-heading">
      <div className={styles.eyebrow}>
        {presentation.activeDomain.domain === "collective"
          ? "All five service domains"
          : "Active service domain"}
      </div>
      <h3 id="complaint-activity-heading" className={styles.sectionTitle}>
        {presentation.activeDomain.label}
      </h3>
      <div className={styles.primaryMetric}>
        {formatInteger(presentation.activeDomain.count)}
      </div>
      <div className={styles.primaryLabel}>mapped complaints</div>
      <div className={styles.secondaryMetric}>
        <span>{residentRate(presentation.activeDomain.ratePer1000)}</span>
        <PopulationDenominatorInfo onReadMethod={onReadPopulationMethod} />
      </div>
      <ComplaintBreakdown
        domains={presentation.complaintDomains}
        onReadPopulationMethod={onReadPopulationMethod}
      />
    </section>
  );
}

function RankedDetail({
  heading,
  items,
  noun,
  valueNoun,
  explanation,
}: {
  heading: string;
  items: ReadonlyArray<{
    label: string;
    title?: string;
    tag?: string;
    count: number;
    sharePct: number;
  }>;
  noun: string;
  valueNoun?: string;
  explanation?: ReactNode;
}) {
  return (
    <div>
      <h4 className={styles.subheading}>{heading}</h4>
      {explanation ? (
        <p className={styles.rankedExplanation}>{explanation}</p>
      ) : null}
      {items.length > 0 ? (
        <ol className={styles.rankedList}>
          {items.map((item) => (
            <li
              className={styles.rankedItem}
              key={`${item.label}-${item.tag ?? ""}`}
            >
              <span className={styles.rankedLabel}>
                <span
                  title={item.title}
                  aria-label={item.title ? `${item.label}: ${item.title}` : undefined}
                >
                  {item.label}
                </span>
                {item.tag ? (
                  <span className={styles.domainTag}>{item.tag}</span>
                ) : null}
              </span>
              <span className={styles.rankedValue}>
                {formatInteger(item.count)}{valueNoun ? ` ${valueNoun}` : ""} ·{" "}
                {formatPercent(item.sharePct)}
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
  properties,
  domain,
  loading,
  error,
  onRetry,
}: {
  detail: TractDetailRecord | undefined;
  properties: TractFeatureProperties;
  domain: ExploreDomainKey;
  loading: boolean;
  error: Error | null;
  onRetry: () => void | Promise<unknown>;
}) {
  const composition = detail
    ? getComplaintCompositionPresentation(detail, properties, domain)
    : null;

  return (
    <section className={styles.section}>
      <details className={styles.sectionDisclosure}>
        <summary>
          <span>
            <span className={styles.disclosureTitle}>
              Complaint types and agencies
            </span>
            <span className={styles.disclosureMeta}>
              {EXPLORE_DOMAIN_CONFIG[domain].label}
            </span>
          </span>
        </summary>
        <div className={styles.disclosureBody}>
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
                items={(composition?.complaintTypes ?? []).map((item) => ({
                  label: item.complaintType,
                  tag: domain === "collective" ? item.domainLabel : undefined,
                  count: item.count,
                  sharePct: item.sharePct,
                }))}
                noun="complaint types"
              />
              {domain === "collective" ? (
                <div>
                  <h4 className={styles.subheading}>Agency detail</h4>
                  <p className={styles.rankedExplanation}>
                    Exact agency totals are available within each service
                    domain. The artifact does not contain a complete
                    cross-domain agency ranking.
                  </p>
                </div>
              ) : (
                <RankedDetail
                  heading="Top agencies by request count"
                  items={(composition?.agencies ?? []).map((item) => ({
                    label: item.agency,
                    title: item.fullName ?? undefined,
                    count: item.count,
                    sharePct: item.sharePct,
                  }))}
                  noun="agencies"
                  valueNoun="requests"
                  explanation={
                    <>
                      Each count is the number of mapped requests whose 311 record
                      deems responsible for the complaint; percentage is its share
                      of requests in this tract and domain. It does{" "}
                      <em>not</em> measure agency availability or completed work.
                    </>
                  }
                />
              )}
            </div>
          )}
          <p className={styles.note} style={{ marginTop: 10 }}>
            Complaint type describes the administrative record; it does not
            establish cause.
          </p>
        </div>
      </details>
    </section>
  );
}

function SparseResponse({ response }: { response: RecordedResponsePresentation }) {
  return (
    <div className={styles.status}>
      <strong className={styles.statusTitle}>{response.title}</strong>
      {response.status === "insufficient_sample" ? (
        <p>Sample: {formatInteger(response.knownTimingOutcomes30d)} requests</p>
      ) : null}
      <p>{response.detail}</p>
    </div>
  );
}

function ResponseDetail({
  response,
  onReadPopulationMethod,
}: {
  response: RecordedResponsePresentation;
  onReadPopulationMethod?: () => void;
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
            closed within 30 days
          </span>
        </div>
        <div>
          <span className={styles.responseValue}>
            {days(metrics.medianRecordedDaysToClose)}
          </span>
          <span className={styles.responseLabel}>
            median days to closure
          </span>
        </div>
      </div>
      <details className={styles.disclosure}>
        <summary>Closure timing details</summary>
        <div className={styles.detailGroup}>
          <h4 className={styles.subheading}>Historical timing evidence</h4>
          <div className={styles.metricGrid}>
            <Metric label="30-day sample">
              {formatInteger(response.knownTimingOutcomes30d)}
            </Metric>
            <Metric label="~6-month sample">
              {formatInteger(response.knownTimingOutcomes180d)}
            </Metric>
            <Metric label="Recorded closures">
              {formatInteger(response.validRecordedClosures)}
            </Metric>
            <Metric label="Sample status">
              <span className={styles.inlineInfoLabel}>
                Sufficient
                <InfoMarker label="About sufficient sample status" align="end">
                  <p>
                    Sufficient is an author-defined analytical sample status,
                    not an NYC 311 field.
                  </p>
                  <p>
                    It means this tract–domain has a response sample of at least
                    30 requests in the historical 2016 cohort—the threshold for
                    tract-specific closure estimates, replay, and uncertainty.
                  </p>
                </InfoMarker>
              </span>
            </Metric>
          </div>
        </div>
        <div className={styles.detailGroup}>
          <h4 className={styles.subheading}>By request age</h4>
          <div className={styles.metricGrid}>
            <Metric label="Closed within 30 days">
              {formatPercent(metrics.recordedClosureWithin30dPct)}
            </Metric>
            <Metric label="Closed within ~6 months">
              {formatPercent(metrics.recordedClosureWithin180dPct)}
            </Metric>
            <Metric label="Still open after 30 days">
              {formatInteger(metrics.notRecordedClosedWithin30dCount)}
            </Metric>
            <Metric label="Still open after ~6 months">
              {formatInteger(metrics.notRecordedClosedWithin180dCount)}
            </Metric>
            <Metric
              label={
                <span className={styles.inlineInfoLabel}>
                  Still open after 30 days, per 1,000 residents
                  <PopulationDenominatorInfo onReadMethod={onReadPopulationMethod} />
                </span>
              }
            >
              {rateValue(metrics.notRecordedClosedWithin30dPer1000)}
            </Metric>
            <Metric
              label={
                <span className={styles.inlineInfoLabel}>
                  Still open after ~6 months, per 1,000 residents
                  <PopulationDenominatorInfo onReadMethod={onReadPopulationMethod} />
                </span>
              }
            >
              {rateValue(metrics.notRecordedClosedWithin180dPer1000)}
            </Metric>
          </div>
        </div>
      </details>
    </>
  );
}

function Metric({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.metricCell}>
      <span className={styles.cellLabel}>{label}</span>
      <span className={styles.cellValue}>{children}</span>
    </div>
  );
}

function RecordedResponse({
  response,
  onReadPopulationMethod,
}: {
  response: RecordedResponsePresentation;
  onReadPopulationMethod?: () => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="response-heading">
      <div className={styles.eyebrow}>Administrative record</div>
      <h3 id="response-heading" className={styles.sectionTitle}>
        Recorded response
      </h3>
      <ResponseDetail
        response={response}
        onReadPopulationMethod={onReadPopulationMethod}
      />
    </section>
  );
}

function CollectiveResponseNotice() {
  return (
    <section className={styles.section} aria-labelledby="response-heading">
      <div className={styles.eyebrow}>Administrative record</div>
      <h3 id="response-heading" className={styles.sectionTitle}>
        Recorded response
      </h3>
      <p className={styles.collectiveResponseNote}>{COLLECTIVE_RESPONSE_NOTE}</p>
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
  onReadPopulationMethod,
}: {
  presentation: TractPresentation;
  detail: TractDetailRecord | undefined;
  domain: ExploreDomainKey;
  loading: boolean;
  detailError: Error | null;
  onRetryDetail: () => void | Promise<unknown>;
  onReadPopulationMethod?: () => void;
}) {
  return (
    <article className={styles.drawer} aria-label="Active tract detail">
      <TractIdentity presentation={presentation} />
      <ComplaintActivity
        presentation={presentation}
        onReadPopulationMethod={onReadPopulationMethod}
      />
      {presentation.response ? (
        <RecordedResponse
          response={presentation.response}
          onReadPopulationMethod={onReadPopulationMethod}
        />
      ) : (
        <CollectiveResponseNotice />
      )}
      <ComplaintComposition
        detail={detail}
        properties={presentation.feature.properties}
        domain={domain}
        loading={loading}
        error={detailError}
        onRetry={onRetryDetail}
      />
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
        <strong>Census Tract {properties.tractName}</strong>
        <span className={styles.headerMetadata}>
          {properties.borough}
          <br />
          Population {formatInteger(properties.population)}
          {" · "}Income {formatCurrency(properties.medianHouseholdIncome)}
        </span>
      </button>
      {onRemove ? (
        <button
          className={styles.removeButton}
          type="button"
          onClick={() => onRemove(properties.geoid)}
          aria-label={`Remove ${formatTractName(properties.tractName, properties.borough)}`}
        >
          <span aria-hidden="true">×</span>
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
  properties,
  domain,
  loading,
  error,
  onRetry,
}: {
  detail: TractDetailRecord | undefined;
  properties: TractFeatureProperties;
  domain: ExploreDomainKey;
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
  const composition = getComplaintCompositionPresentation(
    detail,
    properties,
    domain,
  );
  const types = composition.complaintTypes.slice(0, 5);
  const agencies = composition.agencies.slice(0, 3);
  return (
    <details className={styles.disclosure} style={{ marginTop: 0 }}>
      <summary>Show types and agencies</summary>
      <div className={styles.comparisonStatus}>
        <strong>Top complaint types</strong>
        {types.length > 0 ? (
          <ol className={styles.compactList}>
            {types.map((item) => (
              <li key={`${item.domain}-${item.complaintType}`}>
                <span className={styles.compactItemLabel}>
                  <span>{item.complaintType}</span>
                  {domain === "collective" ? (
                    <span className={styles.domainTag}>{item.domainLabel}</span>
                  ) : null}
                </span>
                <span>
                  {formatInteger(item.count)} · {formatPercent(item.sharePct)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <span className={styles.unavailable}>No complaint types</span>
        )}
        <strong style={{ marginTop: 5 }}>
          {domain === "collective"
            ? "Agency detail"
            : "Top agencies by request count"}
        </strong>
        {domain === "collective" ? (
          <span className={styles.unavailable}>
            Exact agency totals are available within each service domain.
          </span>
        ) : agencies.length > 0 ? (
          <ol className={styles.compactList}>
            {agencies.map((item) => (
              <li key={item.agency}>
                <span
                  title={item.fullName ?? undefined}
                  aria-label={
                    item.fullName
                      ? `${item.agency}: ${item.fullName}`
                      : undefined
                  }
                >
                  {item.agency}
                </span>
                <span>
                  {formatInteger(item.count)} requests ·{" "}
                  {formatPercent(item.sharePct)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <span className={styles.unavailable}>No agencies</span>
        )}
      </div>
    </details>
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
        ? ` · sample: ${formatInteger(response.knownTimingOutcomes30d)} requests`
        : ""}
    </span>
  );
}

function ResponseCell({
  response,
  metric,
}: {
  response: RecordedResponsePresentation | null;
  metric:
    | "summary"
    | "closure180"
    | "evidence"
    | "notClosed30"
    | "notClosed180";
}) {
  if (response === null) {
    return <span className={styles.unavailable}>{COLLECTIVE_RESPONSE_NOTE}</span>;
  }
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
          30-day sample: {formatInteger(response.knownTimingOutcomes30d)} requests
          <br />
          Recorded closures: {formatInteger(response.validRecordedClosures)}
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
  }
}

function ComparisonGrid({
  presentations,
  activeGeoid,
  domain,
  details,
  loading,
  detailError,
  onRetryDetail,
  onActivate,
  onRemove,
  onReadPopulationMethod,
}: {
  presentations: readonly TractPresentation[];
  activeGeoid: string | null;
  domain: ExploreDomainKey;
  details: TractDetails | null;
  loading: boolean;
  detailError: Error | null;
  onRetryDetail: () => void | Promise<unknown>;
  onActivate: (geoid: string) => void;
  onRemove?: (geoid: string) => void;
  onReadPopulationMethod?: () => void;
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
              <span className={styles.inlineInfoLabel}>
                {EXPLORE_DOMAIN_CONFIG[domain].label} complaints
                <PopulationDenominatorInfo
                  align="start"
                  onReadMethod={onReadPopulationMethod}
                />
              </span>
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
              <span className={styles.inlineInfoLabel}>
                All service domains
                <PopulationDenominatorInfo
                  align="start"
                  onReadMethod={onReadPopulationMethod}
                />
              </span>
            </th>
            {cells((presentation) => (
              <details className={styles.disclosure} style={{ marginTop: 0 }}>
                <summary>Show all domains</summary>
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
          <GroupRow
            label="Recorded response"
            count={presentations.length}
          />
          {domain === "collective" ? (
            <tr>
              <th className={styles.metricLabel} scope="row">
                Recorded response
              </th>
              {cells(() => (
                <span className={styles.unavailable}>
                  {COLLECTIVE_RESPONSE_NOTE}
                </span>
              ))}
            </tr>
          ) : (
            (
              [
              ["Closed within 30 days", "summary"],
              ["Closed within ~6 months", "closure180"],
              ["Response sample", "evidence"],
              ["Still open after 30 days", "notClosed30"],
              ["Still open after ~6 months", "notClosed180"],
              ] as const
            ).map(([label, metric]) => (
              <tr key={metric}>
                <th className={styles.metricLabel} scope="row">
                  {metric === "notClosed30" || metric === "notClosed180" ? (
                    <span className={styles.inlineInfoLabel}>
                      {label}
                      <PopulationDenominatorInfo
                        align="start"
                        onReadMethod={onReadPopulationMethod}
                      />
                    </span>
                  ) : label}
                </th>
                {cells((presentation) => (
                  <ResponseCell response={presentation.response} metric={metric} />
                ))}
              </tr>
            ))
          )}
          <GroupRow
            label="Complaint types and agencies"
            count={presentations.length}
          />
          <tr>
            <th className={styles.metricLabel} scope="row">
              {domain === "collective" ? "Collective detail" : "Active-domain detail"}
            </th>
            {cells((presentation) => (
              <ComplaintTypesCompact
                detail={details?.tracts[presentation.feature.properties.geoid]}
                properties={presentation.feature.properties}
                domain={domain}
                loading={loading}
                error={detailError}
                onRetry={onRetryDetail}
              />
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
  onActivate,
  onRemove,
  onReadPopulationMethod,
}: TractComparisonProps) {
  const loadRequested = useRef(false);
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
        onReadPopulationMethod={onReadPopulationMethod}
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
      onActivate={onActivate}
      onRemove={onRemove}
      onReadPopulationMethod={onReadPopulationMethod}
    />
  );
}
