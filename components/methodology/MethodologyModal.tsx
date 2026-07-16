"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { Context, Manifest, Metadata } from "@/lib/artifacts/schemas";

import styles from "./MethodologyModal.module.css";

export const METHODOLOGY_TOPICS = [
  "overview",
  "data",
  "map_metrics",
  "prioritization",
  "modeling",
  "limitations",
  "claude",
  "sources",
] as const;

export type MethodologyTopic = (typeof METHODOLOGY_TOPICS)[number];

const TOPIC_LABELS: Record<MethodologyTopic, string> = {
  overview: "Overview",
  data: "Data",
  map_metrics: "Map metrics",
  prioritization: "Prioritization",
  modeling: "Modeling",
  limitations: "Limitations",
  claude: "Claude",
  sources: "Sources",
};

export interface MethodologyModalProps {
  open: boolean;
  onClose: () => void;
  manifest: Manifest;
  metadata: Metadata;
  context: Context;
  initialTopic?: MethodologyTopic;
  onTopicChange: (topic: MethodologyTopic) => void;
}

function MethodLink({
  topic,
  children,
  onSelect,
}: {
  topic: MethodologyTopic;
  children: ReactNode;
  onSelect: (topic: MethodologyTopic) => void;
}) {
  return (
    <button className={styles.inlineLink} type="button" onClick={() => onSelect(topic)}>
      {children}
    </button>
  );
}

function StepIcon({ kind }: { kind: MethodologyTopic }) {
  if (kind === "data") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 7.5 14 4l12 4.5-9 4L5 7.5Z" />
        <path d="m5 7.5 12 5 9-4v14L17 27 5 22.5v-15Z" />
        <path d="M17 12.5V27" />
      </svg>
    );
  }
  if (kind === "map_metrics") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m4 8 7-3 10 3 7-3v19l-7 3-10-3-7 3V8Z" />
        <path d="M11 5v19M21 8v19" />
        <circle cx="17" cy="14" r="3" />
      </svg>
    );
  }
  if (kind === "prioritization") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 24h22M7 20l5-6 5 3 8-10" />
        <circle cx="7" cy="20" r="1.5" />
        <circle cx="12" cy="14" r="1.5" />
        <circle cx="17" cy="17" r="1.5" />
        <circle cx="25" cy="7" r="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 22h22M7 18l5-5 5 2 8-8" />
      <path d="M7 25V7M12 25V13M17 25V15M25 25V7" />
    </svg>
  );
}

