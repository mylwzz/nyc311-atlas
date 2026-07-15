"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import { isActionSafeForKnownGeoids } from "@/lib/assistant/guardrails";
import {
  AssistantActionSchema,
  AssistantContextSchema,
  type AssistantTask,
} from "@/lib/assistant/schemas";
import {
  DOMAIN_CONFIG,
  MAP_METRIC_LABELS,
} from "@/lib/domain";
import { useAtlasStore, type AssistantAction } from "@/lib/state/store";

const ApiResponseSchema = z.strictObject({
  available: z.boolean(),
  message: z.string().optional(),
  narrative: z.string().optional(),
  action: AssistantActionSchema.nullable().optional(),
  error: z.string().optional(),
});

export interface AssistantPanelProps {
  context: {
    workspace: "explore" | "scenario" | "workload";
    activeDomain:
      | "noise"
      | "housing_building"
      | "sanitation_environmental"
      | "street_infrastructure"
      | "public_safety_quality_of_life";
    activeMapMetric: string;
    selectedTracts: Array<Record<string, unknown>>;
    activeNeighborhood: Record<string, unknown> | null;
    currentScenario: Record<string, unknown> | null;
    pinnedScenario: Record<string, unknown> | null;
    workload: Record<string, unknown> | null;
  };
  /** Local validation only. This full set is never included in the API request. */
  knownGeoids: ReadonlySet<string>;
}

const unavailableCopy =
  "Claude interpretation is unavailable. All analytical controls remain active.";
const requestFailureCopy =
  "Claude could not complete this interpretation. Manual controls remain active.";

const TASK_OPTIONS: readonly {
  value: AssistantTask;
  label: string;
  available: (context: AssistantPanelProps["context"]) => boolean;
}[] = [
  {
    value: "explain_active_tract",
    label: "Explain active tract",
    available: (context) =>
      context.selectedTracts.some((tract) => tract.active === true),
  },
  {
    value: "compare_selected_tracts",
    label: "Compare selected tracts",
    available: (context) => context.selectedTracts.length >= 2,
  },
  {
    value: "explain_neighborhood_context",
    label: "Explain neighborhood context",
    available: (context) => context.activeNeighborhood !== null,
  },
  {
    value: "explain_scenario_membership",
    label: "Explain selection scenario",
    available: (context) => context.currentScenario !== null,
  },
  {
    value: "explain_workload_replay",
    label: "Explain historical replay",
    available: (context) => context.workload !== null,
  },
  {
    value: "interpret_workload_assumptions",
    label: "Interpret workload assumptions",
    available: (context) => context.workload !== null,
  },
  {
    value: "generate_hypotheses",
    label: "Generate hypotheses to investigate",
    available: () => true,
  },
  {
    value: "draft_investigation_brief",
    label: "Draft investigation brief",
    available: () => true,
  },
  {
    value: "explain_methodology_limitations",
    label: "Explain methodology and limitations",
    available: () => true,
  },
];

function describeAction(action: AssistantAction): string {
  switch (action.type) {
    case "set_workspace":
      return `Open the ${action.workspace === "scenario" ? "Scenario Lab" : action.workspace === "workload" ? "Workload" : "Explore"} workspace.`;
    case "set_domain":
      return `Set the service domain to ${DOMAIN_CONFIG[action.domain].label}.`;
    case "set_map_metric":
      return `Set the map metric to ${MAP_METRIC_LABELS[action.metric]}.`;
    case "select_tracts":
      return action.geoids.length === 0
        ? "Clear the manual tract comparison."
        : `Select ${action.geoids.length} supplied tract${action.geoids.length === 1 ? "" : "s"}${action.activeGeoid ? ` and activate ${action.activeGeoid}` : ""}.`;
    case "set_neighborhood":
      return `${action.enabled ? "Show" : "Hide"} Queen-contiguity neighborhood context${action.radius ? ` at radius ${action.radius}` : ""}.`;
    case "set_scenario":
      return `Open the ${action.scalingMode === "rank_balanced" ? "Rank-balanced" : "Magnitude-sensitive"} selection scenario for ${DOMAIN_CONFIG[action.domain].label}, K ${action.k}, alpha ${action.alpha.toFixed(1)}.`;
    case "set_workload_assumptions":
      return `Set demand change to ${action.demandChangePct}% and the recorded closure-curve shift to ${action.closureCurveShiftPoints} percentage points.`;
  }
}

