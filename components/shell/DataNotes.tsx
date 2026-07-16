"use client";

import { useEffect, useMemo, useRef } from "react";

import { getRecordedResponsePresentation } from "@/components/explore/tractPresentation";
import type { TractFeature } from "@/lib/artifacts";
import type { ExploreDomainKey, MapMetric, Workspace } from "@/lib/domain";
import type { QueenNeighborhood } from "@/lib/spatial";

export type DataNotesMethodologyTopic =
  | "data"
  | "map_metrics"
  | "prioritization"
  | "modeling"
  | "limitations";

interface Note {
  readonly title: string;
  readonly detail: string;
}

const GLOBAL_NOTES: readonly Note[] = [
  {
    title: "Historical scope",
    detail: "This view uses the 2016 request-creation cohort, not current conditions.",
  },
  {
    title: "Mapped complaints",
    detail: "Complaint counts include requests with valid locations matched to a tract; unmatched records are excluded. Counts reflect reporting behavior as well as underlying conditions.",
  },
  {
    title: "Per 1,000 residents",
    detail: "Rates use a fixed ACS 2012–2016 resident-population estimate. They do not represent daytime population, visitors, or domain-specific exposure.",
  },
  {
    title: "Administrative closure",
    detail: "Throughout the Atlas, closure means a recorded NYC 311 Closed Date. It does not establish physical resolution.",
  },
  {
    title: "Response sample",
    detail: "A response sample contains requests whose dates can be evaluated at the stated request age. At least 30 are required for tract-specific closure and Model results; median closure time separately requires 30 recorded closures.",
  },
];

const PRIORITIZE_NOTES: readonly Note[] = [
  {
    title: "Income measure",
    detail: "Lower-income priority is based on tract median household income only.",
  },
  {
    title: "Scaling choice",
    detail: "The normalization method can materially change mixed-priority selections.",
  },
  {
    title: "Analytical selection size",
    detail: "The number of surfaced tracts is not staffing, funding, inspections, or operational capacity.",
  },
  {
    title: "Deterministic historical scenario",
    detail: "A priority definition is a deterministic historical selection, not a policy recommendation.",
  },
  {
    title: "Missing income",
    detail: "Six population-eligible tracts are excluded from prioritization because income is missing.",
  },
];

const MODEL_NOTES: readonly Note[] = [
  {
    title: "One historical arrival year",
    detail: "The arrival pattern comes from one historical request-creation year.",
  },
  {
    title: "Partial final period",
    detail: "The thirteenth arrival period contains six days and is excluded from complete-period summaries and resampling.",
  },
  {
    title: "Sparse timing evidence",
    detail: "When a selected scope has a response sample below 30 requests, closure curves, replay, modeled still-open estimates, and uncertainty are hidden.",
  },
  {
    title: "Uncertainty scope",
    detail: "Intervals cover historical-period variation and finite-sample closure estimation, not future structural change or ACS sampling error.",
  },
  {
    title: "What-if assumptions",
    detail: "Demand and closure controls are explicit assumptions, not causal intervention estimates.",
  },
  {
    title: "Fractional model estimates",
    detail: "Modeled open and closure counts can be decimals because probabilities are applied to whole requests. They are expected volume, not partial tickets or current backlog.",
  },
];

