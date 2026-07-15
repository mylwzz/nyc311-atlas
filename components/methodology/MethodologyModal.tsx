"use client";

import { useEffect, useRef } from "react";

import type { Context, Manifest, Metadata } from "@/lib/artifacts/schemas";

export interface MethodologyModalProps {
  open: boolean;
  onClose: () => void;
  manifest: Manifest;
  metadata: Metadata;
  context: Context;
}

export function MethodologyModal({
  open,
  onClose,
  manifest,
  metadata,
  context,
}: MethodologyModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const priorFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
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
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      priorFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const sections = [
    {
      title: "Data snapshot",
      body: `This workspace uses a ${metadata.snapshotYear} creation cohort of NYC 311 service requests. It describes a historical administrative record, not a live operational view.`,
    },
    {
      title: "Geocoding and tract matching",
      body: `${metadata.dataAudit.requests_2016_with_valid_coordinates.toLocaleString()} requests had valid coordinates; ${metadata.dataAudit.requests_retained_after_spatial_match.toLocaleString()} were spatially matched and retained across ${metadata.eligibility.allMapTracts.toLocaleString()} map tracts.`,
    },
    {
      title: "Complaint-domain mapping",
      body: `${metadata.dataAudit.complaint_types_mapped_to_five_domains.toLocaleString()} observed complaint types were mapped into the five exported service domains. Complaint records reflect reporting behavior as well as underlying conditions.`,
    },
    {
      title: "Per-capita normalization",
      body: `${context.boroughContextMetadata.complaint_rate.numerator} are divided by ${context.boroughContextMetadata.complaint_rate.denominator} and shown as ${context.boroughContextMetadata.complaint_rate.unit}. Counts remain visible and are more prominent in tract detail.`,
    },
    {
      title: "Population threshold and eligibility",
      body: `Selection scenarios score ${metadata.eligibility.allocationEligibleTracts.toLocaleString()} tracts. The population threshold is ${metadata.eligibility.populationThreshold.toLocaleString()}; missing population or income can also make a tract ineligible for scenario allocation while it remains on the map.`,
    },
    {
      title: "Income component",
      body: "The lower-income-priority component reverses the income direction so lower tract median household income receives a higher value. Income is context, not a direct measure of need or harm.",
    },
    {
      title: "Rank-balanced scoring",
      body: context.scalingModes.rank_balanced.description,
    },
    {
      title: "Magnitude-sensitive scoring",
      body: context.scalingModes.magnitude_sensitive.description,
    },
    {
      title: "Sensitivity analysis",
      body: `The exported library contains ${metadata.scenarioGrid.totalScenarios.toLocaleString()} validated selection scenarios: two scoring methods, five domains, five priority portfolio sizes, and eleven priority-balance settings. A scenario does not direct an operational choice.`,
    },
    {
      title: "Queen contiguity",
      body: "Direct neighbors share either an edge or a vertex. Radius is shortest graph distance from the active tract. The browser uses only exported neighbor lists; islands receive no invented fallback neighbors.",
    },
    {
      title: "Recorded administrative closure",
      body: "Closed Date is an administrative field. Recorded closure does not establish physical resolution, service quality, or that a reported condition was eliminated.",
    },
    {
      title: "Invalid dates",
      body: `${metadata.dataAudit.requests_retained_after_spatial_match.toLocaleString()} matched requests form the analytical cohort. Negative close durations are excluded from valid recorded closure timing rather than converted to zero.`,
    },
    {
      title: "Arrival periods",
      body: `The historical pattern uses ${metadata.workload.arrivalPeriods} actual non-overlapping arrival periods: ${metadata.workload.fullArrivalPeriods} complete 30-day periods and one final six-day partial period. The partial period is displayed but excluded from full-period summaries and resampling.`,
    },
    {
      title: "Request-age closure and rolling replay",
      body: "Cumulative recorded closure is evaluated at 30-day request-age checkpoints through day 570. The replay carries the surviving portion of each arrival cohort into later periods and reconciles arrivals, expected recorded closures, and expected open balance.",
    },
    {
      title: "Uncertainty",
      body: `${metadata.workload.uncertaintyDraws.toLocaleString()} deterministic draws combine resampling of the twelve complete arrival periods with a Jeffreys beta posterior for recorded closure. Intervals do not capture all possible structural change.`,
    },
    {
      title: "Sparse-sample policy",
      body: `Tract-specific closure, replay, open-at-age estimates, and uncertainty require ${metadata.workload.minimumComparisonSample} known timing outcomes. No requests, no known timing, insufficient sample, and sufficient sample remain distinct. Explicit groups may pool raw counts; there is no automatic pooled fallback.`,
    },
    {
      title: "Claude boundaries",
      body: "Claude is optional. It may explain deterministic outputs and generate labeled hypotheses, but it cannot alter calculations, scenario membership, or state without user approval; invent data; or make claims about live conditions, causality, physical service outcomes, real-world resources, or assured demand changes.",
    },
    {
      title: "Artifact integrity",
      body: `The manifest declares byte size, SHA-256 digest, record count, schema version, model version, and shared artifact-set identifier for all ${manifest.files.length} artifacts. Public files are checked before parsing, and server-only evidence is checked on the server. Any integrity, envelope, count, fetch, or cross-artifact mismatch blocks the affected workflow; artifact sets are never mixed silently.`,
    },
  ];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="methodology-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <div className="eyebrow">Methods and provenance</div>
            <h2 id="methodology-title" className="modal-title">
              How to read the Atlas
            </h2>
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            aria-label="Close methodology"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="modal-content">
          <section className="methodology-section">
            <h3>Artifact provenance</h3>
            <div className="provenance-grid">
              <div>
                <span className="eyebrow">Schema</span>
                <div>{manifest.schemaVersion}</div>
              </div>
              <div>
                <span className="eyebrow">Model</span>
                <div>{manifest.modelVersion}</div>
              </div>
              <div>
                <span className="eyebrow">Artifact set</span>
                <div>{manifest.artifactSetId}</div>
              </div>
              <div>
                <span className="eyebrow">Generated</span>
                <div>{new Date(manifest.generatedAtUtc).toLocaleString()}</div>
              </div>
              <div>
                <span className="eyebrow">Source year</span>
                <div>{metadata.snapshotYear}</div>
              </div>
              <div>
                <span className="eyebrow">Service requests</span>
                <div>{metadata.sources.serviceRequests}</div>
              </div>
              <div>
                <span className="eyebrow">Tract demographics</span>
                <div>{metadata.sources.tractDemographics}</div>
              </div>
              <div>
                <span className="eyebrow">Tract geometry</span>
                <div>{metadata.sources.tractGeometry}</div>
              </div>
              <div>
                <span className="eyebrow">Borough income context</span>
                <div>{metadata.sources.boroughIncome}</div>
              </div>
            </div>
          </section>
          {sections.map((section) => (
            <section className="methodology-section" key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