export function AssistantPanel({ context, knownGeoids }: AssistantPanelProps) {
  const open = useAtlasStore((state) => state.assistant.open);
  const pendingAction = useAtlasStore((state) => state.assistant.pendingAction);
  const setOpen = useAtlasStore((state) => state.setAssistantOpen);
  const setPendingAction = useAtlasStore(
    (state) => state.setPendingAssistantAction,
  );
  const applyAction = useAtlasStore((state) => state.applyAssistantAction);
  const [available, setAvailable] = useState<boolean | "error" | null>(null);
  const [task, setTask] = useState<AssistantTask>(
    "explain_methodology_limitations",
  );
  const [prompt, setPrompt] = useState("");
  const [narrative, setNarrative] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || available !== null) return;
    const controller = new AbortController();
    fetch("/api/assistant", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const parsed = ApiResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          setAvailable("error");
          return;
        }
        setAvailable(parsed.data.available);
        if (!parsed.data.available) setPendingAction(null);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setAvailable("error");
      });
    return () => controller.abort();
  }, [available, open, setPendingAction]);

  const selectedTask = TASK_OPTIONS.find((option) => option.value === task);
  const effectiveTask = selectedTask?.available(context)
    ? task
    : "explain_methodology_limitations";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || loading || available !== true) return;

    const parsedContext = AssistantContextSchema.safeParse(context);
    if (!parsedContext.success) {
      setError(
        "The current analytical context is outside the supported interpretation contract.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setNarrative(null);
    setPendingAction(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: effectiveTask,
          prompt: prompt.trim(),
          context: parsedContext.data,
        }),
      });
      const value = ApiResponseSchema.parse(await response.json());
      setAvailable(value.available);
      if (value.error) setError(value.error);
      if (value.message) setNarrative(value.message);
      if (value.narrative) setNarrative(value.narrative);
      if (value.action) {
        setPendingAction(value.action as AssistantAction);
      }
    } catch {
      setError(requestFailureCopy);
    } finally {
      setLoading(false);
    }
  }

  function approvePendingAction() {
    if (!pendingAction) return;
    if (!isActionSafeForKnownGeoids(pendingAction, knownGeoids)) {
      setPendingAction(null);
      setError(
        "The proposed tract selection was discarded because it referenced an unknown tract.",
      );
      return;
    }
    applyAction();
  }

  return (
    <section className="assistant-panel" aria-label="Claude interpretation">
      <button
        className="assistant-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>Claude interpretation</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="assistant-body">
          {available === null ? (
            <div className="status-box" aria-live="polite">
              Checking interpretation availability…
            </div>
          ) : available === "error" ? (
            <div className="error-state" role="alert">
              <div>{requestFailureCopy}</div>
              <button
                className="button secondary"
                type="button"
                onClick={() => setAvailable(null)}
              >
                Check again
              </button>
            </div>
          ) : available === false ? (
            <div className="status-box">{unavailableCopy}</div>
          ) : (
            <form onSubmit={submit} className="field-stack">
              <label className="field-label" htmlFor="assistant-task">
                Interpretation task
              </label>
              <select
                id="assistant-task"
                className="select"
                value={effectiveTask}
                onChange={(event) => {
                  setTask(event.target.value as AssistantTask);
                  setPendingAction(null);
                }}
              >
                {TASK_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={!option.available(context)}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="field-label" htmlFor="assistant-prompt">
                Request
              </label>
              <textarea
                id="assistant-prompt"
                className="textarea"
                maxLength={2_000}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Explain what stands out in the supplied results and what evidence to investigate next."
              />
              <div className="control-row">
                <span className="helper-text">
                  Claude explains supplied results; it does not calculate them.
                </span>
                <button
                  className="button primary"
                  type="submit"
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? "Interpreting…" : "Interpret"}
                </button>
              </div>
            </form>
          )}
          {error ? <div className="error-state" role="alert">{error}</div> : null}
          {narrative ? (
            <div className="assistant-response" aria-live="polite">
              {narrative}
            </div>
          ) : null}
          {pendingAction ? (
            <div className="status-box">
              <div className="eyebrow">Proposed control change</div>
              <p>{describeAction(pendingAction)}</p>
              <div className="helper-text">
                Nothing changes until you approve it.
              </div>
              <div className="control-row">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setPendingAction(null)}
                >
                  Dismiss
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={approvePendingAction}
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
