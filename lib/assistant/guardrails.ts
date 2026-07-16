import {
  AssistantModelResponseSchema,
  type AssistantAction,
  type AssistantContext,
  type AssistantModelResponse,
  type AssistantTask,
} from "./schemas";

const MAX_MODEL_TEXT_LENGTH = 32_000;
const MAX_GROUNDING_REFERENCES = 768;
const REFERENCE_TOKEN_PATTERN = /\{\{([A-Za-z0-9_.:-]{1,240})\}\}/g;
const NUMERIC_LITERAL_PATTERN = /\p{N}/u;
const NUMERIC_WORD_PATTERN = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i;
const NUMBER_IN_SOURCE_PATTERN = /[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

const INVESTIGATION_BRIEF_SECTIONS = [
  "What the data shows",
  "Possible explanations to investigate",
  "Evidence still needed",
  "Potential intervention categories",
  "How to evaluate a pilot",
  "Limitations",
] as const;

export type AssistantGroundingReferenceKind =
  | "number"
  | "complaint_type"
  | "agency"
  | "text";

export interface AssistantGroundingReference {
  readonly id: string;
  readonly kind: AssistantGroundingReferenceKind;
  readonly value: string | number;
}

export interface GroundedAssistantResponse {
  readonly narrative: string;
  readonly action: AssistantAction | null;
}

const TASK_INSTRUCTIONS: Readonly<Record<AssistantTask, string>> = {
  explain_active_tract:
    "Explain only the supplied active-tract metrics, response sample state, and limitations.",
  compare_selected_tracts:
    "Compare only the supplied selected-tract values. Keep mapped complaint count prominent and do not infer missing values.",
  explain_neighborhood_context:
    "Explain only the supplied Queen-contiguity neighborhood summary, including radius, rank, and available-value count.",
  explain_scenario_membership:
    "Explain deterministic selection-scenario membership, score controls, and supplied metrics without recalculating or changing membership.",
  explain_workload_replay:
    "Explain the supplied historical replay and sparse-sample state. Describe recorded administrative closure and modeled still-open requests only.",
  interpret_workload_assumptions:
    "Interpret the supplied demand and recorded closure-curve assumptions as an assumption-based workload scenario.",
  generate_hypotheses:
    "Generate clearly labeled hypotheses to investigate, each tied to supplied evidence and paired with evidence that could challenge it.",
  draft_investigation_brief:
    "Draft a concise investigation brief using only supplied analytical context, methodology, limitations, and evidence.",
  explain_methodology_limitations:
    "Explain the supplied methodology, provenance, uncertainty scope, and limitations without adding unsupported claims.",
};

const PROHIBITED_NARRATIVE_PATTERNS: readonly {
  pattern: RegExp;
  label: string;
}[] = [
  { pattern: /\bcurrent conditions?\b/i, label: "current-condition claim" },
  { pattern: /\b(?:today|real[- ]time)\b/i, label: "current-condition claim" },
  {
    pattern: /\blive\s+(?:data|conditions?|dashboard|operations?|performance)\b/i,
    label: "current-condition claim",
  },
  {
    pattern: /\b(?:current|live)\s+(?:agency|operational|service)\s+performance\b/i,
    label: "current-agency-performance claim",
  },
  { pattern: /\b(?:resolved|fixed)\b/i, label: "physical-resolution claim" },
  { pattern: /\bphysical resolution\b/i, label: "physical-resolution claim" },
  {
    pattern: /\b(?:successfully completed|service (?:was )?delivered|problem (?:was )?eliminated)\b/i,
    label: "physical-service-delivery claim",
  },
  {
    pattern: /\b(?:physical outcome (?:was|is) (?:achieved|confirmed|delivered)|(?:achieved|confirmed|established|ensured|produced) (?:a )?physical outcome)\b/i,
    label: "physical-outcome claim",
  },
  { pattern: /\b(?:recommend(?:ed|ation|ations)?|optimal)\b/i, label: "normative recommendation" },
  {
    pattern: /\b(?:best (?:policy|selection scenario|scenario|plan|option|allocation|approach)|(?:policy|selection scenario|scenario|plan|option|allocation|approach)\s+is\s+(?:the\s+)?best)\b/i,
    label: "normative best-policy claim",
  },
  { pattern: /\bcapacity\b/i, label: "operational-capacity translation" },
  { pattern: /\b(?:forecast|forecasted|forecasting|predict|predicted|prediction)\b/i, label: "future prediction" },
  { pattern: /\b(?:causal|causality|caused by|causal impact)\b/i, label: "causal claim" },
  { pattern: /\b(?:guarantee|guaranteed|guarantees)\b/i, label: "guaranteed result" },
  { pattern: /\b(?:backlog|recommended plan)\b/i, label: "unsupported product terminology" },
  {
    pattern: /(?:\bK\b.{0,48}\b(?:staff|staffing|budget|inspection|case|resource)s?\b|\b(?:staff|staffing|budget|inspection|case|resource)s?\b.{0,48}\bK\b)/i,
    label: "resource translation of K",
  },
];

const ACTIONS_BY_TASK: Readonly<Record<AssistantTask, readonly AssistantAction["type"][]>> = {
  explain_active_tract: ["set_domain", "set_map_metric", "select_tracts", "set_workspace"],
  compare_selected_tracts: ["set_domain", "set_map_metric", "select_tracts", "set_workspace"],
  explain_neighborhood_context: ["set_domain", "set_map_metric", "set_neighborhood", "set_workspace"],
  explain_scenario_membership: ["set_domain", "set_scenario", "set_workspace"],
  explain_workload_replay: ["set_workload_assumptions", "set_workspace"],
  interpret_workload_assumptions: ["set_workload_assumptions", "set_workspace"],
  generate_hypotheses: [],
  draft_investigation_brief: [],
  explain_methodology_limitations: [],
};

export class AssistantBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantBoundaryError";
  }
}