function Overview({ onSelect }: { onSelect: (topic: MethodologyTopic) => void }) {
  const steps: readonly {
    number: string;
    title: string;
      body: string;
      topic: MethodologyTopic;
  }[] = [
    {
      number: "01",
      title: "Map requests to census tracts",
      body: "Place the historical 2016 creation cohort into a consistent tract geography.",
      topic: "data",
    },
    {
      number: "02",
      title: "Compare demand and recorded response",
      body: "Read mapped complaints beside population context and administrative closure timing.",
      topic: "map_metrics",
    },
    {
      number: "03",
      title: "Test priority assumptions",
      body: "Blend complaint intensity and lower-income priority, then surface the first K ranked tracts.",
      topic: "prioritization",
    },
    {
      number: "04",
      title: "Replay request flow",
      body: "Carry historical arrival cohorts through a recorded closure-by-age curve.",
      topic: "modeling",
    },
  ];

  return (
    <div className={styles.topicBody}>
      <p className={styles.lede}>
        The Atlas separates observed historical records, deterministic priority
        definitions, and model-derived workload values so each can be read on
        its own terms.
      </p>
      <div className={styles.purposeGrid}>
        <section>
          <h3>Purpose</h3>
          <p>
            NYC 311 publishes a rich request record, but the raw data does not
            make it easy to see complaint patterns, neighborhood context,
            recorded administrative response, and workload aging together at
            census-tract scale. The Atlas turns one validated historical
            snapshot into a map-first product for exploring those relationships.
          </p>
        </section>
        <section>
          <h3>Why this exists</h3>
          <p>
            It gives public agencies, nonprofits, researchers, residents, and
            community partners a shared view for connecting reported concerns
            with place, comparing neighborhoods on common terms, and testing
            whether a priority or workload question merits deeper investigation.
            It can support inquiry and coordination; it does not prescribe
            action, show current operations, or determine whether an
            intervention will work.
          </p>
          <MethodLink topic="limitations" onSelect={onSelect}>
            Read limitations
          </MethodLink>
        </section>
      </div>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.number}>
            <div className={styles.stepVisual}>
              <span className={styles.stepNumber}>{step.number}</span>
              <StepIcon kind={step.topic} />
            </div>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <MethodLink topic={step.topic} onSelect={onSelect}>Read the method</MethodLink>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DataTopic({ metadata }: { metadata: Metadata }) {
  return (
    <div className={styles.topicBody}>
      <p className={styles.lede}>
        A fixed {metadata.snapshotYear} creation cohort, tract-matched geometry,
        and ACS demographic context form the analytical record.
      </p>
      <dl className={styles.factGrid}>
        <div><dt>Mapped requests</dt><dd>{metadata.dataAudit.requests_retained_after_spatial_match.toLocaleString("en-US")}</dd></div>
        <div><dt>Map tracts</dt><dd>{metadata.eligibility.allMapTracts.toLocaleString("en-US")}</dd></div>
        <div><dt>Service domains</dt><dd>{metadata.scenarioGrid.serviceDomains.length}</dd></div>
        <div><dt>Minimum timing sample</dt><dd>{metadata.workload.minimumComparisonSample}</dd></div>
      </dl>
      <section>
        <h3>Geocoding and tract matching</h3>
        <p>
          Requests with valid coordinates were spatially matched to the exported
          census-tract geometry. Unmatched records are not silently assigned to a tract.
        </p>
      </section>
      <section>
        <h3>Complaint-domain mapping</h3>
        <p>
          NYC 311 supplies complaint types and agencies; it does not supply the
          five Atlas service domains. For this artifact set, the project author mapped {" "}
          {metadata.dataAudit.complaint_types_mapped_to_five_domains.toLocaleString("en-US")} observed complaint types into an author-curated taxonomy: Noise,
          Housing &amp; Building, Sanitation &amp; Environmental, Street &amp;
          Infrastructure, and Public Safety &amp; Quality of Life.
        </p>
        <p>
          These groupings support consistent navigation and comparison; they are
          not an official NYC 311 taxonomy. Other defensible groupings are
          possible and could change domain-level comparisons. Complaint records
          also reflect reporting behavior as well as underlying conditions.
        </p>
      </section>
      <section>
        <h3>Recorded dates and sparse samples</h3>
        <p>
          Negative close durations are excluded from valid timing evidence. No
          requests, no response sample, and a response sample below 30 remain
          distinct states; suppressed values stay unavailable rather than becoming zero.
        </p>
        <p>
          A <strong>response sample</strong> contains requests whose administrative
          dates can be evaluated at the stated request-age checkpoint. Invalid
          negative dates and closed-like statuses without a valid Closed Date
          remain unknown; missing timing is never recoded as zero closure.
          Artifact fields call these records known timing outcomes. Median time
          to close is shown only when at least 30 valid closure dates are present.
        </p>
      </section>
    </div>
  );
}

function MapMetricsTopic() {
  return (
    <div className={styles.topicBody}>
      <section>
        <h3>Count and intensity</h3>
        <p>
          Mapped complaint count is the observed number of tract-matched records.
          Complaints per 1,000 divides that count by one fixed ACS 2012–2016 tract
          resident-population estimate. Counts remain visible beside rates.
        </p>
      </section>
      <section className={styles.callout}>
        <h3>Population and exposure</h3>
        <p>
          The denominator is not a monthly population series and receives no
          within-year adjustment. It does not represent daytime population,
          visitors, commuters, housing units, road miles, park use, nightlife,
          or domain-specific exposure. Rate comparisons can therefore be less
          suitable for complaints shaped by nonresident activity. Future work
          could test domain-specific denominators; this MVP does not invent them.
        </p>
      </section>
      <section>
        <h3>Recorded administrative closure</h3>
        <p>
          Closed Date is an administrative field. A recorded closure does not
          establish physical resolution, service quality, or that the reported
          condition was eliminated.
        </p>
      </section>
      <section>
        <h3>Queen adjacency</h3>
        <p>
          Two tracts are Queen-adjacent when their boundaries touch along an edge
          or at a corner. Neighborhood radius is the shortest number of those
          adjacency steps from the active tract; no proximity-based fallback is
          created for an island.
        </p>
      </section>
    </div>
  );
}

function PrioritizationTopic({ context, metadata }: { context: Context; metadata: Metadata }) {
  return (
    <div className={styles.topicBody}>
      <ol className={styles.plainSteps}>
        <li><strong>Build two ratings.</strong> One describes complaint intensity; one gives more weight to lower median household income.</li>
        <li><strong>Choose a scale.</strong> Rank-balanced uses relative positions; Magnitude-sensitive retains standardized distance from the mean.</li>
        <li><strong>Blend the ratings.</strong> Priority balance sets the weight placed on each component.</li>
        <li><strong>Rank eligible tracts.</strong> Scores are sorted deterministically with a stable tie rule.</li>
        <li><strong>Surface the first K.</strong> K is an analytical selection size, not staff, funding, inspections, or interventions.</li>
      </ol>
      <p>
        The artifact contains {metadata.scenarioGrid.totalScenarios.toLocaleString("en-US")} validated definitions. Six population-eligible tracts are excluded from
        prioritization because median household income is missing.
      </p>
      <p>
        <strong>Priority size</strong> is the chosen number of highest-ranked
        eligible tracts surfaced by a definition: 25, 50, 100, 150, or 200. It
        does not represent staffing, funding, inspections, interventions, or
        operational capacity.
      </p>
      <p>
        <strong>Allocation eligibility</strong> is this project&apos;s analytical
        rule for entering those rankings: the tract must meet the 500-resident
        threshold and have the population and income fields needed by the score.
        Ineligible tracts remain available in Explore; the label is not an NYC
        311 operational designation.
      </p>
      <details className={styles.technicalDisclosure}>
        <summary>Technical scoring details</summary>
        <div>
          <p><strong>Rank-balanced:</strong> {context.scalingModes.rank_balanced.description}</p>
          <p><strong>Magnitude-sensitive:</strong> {context.scalingModes.magnitude_sensitive.description}</p>
          <code>score = intensity weight × intensity component + income weight × lower-income component</code>
          <p>
            Example: a 60% complaint-intensity balance uses an intensity weight
            of 0.6 and a lower-income weight of 0.4. The first K scores are surfaced.
          </p>
        </div>
      </details>
    </div>
  );
}

function ModelingTopic({ metadata }: { metadata: Metadata }) {
  return (
    <div className={styles.topicBody}>
      <div className={styles.grammarGrid}>
        <div><span className={styles.observedMark} /> <strong>Observed</strong><p>Historical arrivals and recorded dates in the validated 2016 record.</p></div>
        <div><span className={styles.deterministicMark} /> <strong>Deterministic</strong><p>Priority membership produced by exact controls and exported scores.</p></div>
        <div><span className={styles.modeledMark} /> <strong>Model-derived</strong><p>Still-open request volume created by applying the recorded closure-by-age curve.</p></div>
      </div>
      <section>
        <h3>Historical request flow</h3>
        <p>
          The replay starts with {metadata.workload.arrivalPeriods} actual arrival
          periods: {metadata.workload.fullArrivalPeriods} complete 30-day cohorts
          and one visibly partial six-day cohort. The partial period is excluded
          from complete-period summaries and uncertainty resampling.
        </p>
        <p>
          <strong>Follow-through periods</strong> are six model-derived periods
          after the observed arrivals end. They add no new requests; they allow
          earlier cohorts to age so their expected recorded closures and open
          balance remain visible. They are not additional observed periods.
        </p>
      </section>
      <section>
        <h3>Closure by request age</h3>
        <p>
          Cumulative recorded closure is evaluated every 30 days through age 570.
          The replay carries each cohort’s modeled surviving share into later periods.
        </p>
        <p>
          Combined scopes sum arrival arrays and closure counts before rates are
          derived; tract percentages are never averaged. A pooled curve appears
          only when the combined response sample reaches 30 requests.
        </p>
      </section>
      <section>
        <h3>What-if assumptions</h3>
        <p>
          Demand change multiplies every arrival period. Closure change shifts
          every point on the historical closure curve and clamps probabilities
          to zero through one. These are assumptions, not causal intervention effects.
        </p>
        <p>
          <strong>Percentage points</strong> change a percentage directly: for
          example, a +10-point shift moves 40% to 50%, not to 44%. The same shift
          is applied at every request-age checkpoint and clamped to 0–100%.
        </p>
      </section>
      <section>
        <h3>Fractional expected counts</h3>
        <p>
          Replay applies recorded closure proportions to whole-request cohorts,
          so model-derived recorded closures and still-open volume can be fractional.
          A value such as 12.4 is an expected count, not a fraction of an observed
          request or a current agency backlog.
        </p>
      </section>
      <section className={styles.callout}>
        <h3>Uncertainty</h3>
        <p>
          {metadata.workload.uncertaintyDraws.toLocaleString("en-US")} deterministic
          draws combine the twelve complete arrival periods with finite-sample
          uncertainty in recorded closure. Intervals do not cover future structural
          change, reporting change, or ACS population-estimate uncertainty.
        </p>
      </section>
    </div>
  );
}

function LimitationsTopic() {
  const items = [
    ["Historical scope", "The Atlas describes a 2016 creation cohort, not current NYC conditions."],
    ["Reporting behavior", "Complaint volume reflects awareness, access, and reporting behavior as well as conditions."],
    ["Static denominator", "One ACS 2012–2016 resident-population estimate is used for the full cohort."],
    ["Administrative closure", "A Closed Date does not establish physical resolution."],
    ["Sparse evidence", "A response sample below 30 requests suppresses tract-specific closure-derived results."],
    ["Observational design", "Patterns do not identify causal mechanisms or intervention effects."],
    ["No operational capacity", "Priority selection size does not represent staff, budgets, cases, or inspections."],
  ] as const;
  return (
    <div className={styles.topicBody}>
      <div className={styles.limitations}>
        {items.map(([title, body]) => <section key={title}><h3>{title}</h3><p>{body}</p></section>)}
      </div>
    </div>
  );
}

function ClaudeTopic() {
  return (
    <div className={styles.topicBody}>
      <p className={styles.lede}>Interpretation is optional. Every analytical control remains available without an API key.</p>
      <div className={styles.responsibilityGrid}>
        <section><h3>Deterministic system</h3><p>Loads validated data, calculates values, determines membership, and applies user-approved controls.</p></section>
        <section><h3>Claude</h3><p>Explains supplied results, compares contexts, parses intent, and labels hypotheses to investigate.</p></section>
        <section><h3>Human</h3><p>Chooses definitions, approves proposed actions, evaluates evidence, and remains responsible for decisions.</p></section>
      </div>
      <p>
        Claude cannot replace calculations, invent fields, claim current conditions
        or causality, treat closure as physical resolution, translate K into
        resources, or mutate state without Apply.
      </p>
    </div>
  );
}

function SourcesTopic({ manifest, metadata }: { manifest: Manifest; metadata: Metadata }) {
  return (
    <div className={styles.topicBody}>
      <dl className={styles.sourceList}>
        <div><dt>Service requests</dt><dd>{metadata.sources.serviceRequests}</dd></div>
        <div><dt>Tract demographics</dt><dd>{metadata.sources.tractDemographics}</dd></div>
        <div><dt>Tract geometry</dt><dd>{metadata.sources.tractGeometry}</dd></div>
        <div><dt>Borough income context</dt><dd>{metadata.sources.boroughIncome}</dd></div>
        <div><dt>Source year</dt><dd>{metadata.snapshotYear}</dd></div>
      </dl>
      <details className={styles.technicalDisclosure}>
        <summary>Technical provenance</summary>
        <div className={styles.provenance}>
          <dl>
            <div><dt>Schema version</dt><dd>{manifest.schemaVersion}</dd></div>
            <div><dt>Model version</dt><dd>{manifest.modelVersion}</dd></div>
            <div><dt>Artifact-set ID</dt><dd>{manifest.artifactSetId}</dd></div>
            <div><dt>Generated</dt><dd>{new Date(manifest.generatedAtUtc).toLocaleString()}</dd></div>
          </dl>
          <div className={styles.hashList}>
            {manifest.files.map((file) => (
              <div key={file.file}>
                <span>{file.file}</span>
                <code>{file.sha256}</code>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

export function MethodologyModal({
  open,
  onClose,
  manifest,
  metadata,
  context,
  initialTopic = "overview",
  onTopicChange,
}: MethodologyModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const topic = initialTopic;

  useEffect(() => {
    if (!open) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      priorFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const selectTopic = (next: MethodologyTopic) => {
    onTopicChange(next);
  };

  let content: ReactNode;
  switch (topic) {
    case "overview": content = <Overview onSelect={selectTopic} />; break;
    case "data": content = <DataTopic metadata={metadata} />; break;
    case "map_metrics": content = <MapMetricsTopic />; break;
    case "prioritization": content = <PrioritizationTopic context={context} metadata={metadata} />; break;
    case "modeling": content = <ModelingTopic metadata={metadata} />; break;
    case "limitations": content = <LimitationsTopic />; break;
    case "claude": content = <ClaudeTopic />; break;
    case "sources": content = <SourcesTopic manifest={manifest} metadata={metadata} />; break;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`${styles.modal} modal`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="methodology-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <div className="eyebrow">Methodology</div>
            <h2 id="methodology-title">How to read the Atlas</h2>
          </div>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Close methodology" onClick={onClose}>×</button>
        </header>
        <div className={styles.layout}>
          <nav className={styles.topicNav} aria-label="Methodology topics">
            {METHODOLOGY_TOPICS.map((item) => (
              <button key={item} type="button" aria-current={topic === item ? "page" : undefined} onClick={() => selectTopic(item)}>
                {TOPIC_LABELS[item]}
              </button>
            ))}
          </nav>
          <article className={styles.content} aria-labelledby="methodology-topic-title">
            <h2 id="methodology-topic-title">{TOPIC_LABELS[topic]}</h2>
            {content}
          </article>
        </div>
      </section>
    </div>
  );
}
