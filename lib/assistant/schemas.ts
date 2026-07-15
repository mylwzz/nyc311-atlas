import { z } from "zod";

import {
  DOMAIN_KEYS,
  MAP_METRICS,
  NEIGHBORHOOD_METRICS,
  SAMPLE_STATUSES,
  SCALING_MODES,
} from "@/lib/domain";

const MAX_SELECTED_TRACTS = 5;
const MAX_TRACTS = 2_167;
const MAX_SCENARIO_TRACTS = 200;
const ARRIVAL_PERIOD_COUNT = 13;
const MAX_REPLAY_PERIODS = 19;

const GeoidSchema = z.string().regex(/^\d{11}$/);
const FiniteNumberSchema = z.number().finite();
const NonnegativeNumberSchema = FiniteNumberSchema.nonnegative();
const NonnegativeIntegerSchema = z.number().int().nonnegative();
// One validated scenario share is 100.00000000000001 from floating-point
// summation, matching the artifact contract's percentage tolerance.
const PercentageSchema = FiniteNumberSchema.min(0).max(
  100 + Number.EPSILON * 100,
);

const NullableResponseMetricsShape = {
  recordedClosureWithin30dPct: PercentageSchema.nullable(),
  recordedClosureWithin180dPct: PercentageSchema.nullable(),
  medianRecordedDaysToClose: NonnegativeNumberSchema.nullable(),
  notRecordedClosedWithin30dCount: NonnegativeIntegerSchema.nullable(),
  notRecordedClosedWithin180dCount: NonnegativeIntegerSchema.nullable(),
  notRecordedClosedWithin30dPer1000: NonnegativeNumberSchema.nullable(),
  notRecordedClosedWithin180dPer1000: NonnegativeNumberSchema.nullable(),
  expectedCohortOpenAt30d: NonnegativeNumberSchema.nullable(),
  expectedCohortOpenAt180d: NonnegativeNumberSchema.nullable(),
} as const;

const RESPONSE_METRIC_KEYS = Object.keys(
  NullableResponseMetricsShape,
) as (keyof typeof NullableResponseMetricsShape)[];

const AlphaSchema = z.union([
  z.literal(0),
  z.literal(0.1),
  z.literal(0.2),
  z.literal(0.3),
  z.literal(0.4),
  z.literal(0.5),
  z.literal(0.6),
  z.literal(0.7),
  z.literal(0.8),
  z.literal(0.9),
  z.literal(1),
]);

const KSchema = z.union([
  z.literal(25),
  z.literal(50),
  z.literal(100),
  z.literal(150),
  z.literal(200),
]);

const RadiusSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const ASSISTANT_TASKS = [
  "explain_active_tract",
  "compare_selected_tracts",
  "explain_neighborhood_context",
  "explain_scenario_membership",
  "explain_workload_replay",
  "interpret_workload_assumptions",
  "generate_hypotheses",
  "draft_investigation_brief",
  "explain_methodology_limitations",
] as const;

export const AssistantTaskSchema = z.enum(ASSISTANT_TASKS);
export type AssistantTask = z.infer<typeof AssistantTaskSchema>;

const ActiveDomainResponseSchema = z.strictObject({
  sampleStatus: z.enum(SAMPLE_STATUSES),
  requestCount: NonnegativeIntegerSchema,
  knownTimingOutcomes30d: NonnegativeIntegerSchema,
  knownTimingOutcomes180d: NonnegativeIntegerSchema,
  validRecordedClosures: NonnegativeIntegerSchema,
  ...NullableResponseMetricsShape,
}).superRefine((response, context) => {
  const expectedStatus = response.requestCount === 0
    ? "no_requests"
    : response.knownTimingOutcomes30d === 0
      ? "no_known_timing"
      : response.knownTimingOutcomes30d < 30
        ? "insufficient_sample"
        : "sufficient";
  if (response.sampleStatus !== expectedStatus) {
    context.addIssue({
      code: "custom",
      message: "The response sample status does not match its artifact counts.",
      path: ["sampleStatus"],
    });
  }

  if (response.sampleStatus !== "sufficient") {
    for (const key of RESPONSE_METRIC_KEYS) {
      if (response[key] !== null) {
        context.addIssue({
          code: "custom",
          message: "Sparse response states cannot include derived response values.",
          path: [key],
        });
      }
    }
    return;
  }

  for (const key of [
    "recordedClosureWithin30dPct",
    "recordedClosureWithin180dPct",
    "notRecordedClosedWithin30dCount",
    "notRecordedClosedWithin180dCount",
    "expectedCohortOpenAt30d",
    "expectedCohortOpenAt180d",
  ] as const) {
    if (response[key] === null) {
      context.addIssue({
        code: "custom",
        message: "Sufficient response states require this artifact value.",
        path: [key],
      });
    }
  }
});