export function getAssistantTaskInstruction(task: AssistantTask): string {
  return TASK_INSTRUCTIONS[task];
}

export function assertSafeNarrative(narrative: string): void {
  const normalized = narrative.normalize("NFKC");
  const violation = PROHIBITED_NARRATIVE_PATTERNS.find(({ pattern }) =>
    pattern.test(normalized)
  );
  if (violation) {
    throw new AssistantBoundaryError(
      `The interpretation crossed the ${violation.label} boundary.`,
    );
  }
}

/**
 * Builds a bounded reference catalog from validated client context and the
 * relevant server grounding selected for this request. The catalog contains no
 * user prompt text. Models reference values by ID; they never author a numeric
 * value or administrative label directly.
 */
export function createAssistantGroundingCatalog(
  context: AssistantContext,
  relevantServerGrounding: unknown,
): readonly AssistantGroundingReference[] {
  const references = new Map<string, AssistantGroundingReference>();
  const add = (reference: AssistantGroundingReference) => {
    if (references.size >= MAX_GROUNDING_REFERENCES ||
      references.has(reference.id)) return;
    references.set(reference.id, reference);
  };

  context.selectedTracts.forEach((tract, tractIndex) => {
    const base = `context.selectedTracts.${tractIndex}`;
    add({ id: `${base}.geoid`, kind: "text", value: tract.geoid });
    add({ id: `${base}.name`, kind: "text", value: tract.name });
    tract.complaintDetails?.complaintTypes.forEach((item, itemIndex) => {
      add({
        id: `${base}.complaintDetails.complaintTypes.${itemIndex}.complaintType`,
        kind: "complaint_type",
        value: item.complaintType,
      });
    });
    tract.complaintDetails?.agencies.forEach((item, itemIndex) => {
      add({
        id: `${base}.complaintDetails.agencies.${itemIndex}.agency`,
        kind: "agency",
        value: item.agency,
      });
    });
  });

  collectNumericReferences(context, "context", add, false);
  collectNumericReferences(
    relevantServerGrounding,
    "grounding",
    add,
    true,
  );
  return [...references.values()];
}

/**
 * Enforces task structure and resolves all factual reference tokens. Numeric
 * literals and administrative labels cannot enter the returned narrative
 * unless the server substitutes them from the bounded catalog.
 */
export function validateAndRenderAssistantResponse(
  response: AssistantModelResponse,
  task: AssistantTask,
  catalog: readonly AssistantGroundingReference[],
): GroundedAssistantResponse {
  assertTaskAwareStructure(response.narrative, task);

  const byId = new Map(catalog.map((reference) => [reference.id, reference]));
  const declared = response.references ?? [];
  const usedIds = [...response.narrative.matchAll(REFERENCE_TOKEN_PATTERN)]
    .map((match) => match[1]);
  const usedSet = new Set(usedIds);
  const declaredSet = new Set(declared);

  if (declaredSet.size !== declared.length ||
    usedSet.size !== declaredSet.size ||
    [...usedSet].some((id) => !declaredSet.has(id))) {
    throw new AssistantBoundaryError(
      "The interpretation's declared grounding references do not match its reference tokens.",
    );
  }
  for (const id of usedSet) {
    if (!byId.has(id)) {
      throw new AssistantBoundaryError(
        "The interpretation referenced a value outside the bounded grounding catalog.",
      );
    }
  }

  const proseOnly = response.narrative.replace(REFERENCE_TOKEN_PATTERN, "");
  if (proseOnly.includes("{{") || proseOnly.includes("}}")) {
    throw new AssistantBoundaryError(
      "The interpretation contained a malformed grounding reference.",
    );
  }
  if (NUMERIC_LITERAL_PATTERN.test(proseOnly) ||
    NUMERIC_WORD_PATTERN.test(proseOnly)) {
    throw new AssistantBoundaryError(
      "A numeric claim was not supplied through bounded grounding.",
    );
  }

  assertAdministrativeLabelsAreGrounded(response.narrative, proseOnly, catalog);

  const narrative = response.narrative.replace(
    REFERENCE_TOKEN_PATTERN,
    (_token, id: string) => String(byId.get(id)!.value),
  );
  assertSafeNarrative(narrative);
  return { narrative, action: response.action };
}