function exploreNotes(
  feature: TractFeature | null,
  domain: ExploreDomainKey,
  neighborhood: QueenNeighborhood | null,
): readonly Note[] {
  const notes: Note[] = [
    {
      title: "Author-curated service domains",
      detail: "NYC 311 supplies complaint types and agencies, not the five Atlas domains. The project author grouped them for exploration; other groupings are possible.",
    },
    {
      title: "Agency counts",
      detail: "An agency count is the number of mapped requests whose 311 record names that agency. It does not show how many agencies are available nearby, staffing, or completed work.",
    },
  ];

  if (feature) {
    const { properties } = feature;
    if (!properties.allocationEligible) {
      notes.push({
        title: "Not eligible for prioritization",
        detail: "This tract remains explorable on the map but is excluded from deterministic priority selections.",
      });
    }
    if (properties.population === null) {
      notes.push({
        title: "Population unavailable",
        detail: "A complaints-per-1,000 rate cannot be calculated for this tract.",
      });
    }
    if (properties.medianHouseholdIncome === null) {
      notes.push({
        title: "Income unavailable",
        detail: "Median household income is missing for this tract.",
      });
    }
    if (properties.allocationIneligibilityReason === "population_below_500") {
      notes.push({
        title: "Population below threshold",
        detail: "This tract is below the 500-resident threshold used for priority-selection eligibility.",
      });
    }

    if (domain === "collective") {
      notes.push({
        title: "Collective complaint view",
        detail: "Collective sums complaint counts across the five author-curated domains and recalculates the resident rate. Administrative closure and Model remain domain-specific.",
      });
    } else {
      const response = getRecordedResponsePresentation(properties, domain);
      if (response.status === "no_requests") {
        notes.push({
          title: "No mapped requests",
          detail: "No mapped requests are present for the active service domain in this tract.",
        });
      } else if (response.status === "no_known_timing") {
        notes.push({
          title: "Closure timing unavailable",
          detail: "Requests are present, but there is no response sample for this tract and domain.",
        });
      } else if (response.status === "insufficient_sample") {
        notes.push({
          title: "Insufficient response sample",
          detail: "The response sample has fewer than 30 requests, so tract-specific response modeling is hidden.",
        });
      }
    }

    if (neighborhood?.isIsland) {
      notes.push({
        title: "No adjacent tracts",
        detail: "No tract shares a boundary or corner with this tract, and no substitute neighbor is added.",
      });
    }
  }

  return notes;
}

function workspaceLabel(workspace: Workspace): string {
  if (workspace === "scenario") return "Prioritize";
  if (workspace === "workload") return "Model";
  return "Explore";
}

function methodologyTopic(workspace: Workspace): DataNotesMethodologyTopic {
  if (workspace === "scenario") return "prioritization";
  if (workspace === "workload") return "modeling";
  return "map_metrics";
}

export interface DataNotesProps {
  readonly open: boolean;
  readonly workspace: Workspace;
  readonly activeFeature: TractFeature | null;
  readonly activeDomain: ExploreDomainKey;
  readonly activeMapMetric: MapMetric;
  readonly activeNeighborhood: QueenNeighborhood | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenMethodology: (topic: DataNotesMethodologyTopic) => void;
}

export function DataNotes({
  open,
  workspace,
  activeFeature,
  activeDomain,
  activeNeighborhood,
  onOpenChange,
  onOpenMethodology,
}: DataNotesProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const notes = useMemo(() => {
    if (workspace === "scenario") return PRIORITIZE_NOTES;
    if (workspace === "workload") return MODEL_NOTES;
    return exploreNotes(
      activeFeature,
      activeDomain,
      activeNeighborhood,
    );
  }, [
    activeDomain,
    activeFeature,
    activeNeighborhood,
    workspace,
  ]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <div ref={rootRef} className="data-notes-root">
      <button
        ref={buttonRef}
        className="icon-button data-notes-trigger"
        type="button"
        aria-label="Data notes for this view"
        aria-expanded={open}
        aria-controls="data-notes-panel"
        title="Data notes for this view"
        onClick={() => onOpenChange(!open)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6.5 3.5h7l4 4v13h-11z" />
          <path d="M13.5 3.5v4h4M9 11h6M9 14h6M9 17h4" />
        </svg>
        <span className="data-notes-accent" aria-hidden="true" />
      </button>
      {open ? (
        <aside
          id="data-notes-panel"
          className="data-notes-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="data-notes-title"
        >
          <header className="data-notes-header">
            <div>
              <div className="eyebrow">{workspaceLabel(workspace)} context</div>
              <h2 id="data-notes-title">Data notes</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close data notes"
              onClick={() => {
                onOpenChange(false);
                buttonRef.current?.focus();
              }}
            >
              ×
            </button>
          </header>
          <div className="data-notes-content">
            <section aria-labelledby="data-notes-view">
              <h3 id="data-notes-view">For this view</h3>
              {notes.length ? (
                <ul>
                  {notes.map((note) => (
                    <li key={note.title}>
                      <strong>{note.title}</strong>
                      <span>{note.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="helper-text">No additional state-specific notes.</p>
              )}
            </section>
            <section aria-labelledby="data-notes-global">
              <h3 id="data-notes-global">Across the Atlas</h3>
              <ul>
                {GLOBAL_NOTES.map((note) => (
                  <li key={note.title}>
                    <strong>{note.title}</strong>
                    <span>{note.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenMethodology(methodologyTopic(workspace));
              }}
            >
              Read the method
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