const ActiveMapMetricSchema = z.strictObject({
  key: z.enum(MAP_METRICS),
  value: z.union([FiniteNumberSchema, z.boolean()]).nullable(),
  available: z.boolean(),
  unavailableReason: z.string().trim().min(1).max(160).nullable(),
}).superRefine((metric, context) => {
  if (metric.available !== (metric.value !== null)) {
    context.addIssue({
      code: "custom",
      message: "Map metric availability and value disagree.",
      path: ["value"],
    });
  }
  if (metric.available !== (metric.unavailableReason === null)) {
    context.addIssue({
      code: "custom",
      message: "Map metric availability and unavailable reason disagree.",
      path: ["unavailableReason"],
    });
  }
});

const ComplaintDetailsSchema = z.strictObject({
  complaintTypes: z.array(z.strictObject({
    complaintType: z.string().trim().min(1).max(160),
    count: z.number().int().positive(),
    sharePct: PercentageSchema,
  })).max(5),
  agencies: z.array(z.strictObject({
    agency: z.string().trim().min(1).max(80),
    count: z.number().int().positive(),
    sharePct: PercentageSchema,
  })).max(3),
});

const SelectedTractSchema = z.strictObject({
  geoid: GeoidSchema,
  name: z.string().trim().min(1).max(160),
  population: NonnegativeIntegerSchema.nullable(),
  medianHouseholdIncome: NonnegativeNumberSchema.nullable(),
  allocationEligible: z.boolean(),
  allocationIneligibilityReason: z
    .enum(["missing_population", "population_below_500", "missing_income"])
    .nullable(),
  mappedComplaintCount: NonnegativeIntegerSchema,
  complaintsPer1000: NonnegativeNumberSchema.nullable(),
  responseSampleStatus: z.enum(SAMPLE_STATUSES),
  activeDomainResponse: ActiveDomainResponseSchema,
  activeMapMetric: ActiveMapMetricSchema,
  complaintDetails: ComplaintDetailsSchema.nullable(),
  active: z.boolean(),
}).superRefine((tract, context) => {
  if (tract.allocationEligible !==
    (tract.allocationIneligibilityReason === null)) {
    context.addIssue({
      code: "custom",
      message: "Allocation eligibility and ineligibility reason disagree.",
      path: ["allocationEligible"],
    });
  }
  if (tract.responseSampleStatus !== tract.activeDomainResponse.sampleStatus) {
    context.addIssue({
      code: "custom",
      message: "Response sample statuses disagree.",
      path: ["responseSampleStatus"],
    });
  }
});

const NeighborhoodSummarySchema = z.strictObject({
  activeValue: FiniteNumberSchema,
  neighborhoodMedian: FiniteNumberSchema,
  absoluteDifference: FiniteNumberSchema,
  relativeDifferencePct: FiniteNumberSchema.nullable(),
  symmetricDifference: FiniteNumberSchema.min(-1).max(1),
  activeRank: z.number().int().positive().max(MAX_TRACTS),
  includedTractCount: z.number().int().positive().max(MAX_TRACTS),
  availableTractCount: z.number().int().positive().max(MAX_TRACTS),
});

const NeighborhoodContextSchema = z.strictObject({
  radius: RadiusSchema,
  includedTractCount: z.number().int().positive().max(MAX_TRACTS),
  isIsland: z.boolean(),
  metric: z.enum(NEIGHBORHOOD_METRICS),
  summary: NeighborhoodSummarySchema.nullable(),
});

const IntervalSchema = z.strictObject({
  openMedian: NonnegativeNumberSchema,
  open80: z.tuple([NonnegativeNumberSchema, NonnegativeNumberSchema]),
  open95: z.tuple([NonnegativeNumberSchema, NonnegativeNumberSchema]),
  closureMedianPct: PercentageSchema,
  closure80Pct: z.tuple([PercentageSchema, PercentageSchema]),
  closure95Pct: z.tuple([PercentageSchema, PercentageSchema]),
});