function assertTaskAwareStructure(
  narrative: string,
  task: AssistantTask,
): void {
  if (task === "generate_hypotheses") {
    const labelPattern = /(?:^|\n)\s*(?:#{1,6}\s*)?Hypothesis to investigate\s*:?\s*/gi;
    const labels = [...narrative.matchAll(labelPattern)];
    if (labels.length === 0) {
      throw new AssistantBoundaryError(
        'Generated hypotheses must use the label "Hypothesis to investigate".',
      );
    }
    for (const [index, label] of labels.entries()) {
      const contentStart = label.index + label[0].length;
      const contentEnd = labels[index + 1]?.index ?? narrative.length;
      if (!narrative.slice(contentStart, contentEnd).trim()) {
        throw new AssistantBoundaryError(
          'The label "Hypothesis to investigate" must introduce hypothesis content.',
        );
      }
    }
  }
  if (task !== "draft_investigation_brief") return;

  let priorHeadingIndex = -1;
  const sectionMatches: Array<{ index: number; end: number; title: string }> = [];
  for (const section of INVESTIGATION_BRIEF_SECTIONS) {
    const escaped = escapeRegExp(section);
    const heading = new RegExp(
      `(?:^|\\n)\\s*(?:#{1,6}\\s*)?${escaped}\\s*:?(?:\\s*\\n|$)`,
      "i",
    );
    const match = heading.exec(narrative);
    if (!match) {
      throw new AssistantBoundaryError(
        `An investigation brief must include the section "${section}".`,
      );
    }
    if (match.index <= priorHeadingIndex) {
      throw new AssistantBoundaryError(
        "Investigation-brief sections must follow the required order.",
      );
    }
    priorHeadingIndex = match.index;
    sectionMatches.push({
      index: match.index,
      end: match.index + match[0].length,
      title: section,
    });
  }
  for (const [index, section] of sectionMatches.entries()) {
    const nextIndex = sectionMatches[index + 1]?.index ?? narrative.length;
    if (!narrative.slice(section.end, nextIndex).trim()) {
      throw new AssistantBoundaryError(
        `The investigation-brief section "${section.title}" cannot be empty.`,
      );
    }
  }
}

function assertAdministrativeLabelsAreGrounded(
  narrative: string,
  proseOnly: string,
  catalog: readonly AssistantGroundingReference[],
): void {
  const labelReferences = catalog.filter((reference) =>
    reference.kind === "complaint_type" || reference.kind === "agency"
  );
  for (const reference of labelReferences) {
    const label = String(reference.value);
    if (label.length >= 2 && containsRawLabel(proseOnly, label)) {
      throw new AssistantBoundaryError(
        "A complaint-type or agency label was typed directly instead of using bounded grounding.",
      );
    }
  }

  const explicitLabelClaim = /\b(?:complaint[- ]type|agenc(?:y|ies))\b[^\n.!?,;]{0,120}\b(?:called|named|label(?:ed)?|including|such as|is|are|was|were)\b(?:(?:\{\{[A-Za-z0-9_.:-]{1,240}\}\})|[^\n.!?,;])*/gi;
  for (const match of narrative.matchAll(explicitLabelClaim)) {
    const referenceIds = [...match[0].matchAll(REFERENCE_TOKEN_PATTERN)]
      .map((token) => token[1]);
    const expectedKind = /^complaint[- ]type/i.test(match[0])
      ? "complaint_type"
      : "agency";
    if (referenceIds.length === 0 || referenceIds.some((id) => {
      const reference = catalog.find((candidate) => candidate.id === id);
      return reference?.kind !== expectedKind;
    })) {
      throw new AssistantBoundaryError(
        "A complaint-type or agency claim was not supplied through bounded grounding.",
      );
    }
  }

  // Administrative labels are commonly acronyms. Unknown all-capital tokens
  // are rejected; supported analytical abbreviations remain available.
  const permittedAcronyms = new Set([
    "ACS",
    "API",
    "BFS",
    "CSV",
    "GEOID",
    "JSON",
    "K",
    "LLM",
    "NYC",
    "NYCHA",
    "Q",
    "TIGER",
    "UI",
    "ZOD",
  ]);
  for (const match of proseOnly.matchAll(/\b[A-Z][A-Z/&-]{1,24}\b/g)) {
    if (!permittedAcronyms.has(match[0])) {
      throw new AssistantBoundaryError(
        "An administrative label was not supplied through bounded grounding.",
      );
    }
  }
}

function containsRawLabel(prose: string, label: string): boolean {
  const escaped = escapeRegExp(label);
  return new RegExp(
    `(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`,
    "i",
  ).test(prose);
}

function collectNumericReferences(
  value: unknown,
  path: string,
  add: (reference: AssistantGroundingReference) => void,
  extractFromStrings: boolean,
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    add({ id: path, kind: "number", value });
    return;
  }
  if (typeof value === "string" && extractFromStrings) {
    const matches = [...value.matchAll(NUMBER_IN_SOURCE_PATTERN)];
    matches.forEach((match, index) => {
      const parsed = Number(match[0].replaceAll(",", ""));
      if (Number.isFinite(parsed)) {
        add({ id: `${path}.number.${index}`, kind: "number", value: parsed });
      }
    });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectNumericReferences(
        item,
        `${path}.${index}`,
        add,
        extractFromStrings,
      ));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    collectNumericReferences(
      child,
      `${path}.${safeReferenceSegment(key)}`,
      add,
      extractFromStrings,
    );
  }
}

function safeReferenceSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_:-]/g, "_");
  return safe || "value";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assertActionAllowed(
  action: AssistantAction | null,
  task: AssistantTask,
  context: AssistantContext,
): void {
  if (!action) return;

  if (!ACTIONS_BY_TASK[task].includes(action.type)) {
    throw new AssistantBoundaryError(
      "The proposed control change is outside the selected interpretation task.",
    );
  }

  if (action.type === "select_tracts") {
    const suppliedGeoids = new Set(
      context.selectedTracts.map(({ geoid }) => geoid),
    );
    if (action.geoids.some((geoid) => !suppliedGeoids.has(geoid))) {
      throw new AssistantBoundaryError(
        "The proposed tract selection contains a GEOID absent from the bounded context.",
      );
    }
  }

  if (action.type === "set_workspace") {
    const expectedWorkspace = task.includes("scenario")
      ? "scenario"
      : task.includes("workload")
        ? "workload"
        : task === "explain_methodology_limitations" ||
            task === "generate_hypotheses" ||
            task === "draft_investigation_brief"
          ? null
          : "explore";
    if (!expectedWorkspace || action.workspace !== expectedWorkspace) {
      throw new AssistantBoundaryError(
        "The proposed workspace does not match the selected interpretation task.",
      );
    }
  }
}

export function isActionSafeForKnownGeoids(
  action: AssistantAction,
  knownGeoids: ReadonlySet<string>,
): boolean {
  if (action.type !== "select_tracts") return true;
  if (new Set(action.geoids).size !== action.geoids.length) return false;
  if (action.geoids.some((geoid) => !knownGeoids.has(geoid))) return false;
  return !action.activeGeoid || action.geoids.includes(action.activeGeoid);
}

export function parseAssistantModelText(text: string): AssistantModelResponse {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_MODEL_TEXT_LENGTH) {
    throw new AssistantBoundaryError(
      "The interpretation response was empty or exceeded its size limit.",
    );
  }

  const candidates = new Set<string>([trimmed]);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) candidates.add(fenced);
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.add(trimmed.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsedJson = JSON.parse(candidate) as unknown;
      const parsed = AssistantModelResponseSchema.safeParse(parsedJson);
      if (parsed.success) {
        // Reference IDs are machine-readable catalog paths, not authored
        // narrative. Validate the prose here, then validate the fully rendered
        // narrative again after server-side substitution.
        assertSafeNarrative(
          parsed.data.narrative.replace(REFERENCE_TOKEN_PATTERN, ""),
        );
        return parsed.data;
      }
    } catch (error) {
      if (error instanceof AssistantBoundaryError) throw error;
    }
  }

  throw new AssistantBoundaryError(
    "Claude returned an interpretation outside the supported response contract.",
  );
}