const ScenarioMetricsSchema = z.strictObject({
  selectedComplaintIntensitySum: NonnegativeNumberSchema,
  intensityRetentionVsRateMaxPct: PercentageSchema,
  selectedQ1TractSharePct: PercentageSchema,
  q1ShareOfSelectedIntensityPct: PercentageSchema,
  selectedMappedComplaintCount: NonnegativeIntegerSchema,
  mappedComplaintVolumeCapturedPct: PercentageSchema,
  selectedNotClosedBy30dCount: NonnegativeIntegerSchema,
  cityNotClosedBy30dCapturedPct: PercentageSchema,
  selectedNotClosedBy180dCount: NonnegativeIntegerSchema,
  cityNotClosedBy180dCapturedPct: PercentageSchema,
  pooledRecordedClosureWithin30dPct: PercentageSchema,
  pooledRecordedClosureWithin180dPct: PercentageSchema,
  selectedMean30dArrivals: NonnegativeNumberSchema,
  selectedOpenAt30d: NonnegativeNumberSchema,
  selectedOpenAt180d: NonnegativeNumberSchema,
  selectedOpenAt30dSampleStatus: z.literal("sufficient"),
  selectedOpenAt180dSampleStatus: z.literal("sufficient"),
  selectedOpenAt30dUncertainty: IntervalSchema,
  selectedOpenAt180dUncertainty: IntervalSchema,
  selectedKnownTimingOutcomes30d: NonnegativeIntegerSchema,
  selectedKnownTimingOutcomes180d: NonnegativeIntegerSchema,
  selectedPopulation: NonnegativeIntegerSchema,
  cityPopulationInSelectedTractsPct: PercentageSchema,
  meanSelectedTractMedianIncome: NonnegativeNumberSchema,
  medianSelectedTractMedianIncome: NonnegativeNumberSchema,
});

const ScenarioContextSchema = z.strictObject({
  id: z.string().trim().min(1).max(180),
  scalingMode: z.enum(SCALING_MODES),
  domainKey: z.enum(DOMAIN_KEYS),
  priorityPortfolioSize: KSchema,
  alphaIntensity: AlphaSchema,
  alphaLowerIncome: AlphaSchema,
  selectionCutoffScore: FiniteNumberSchema,
  selectedTractCount: z.number().int().positive().max(MAX_SCENARIO_TRACTS),
  metrics: ScenarioMetricsSchema,
  manualComparisonMembership: z.array(
    z.strictObject({
      geoid: GeoidSchema,
      selected: z.boolean(),
      rank: z.number().int().positive().max(MAX_SCENARIO_TRACTS).nullable(),
    }),
  ).max(MAX_SELECTED_TRACTS),
});

const WorkloadContextSchema = z.strictObject({
  view: z.enum(["historical", "scenario"]),
  scope: z.enum([
    "active_tract",
    "selected_tracts",
    "active_neighborhood",
    "current_scenario",
    "pinned_scenario",
  ]),
  tractCount: z.number().int().positive().max(MAX_TRACTS),
  requestCount: NonnegativeIntegerSchema,
  knownTiming: NonnegativeIntegerSchema,
  sampleStatus: z.enum(SAMPLE_STATUSES),
  periodArrivals: z.array(NonnegativeNumberSchema).length(ARRIVAL_PERIOD_COUNT),
  meanCompletePeriodArrivals: NonnegativeNumberSchema,
  assumptions: z.strictObject({
    demandChangePct: FiniteNumberSchema.min(-30).max(50),
    closureCurveShiftPoints: FiniteNumberSchema.min(-15).max(15),
  }),
  expectedOpenAtAge30: NonnegativeNumberSchema.nullable(),
  expectedOpenAtAge180: NonnegativeNumberSchema.nullable(),
  replay: z.array(
    z.strictObject({
      periodIndex: NonnegativeIntegerSchema,
      newRequests: NonnegativeNumberSchema,
      expectedRecordedClosures: NonnegativeNumberSchema,
      expectedOpenBalance: NonnegativeNumberSchema,
      netOpenChange: FiniteNumberSchema,
    }),
  ).max(MAX_REPLAY_PERIODS).nullable(),
});

export const AssistantActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("set_workspace"),
    workspace: z.enum(["explore", "scenario", "workload"]),
  }),
  z.strictObject({
    type: z.literal("set_domain"),
    domain: z.enum(DOMAIN_KEYS),
  }),
  z.strictObject({
    type: z.literal("set_map_metric"),
    metric: z.enum(MAP_METRICS),
  }),
  z.strictObject({
    type: z.literal("select_tracts"),
    geoids: z.array(GeoidSchema).max(MAX_SELECTED_TRACTS),
    activeGeoid: GeoidSchema.optional(),
  }).superRefine(({ geoids, activeGeoid }, context) => {
    if (new Set(geoids).size !== geoids.length) {
      context.addIssue({
        code: "custom",
        message: "A proposed tract selection cannot contain duplicate GEOIDs.",
        path: ["geoids"],
      });
    }
    if (activeGeoid && !geoids.includes(activeGeoid)) {
      context.addIssue({
        code: "custom",
        message: "The proposed active tract must be included in the selection.",
        path: ["activeGeoid"],
      });
    }
  }),
  z.strictObject({
    type: z.literal("set_neighborhood"),
    enabled: z.boolean(),
    radius: RadiusSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("set_scenario"),
    scalingMode: z.enum(SCALING_MODES),
    domain: z.enum(DOMAIN_KEYS),
    k: KSchema,
    alpha: AlphaSchema,
  }),
  z.strictObject({
    type: z.literal("set_workload_assumptions"),
    demandChangePct: FiniteNumberSchema.min(-30).max(50),
    closureCurveShiftPoints: FiniteNumberSchema.min(-15).max(15),
  }),
]);

export const AssistantContextSchema = z.strictObject({
  workspace: z.enum(["explore", "scenario", "workload"]),
  activeDomain: z.enum(DOMAIN_KEYS),
  activeMapMetric: z.enum(MAP_METRICS),
  selectedTracts: z.array(SelectedTractSchema).max(MAX_SELECTED_TRACTS),
  activeNeighborhood: NeighborhoodContextSchema.nullable(),
  currentScenario: ScenarioContextSchema.nullable(),
  pinnedScenario: ScenarioContextSchema.nullable(),
  workload: WorkloadContextSchema.nullable(),
}).superRefine((assistantContext, refinement) => {
  assistantContext.selectedTracts.forEach((tract, index) => {
    if (tract.activeMapMetric.key !== assistantContext.activeMapMetric) {
      refinement.addIssue({
        code: "custom",
        message: "The tract map metric does not match the active map metric.",
        path: ["selectedTracts", index, "activeMapMetric", "key"],
      });
    }
  });
});

export const AssistantRequestSchema = z.strictObject({
  task: AssistantTaskSchema,
  prompt: z.string().trim().min(1).max(2_000),
  context: AssistantContextSchema,
}).superRefine(({ task, context }, refinement) => {
  if (
    task === "explain_active_tract" &&
    !context.selectedTracts.some((tract) => tract.active)
  ) {
    refinement.addIssue({
      code: "custom",
      message: "Explaining an active tract requires an active tract in context.",
      path: ["context", "selectedTracts"],
    });
  }
  if (task === "compare_selected_tracts" && context.selectedTracts.length < 2) {
    refinement.addIssue({
      code: "custom",
      message: "Comparing tracts requires at least two selected tracts.",
      path: ["context", "selectedTracts"],
    });
  }
  if (task === "explain_neighborhood_context" && !context.activeNeighborhood) {
    refinement.addIssue({
      code: "custom",
      message: "Explaining neighborhood context requires a neighborhood in context.",
      path: ["context", "activeNeighborhood"],
    });
  }
  if (task === "explain_scenario_membership" && !context.currentScenario) {
    refinement.addIssue({
      code: "custom",
      message: "Explaining scenario membership requires a selection scenario in context.",
      path: ["context", "currentScenario"],
    });
  }
  if (
    (task === "explain_workload_replay" ||
      task === "interpret_workload_assumptions") &&
    !context.workload
  ) {
    refinement.addIssue({
      code: "custom",
      message: "Explaining workload results requires workload context.",
      path: ["context", "workload"],
    });
  }
});

export const AssistantModelResponseSchema = z.strictObject({
  narrative: z.string().trim().min(1).max(8_000),
  action: AssistantActionSchema.nullable(),
  references: z.array(
    z.string().regex(/^[A-Za-z0-9_.:-]{1,240}$/),
  ).max(128).optional(),
}).superRefine((response, context) => {
  if (response.references &&
    new Set(response.references).size !== response.references.length) {
    context.addIssue({
      code: "custom",
      message: "Grounding references cannot be duplicated.",
      path: ["references"],
    });
  }
});

export type AssistantAction = z.infer<typeof AssistantActionSchema>;
export type AssistantContext = z.infer<typeof AssistantContextSchema>;
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;
export type AssistantModelResponse = z.infer<
  typeof AssistantModelResponseSchema
>;
