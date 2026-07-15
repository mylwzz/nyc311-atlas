import { z } from "zod";

import {
  AGE_CHECKPOINTS_DAYS,
  ALPHA_VALUES,
  ARTIFACT_FILES,
  ARTIFACT_RELATIVE_PATHS,
  BOROUGHS,
  COUNTY_NAMES,
  DOMAIN_COUNT_METRICS,
  DOMAIN_INTENSITY_METRICS,
  DOMAIN_KEYS,
  DOMAIN_LABELS,
  DOMAIN_PROPERTY_PREFIXES,
  FULL_PERIOD_INDICES,
  INCOME_QUINTILES,
  K_VALUES,
  MODEL_VERSION,
  SCALING_MODES,
  SCHEMA_VERSION,
  WORKLOAD_SAMPLE_STATUSES,
  type ArtifactFile,
  type DomainKey,
} from "./constants";

const finiteNumber = z.number().finite();
const nonnegativeNumber = finiteNumber.nonnegative();
const integer = z.number().int();
const nonnegativeInteger = integer.nonnegative();
const positiveInteger = integer.positive();
// One exported share is 100.00000000000001 due to floating-point summation.
const percentage = finiteNumber.min(0).max(100 + Number.EPSILON * 100);
const geoid = z.string().regex(/^\d{11}$/);
const generatedTimestamp = z.iso.datetime({ offset: true });
const localTimestamp = z.iso.datetime({ local: true });

const tuple2 = z.tuple([finiteNumber, finiteNumber]);
const interval = z.strictObject({
  openMedian: nonnegativeNumber,
  open80: tuple2,
  open95: tuple2,
  closureMedianPct: percentage,
  closure80Pct: z.tuple([percentage, percentage]),
  closure95Pct: z.tuple([percentage, percentage]),
});

export const GeoidSchema = geoid;
export const DomainKeySchema = z.enum(DOMAIN_KEYS);
export const ScalingModeSchema = z.enum(SCALING_MODES);
export const BoroughSchema = z.enum(BOROUGHS);
export const CountyNameSchema = z.enum(COUNTY_NAMES);
export const IncomeQuintileSchema = z.enum(INCOME_QUINTILES);
export const WorkloadSampleStatusSchema = z.enum(WORKLOAD_SAMPLE_STATUSES);
export const WorkloadIntervalSchema = interval;

const alpha = z.union(ALPHA_VALUES.map((value) => z.literal(value)));
const kValue = z.union(K_VALUES.map((value) => z.literal(value)));

function exactArray<Value>(
  item: z.ZodType<Value>,
  expected: readonly Value[],
) {
  return z.array(item).length(expected.length).refine(
    (actual) => actual.every((value, index) => value === expected[index]),
    { message: "Array values or order do not match the artifact contract" },
  );
}

function domainRecordSchema<Value extends z.ZodType>(value: Value) {
  return z.strictObject({
    noise: value,
    housing_building: value,
    sanitation_environmental: value,
    street_infrastructure: value,
    public_safety_quality_of_life: value,
  });
}

function boroughRecordSchema<Value extends z.ZodType>(value: Value) {
  return z.strictObject({
    Bronx: value,
    Brooklyn: value,
    Manhattan: value,
    Queens: value,
    "Staten Island": value,
  });
}

function quintileRecordSchema<Value extends z.ZodType>(value: Value) {
  return z.strictObject({
    Q1_low: value,
    Q2: value,
    Q3: value,
    Q4: value,
    Q5_high: value,
  });
}

export const ArtifactEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  modelVersion: z.literal(MODEL_VERSION),
  artifactSetId: z.string().regex(/^\d{8}T\d{6}Z-[a-f0-9]{8}$/),
});

const artifactFile = z.enum(ARTIFACT_FILES);

export const ManifestFileSchema = z.strictObject({
  file: artifactFile,
  relativePath: z.string().min(1),
  byteSize: positiveInteger,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  recordCount: nonnegativeInteger,
});

export const ManifestSchema = ArtifactEnvelopeSchema.extend({
  project: z.literal("NYC 311 Priority Atlas"),
  generatedAtUtc: generatedTimestamp,
  files: z.array(ManifestFileSchema).length(ARTIFACT_FILES.length),
}).superRefine(({ files }, context) => {
  const seen = new Set<ArtifactFile>();
  for (const entry of files) {
    if (seen.has(entry.file)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate manifest entry for ${entry.file}`,
        path: ["files"],
      });
    }
    seen.add(entry.file);
    if (entry.relativePath !== ARTIFACT_RELATIVE_PATHS[entry.file]) {
      context.addIssue({
        code: "custom",
        message: `Unexpected path for ${entry.file}`,
        path: ["files", entry.file, "relativePath"],
      });
    }
  }
  for (const file of ARTIFACT_FILES) {
    if (!seen.has(file)) {
      context.addIssue({
        code: "custom",
        message: `Missing manifest entry for ${file}`,
        path: ["files"],
      });
    }
  }
});

const defaults = z.strictObject({
  domainKey: z.literal("housing_building"),
  scalingMode: z.literal("rank_balanced"),
  k: z.literal(100),
  alphaIntensity: z.literal(0.5),
});

export const MetadataSchema = ArtifactEnvelopeSchema.extend({
  project: z.literal("NYC 311 Priority Atlas"),
  generatedAtUtc: generatedTimestamp,
  snapshotYear: z.literal(2016),
  defaults,
  sources: z.strictObject({
    serviceRequests: z.string().min(1),
    tractDemographics: z.string().min(1),
    tractGeometry: z.string().min(1),
    boroughIncome: z.string().min(1),
  }),
  scenarioGrid: z.strictObject({
    scalingModes: z.tuple([
      z.literal("rank_balanced"),
      z.literal("magnitude_sensitive"),
    ]),
    serviceDomains: exactArray(DomainKeySchema, DOMAIN_KEYS),
    kValues: exactArray(kValue, K_VALUES),
    alphaValues: exactArray(alpha, ALPHA_VALUES),
    totalScenarios: z.literal(550),
  }),
  eligibility: z.strictObject({
    allMapTracts: z.literal(2167),
    populationThreshold: z.literal(500),
    allocationEligibleTracts: z.literal(2093),
  }),
  workload: z.strictObject({
    periodDays: z.literal(30),
    arrivalPeriods: z.literal(13),
    fullArrivalPeriods: z.literal(12),
    ageCheckpointsDays: exactArray(positiveInteger, AGE_CHECKPOINTS_DAYS),
    uncertaintyDraws: z.literal(1000),
    minimumComparisonSample: z.literal(30),
    sparseTractDomainFallback: z.null(),
    aggregatePoolingAllowed: z.literal(true),
    zeroIsNeverMissingClosureProbability: z.literal(true),
    usesActualHistoricalArrivalPeriods: z.literal(true),
    usesRecordedAdministrativeClosure: z.literal(true),
    isFutureForecast: z.literal(false),
    isCausalInterventionModel: z.literal(false),
    isFullAgencyBacklog: z.literal(false),
  }),
  dataAudit: z.strictObject({
    raw_311_rows: nonnegativeInteger,
    raw_acs_rows: nonnegativeInteger,
    raw_tiger_tract_rows: nonnegativeInteger,
    acs_rows_after_identifier_row_removed: nonnegativeInteger,
    nyc_acs_tract_rows_before_tiger_merge: nonnegativeInteger,
    requests_with_parseable_created_date: nonnegativeInteger,
    requests_2016: nonnegativeInteger,
    requests_2016_missing_coordinates: nonnegativeInteger,
    requests_2016_with_valid_coordinates: nonnegativeInteger,
    requests_classified_into_five_domains: nonnegativeInteger,
    requests_classified_as_other: nonnegativeInteger,
    complaint_types_observed: nonnegativeInteger,
    complaint_types_mapped_to_five_domains: nonnegativeInteger,
    requests_spatially_matched_to_tract: nonnegativeInteger,
    requests_not_matched_to_tract: nonnegativeInteger,
    requests_retained_after_spatial_match: nonnegativeInteger,
    all_map_tracts: nonnegativeInteger,
    tracts_before_population_filter: nonnegativeInteger,
    tracts_after_population_filter: nonnegativeInteger,
    tracts_removed_by_population_filter: nonnegativeInteger,
    population_threshold: nonnegativeInteger,
    allMapTracts: nonnegativeInteger,
    populationFilteredTracts: nonnegativeInteger,
    allocationEligibleTracts: nonnegativeInteger,
    supportedScalingModes: nonnegativeInteger,
    supportedServiceDomains: nonnegativeInteger,
    supportedKValues: nonnegativeInteger,
    supportedAlphaValues: nonnegativeInteger,
    totalSupportedScenarios: nonnegativeInteger,
    workloadTractDomainRecords: nonnegativeInteger,
    arrivalPeriods: nonnegativeInteger,
    fullArrivalPeriods: nonnegativeInteger,
    requestAgeCheckpoints: nonnegativeInteger,
  }),
});

function domainContextSchema<Key extends DomainKey>(key: Key) {
  return z.strictObject({
    label: z.literal(DOMAIN_LABELS[key]),
    countMetric: z.literal(DOMAIN_COUNT_METRICS[key]),
    intensityMetric: z.literal(DOMAIN_INTENSITY_METRICS[key]),
    propertyPrefix: z.literal(DOMAIN_PROPERTY_PREFIXES[key]),
  });
}

const domainContextSchemas = {
  noise: domainContextSchema("noise"),
  housing_building: domainContextSchema("housing_building"),
  sanitation_environmental: domainContextSchema("sanitation_environmental"),
  street_infrastructure: domainContextSchema("street_infrastructure"),
  public_safety_quality_of_life: domainContextSchema(
    "public_safety_quality_of_life",
  ),
};

const incomeQuintileAnalysis = z.strictObject({
  label: z.string().min(1),
  eligibleTractCount: z.literal(2093),
  meanTractComplaintIntensityByIncomeQuintile:
    quintileRecordSchema(nonnegativeNumber),
  medianTractComplaintIntensityByIncomeQuintile:
    quintileRecordSchema(nonnegativeNumber),
  complaintCountByIncomeQuintile: quintileRecordSchema(nonnegativeInteger),
  populationByIncomeQuintile: quintileRecordSchema(nonnegativeInteger),
  q1OverQ5MeanIntensityRatio: nonnegativeNumber,
  q1MinusQ5MeanIntensity: finiteNumber,
  pearsonIncomeIntensityCorrelation: finiteNumber.min(-1).max(1),
  spearmanIncomeIntensityCorrelation: finiteNumber.min(-1).max(1),
});

const complaintMetricRecord = z.strictObject({
  "Noise Complaints": nonnegativeNumber,
  "Housing and Building Complaints": nonnegativeNumber,
  "Sanitation and Environmental Complaints": nonnegativeNumber,
  "Street and Infrastructure Complaints": nonnegativeNumber,
  "Public Safety and Quality of Life Complaints": nonnegativeNumber,
});

const boroughProfile = z.strictObject({
  borough: BoroughSchema,
  county: CountyNameSchema,
  population: nonnegativeInteger,
  median_household_income: nonnegativeNumber,
  complaint_counts: complaintMetricRecord,
  complaint_rates_per_1000: complaintMetricRecord,
});

export const ContextSchema = ArtifactEnvelopeSchema.extend({
  serviceDomains: z.strictObject(domainContextSchemas),
  scalingModes: z.strictObject({
    rank_balanced: z.strictObject({
      label: z.literal("Rank-balanced"),
      description: z.string().min(1),
    }),
    magnitude_sensitive: z.strictObject({
      label: z.literal("Magnitude-sensitive"),
      description: z.string().min(1),
    }),
  }),
  incomeQuintileAnalysis: domainRecordSchema(incomeQuintileAnalysis),
  boroughProfiles: z.strictObject({
    "Bronx County": boroughProfile,
    "Kings County": boroughProfile,
    "New York County": boroughProfile,
    "Queens County": boroughProfile,
    "Richmond County": boroughProfile,
  }),
  boroughContextMetadata: z.strictObject({
    population: z.strictObject({
      dataset: z.string().min(1),
      source_field: z.string().min(1),
      source_geography: z.string().min(1),
      aggregation: z.string().min(1),
      allocation_population_filter_applied: z.literal(false),
      limitation: z.string().min(1),
    }),
    median_household_income: z.strictObject({
      dataset: z.string().min(1),
      variable: z.string().min(1),
      source_geography: z.string().min(1),
      aggregation: z.null(),
      note: z.string().min(1),
    }),
    complaint_rate: z.strictObject({
      numerator: z.string().min(1),
      denominator: z.string().min(1),
      unit: z.string().min(1),
    }),
  }),
});

const domainMapPropertyShape = (prefix: string) => ({
  [`${prefix}ComplaintCount`]: nonnegativeInteger,
  [`${prefix}ComplaintRatePer1000`]: nonnegativeNumber.nullable(),
  [`${prefix}ComplaintIntensityZ`]: finiteNumber.nullable(),
  [`${prefix}ComplaintIntensityPercentile`]: finiteNumber.min(0).max(1).nullable(),
  [`${prefix}KnownClosureTimingOutcomes30d`]: nonnegativeInteger,
  [`${prefix}RecordedClosureWithin30dPct`]: percentage.nullable(),
  [`${prefix}KnownClosureTimingOutcomes180d`]: nonnegativeInteger,
  [`${prefix}RecordedClosureWithin180dPct`]: percentage.nullable(),
  [`${prefix}ValidRecordedClosures`]: nonnegativeInteger,
  [`${prefix}MedianRecordedDaysToClose`]: nonnegativeNumber.nullable(),
  [`${prefix}NotRecordedClosedWithin30dCount`]: nonnegativeInteger,
  [`${prefix}NotRecordedClosedWithin180dCount`]: nonnegativeInteger,
  [`${prefix}NotRecordedClosedWithin30dPer1000`]: nonnegativeNumber.nullable(),
  [`${prefix}NotRecordedClosedWithin180dPer1000`]: nonnegativeNumber.nullable(),
  [`${prefix}Mean30dArrivals`]: nonnegativeNumber,
  [`${prefix}Median30dArrivals`]: nonnegativeNumber,
  [`${prefix}P10_30dArrivals`]: nonnegativeNumber,
  [`${prefix}P90_30dArrivals`]: nonnegativeNumber,
  [`${prefix}OpenAt30d`]: nonnegativeNumber.nullable(),
  [`${prefix}OpenAt180d`]: nonnegativeNumber.nullable(),
  [`${prefix}ResponseSampleStatus`]: WorkloadSampleStatusSchema,
  [`${prefix}SupportsTractSpecificReplay`]: z.boolean(),
  [`${prefix}ResponseSampleSufficient30d`]: z.boolean(),
  [`${prefix}ResponseSampleSufficient180d`]: z.boolean(),
  [`${prefix}MedianClosureSampleSufficient`]: z.boolean(),
});

const tractFeaturePropertyShape = {
  geoid,
  tractName: z.string().min(1),
  borough: BoroughSchema,
  county: CountyNameSchema,
  population: nonnegativeInteger.nullable(),
  medianHouseholdIncome: nonnegativeNumber.nullable(),
  incomeQuintile: IncomeQuintileSchema.nullable(),
  allocationEligible: z.boolean(),
  allocationIneligibilityReason: z
    .enum(["missing_population", "population_below_500", "missing_income"])
    .nullable(),
  lowerIncomePriorityZ: finiteNumber.nullable(),
  lowerIncomePriorityPercentile: finiteNumber.min(0).max(1).nullable(),
  queenNeighborGeoids: z.array(geoid),
  ...domainMapPropertyShape("noise"),
  ...domainMapPropertyShape("housingBuilding"),
  ...domainMapPropertyShape("sanitationEnvironmental"),
  ...domainMapPropertyShape("streetInfrastructure"),
  ...domainMapPropertyShape("publicSafetyQualityOfLife"),
};

export const TractFeaturePropertiesSchema = z
  .strictObject(tractFeaturePropertyShape)
  .superRefine((properties, context) => {
    if (properties.allocationEligible !==
      (properties.allocationIneligibilityReason === null)) {
      context.addIssue({
        code: "custom",
        message: "Eligibility and ineligibility reason disagree",
        path: ["allocationEligible"],
      });
    }
    for (const prefix of Object.values(DOMAIN_PROPERTY_PREFIXES)) {
      const value = properties as Record<string, unknown>;
      const requestCount = value[`${prefix}ComplaintCount`] as number;
      const knownTiming = value[`${prefix}KnownClosureTimingOutcomes30d`] as number;
      const validClosures = value[`${prefix}ValidRecordedClosures`] as number;
      const status = value[`${prefix}ResponseSampleStatus`] as string;
      const expectedStatus = requestCount === 0
        ? "no_requests"
        : knownTiming === 0
          ? "no_known_timing"
          : knownTiming < 30
            ? "insufficient_sample"
            : "sufficient";
      if (status !== expectedStatus) {
        context.addIssue({
          code: "custom",
          message: `${prefix} sample status disagrees with raw counts`,
          path: [`${prefix}ResponseSampleStatus`],
        });
      }
      const isSufficient = status === "sufficient";
      for (const suffix of [
        "RecordedClosureWithin30dPct",
        "RecordedClosureWithin180dPct",
        "OpenAt30d",
        "OpenAt180d",
      ]) {
        if ((value[`${prefix}${suffix}`] !== null) !== isSufficient) {
          context.addIssue({
            code: "custom",
            message: `${prefix}${suffix} violates sparse suppression`,
            path: [`${prefix}${suffix}`],
          });
        }
      }
      if ((value[`${prefix}MedianRecordedDaysToClose`] !== null) !==
        (validClosures >= 30)) {
        context.addIssue({
          code: "custom",
          message: `${prefix} median closure sample flag disagrees with value`,
          path: [`${prefix}MedianRecordedDaysToClose`],
        });
      }
      for (const suffix of [
        "SupportsTractSpecificReplay",
        "ResponseSampleSufficient30d",
        "ResponseSampleSufficient180d",
      ]) {
        if (value[`${prefix}${suffix}`] !== isSufficient) {
          context.addIssue({
            code: "custom",
            message: `${prefix}${suffix} disagrees with sample status`,
            path: [`${prefix}${suffix}`],
          });
        }
      }
      if (value[`${prefix}MedianClosureSampleSufficient`] !==
        (validClosures >= 30)) {
        context.addIssue({
          code: "custom",
          message: `${prefix} median-closure flag disagrees with count`,
          path: [`${prefix}MedianClosureSampleSufficient`],
        });
      }
    }
  });

const position = z.tuple([finiteNumber, finiteNumber]);
const linearRing = z.array(position).min(4);
const polygonCoordinates = z.array(linearRing).min(1);

export const TractGeometrySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("Polygon"),
    coordinates: polygonCoordinates,
  }),
  z.strictObject({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(polygonCoordinates).min(1),
  }),
]);

export const TractFeatureSchema = z.strictObject({
  type: z.literal("Feature"),
  properties: TractFeaturePropertiesSchema,
  geometry: TractGeometrySchema,
});

export const TractsGeoJsonSchema = ArtifactEnvelopeSchema.extend({
  type: z.literal("FeatureCollection"),
  features: z.array(TractFeatureSchema),
});

const complaintTypeDetail = z.strictObject({
  complaintType: z.string().min(1),
  count: positiveInteger,
  sharePct: percentage,
});

const agencyDetail = z.strictObject({
  agency: z.string().min(1),
  count: positiveInteger,
  sharePct: percentage,
});

const tractDetailsRecord = z.strictObject({
  topComplaintTypesByDomain: domainRecordSchema(
    z.array(complaintTypeDetail).max(10),
  ),
  topAgenciesByDomain: domainRecordSchema(z.array(agencyDetail).max(5)),
});

export const TractDetailsSchema = ArtifactEnvelopeSchema.extend({
  tracts: z.record(geoid, tractDetailsRecord),
});

const scenarioMetrics = z.strictObject({
  selectedComplaintIntensitySum: nonnegativeNumber,
  intensityRetentionVsRateMaxPct: percentage,
  selectedQ1TractSharePct: percentage,
  q1ShareOfSelectedIntensityPct: percentage,
  selectedMappedComplaintCount: nonnegativeInteger,
  mappedComplaintVolumeCapturedPct: percentage,
  selectedNotClosedBy30dCount: nonnegativeInteger,
  cityNotClosedBy30dCapturedPct: percentage,
  selectedNotClosedBy180dCount: nonnegativeInteger,
  cityNotClosedBy180dCapturedPct: percentage,
  pooledRecordedClosureWithin30dPct: percentage,
  pooledRecordedClosureWithin180dPct: percentage,
  selectedMean30dArrivals: nonnegativeNumber,
  selectedOpenAt30d: nonnegativeNumber,
  selectedOpenAt180d: nonnegativeNumber,
  selectedOpenAt30dSampleStatus: z.literal("sufficient"),
  selectedOpenAt180dSampleStatus: z.literal("sufficient"),
  selectedOpenAt30dUncertainty: interval,
  selectedOpenAt180dUncertainty: interval,
  selectedKnownTimingOutcomes30d: nonnegativeInteger,
  selectedKnownTimingOutcomes180d: nonnegativeInteger,
  selectedPopulation: nonnegativeInteger,
  cityPopulationInSelectedTractsPct: percentage,
  meanSelectedTractMedianIncome: nonnegativeNumber,
  medianSelectedTractMedianIncome: nonnegativeNumber,
});

export const ScenarioSchema = z
  .strictObject({
    id: z.string().min(1),
    scalingMode: ScalingModeSchema,
    domainKey: DomainKeySchema,
    domainLabel: z.string().min(1),
    k: kValue,
    alphaIntensity: alpha,
    alphaLowerIncome: alpha,
    targetMetric: z.string().min(1),
    countMetric: z.string().min(1),
    selection: z.strictObject({
      eligibleTractCount: z.literal(2093),
      selectionCutoffScore: finiteNumber,
      rankedSelectedGeoids: z.array(geoid),
    }),
    metrics: scenarioMetrics,
    geography: z.strictObject({
      selectedTractCountByBorough: boroughRecordSchema(nonnegativeInteger),
      selectedPopulationByBorough: boroughRecordSchema(nonnegativeInteger),
      boroughPopulationInSelectedTractsPct: boroughRecordSchema(percentage),
    }),
  })
  .superRefine((scenario, context) => {
    if (scenario.domainLabel !== DOMAIN_LABELS[scenario.domainKey]) {
      context.addIssue({
        code: "custom",
        message: "Scenario domain label disagrees with its domain key",
        path: ["domainLabel"],
      });
    }
    if (scenario.countMetric !== DOMAIN_COUNT_METRICS[scenario.domainKey]) {
      context.addIssue({
        code: "custom",
        message: "Scenario count metric disagrees with its domain key",
        path: ["countMetric"],
      });
    }
    if (scenario.targetMetric !==
      DOMAIN_INTENSITY_METRICS[scenario.domainKey]) {
      context.addIssue({
        code: "custom",
        message: "Scenario target metric disagrees with its domain key",
        path: ["targetMetric"],
      });
    }
    if (Math.abs(1 - scenario.alphaIntensity - scenario.alphaLowerIncome) >
      1e-12) {
      context.addIssue({
        code: "custom",
        message: "Scenario weights must sum to one",
        path: ["alphaLowerIncome"],
      });
    }
    if (scenario.selection.rankedSelectedGeoids.length !== scenario.k ||
      new Set(scenario.selection.rankedSelectedGeoids).size !== scenario.k) {
      context.addIssue({
        code: "custom",
        message: "Scenario selection must contain K unique GEOIDs",
        path: ["selection", "rankedSelectedGeoids"],
      });
    }
    const alphaId = String(Math.round(scenario.alphaIntensity * 100))
      .padStart(3, "0");
    const expectedId = `${scenario.scalingMode}-${scenario.domainKey}-k${scenario.k}-a${alphaId}`;
    if (scenario.id !== expectedId) {
      context.addIssue({
        code: "custom",
        message: "Scenario ID disagrees with its controls",
        path: ["id"],
      });
    }
  });

export const ScenariosSchema = ArtifactEnvelopeSchema.extend({
  scenarios: z.array(ScenarioSchema).length(550),
});

export const TradeoffPointSchema = z.strictObject({
  scenarioId: z.string().min(1),
  scalingMode: ScalingModeSchema,
  domainKey: DomainKeySchema,
  k: kValue,
  alphaIntensity: alpha,
  alphaLowerIncome: alpha,
  intensityRetentionVsRateMaxPct: percentage,
  selectedQ1TractSharePct: percentage,
  q1ShareOfSelectedIntensityPct: percentage,
  mappedComplaintVolumeCapturedPct: percentage,
  cityNotClosedBy30dCapturedPct: percentage,
  cityNotClosedBy180dCapturedPct: percentage,
  pooledRecordedClosureWithin30dPct: percentage,
  pooledRecordedClosureWithin180dPct: percentage,
  cityPopulationInSelectedTractsPct: percentage,
});

export const TradeoffSchema = ArtifactEnvelopeSchema.extend({
  points: z.array(TradeoffPointSchema).length(550),
});

const workloadPeriod = z.strictObject({
  index: nonnegativeInteger,
  start: localTimestamp,
  periodEnd: localTimestamp,
  observedEnd: localTimestamp,
  daysObserved: positiveInteger,
  isFullPeriod: z.boolean(),
});

const closureCurvePoint = z.strictObject({
  ageDays: positiveInteger,
  closedByAge: nonnegativeInteger,
  closurePct: percentage,
  remainingPct: percentage,
});

const openByAge = z.strictObject({
  "0_30": nonnegativeNumber,
  "31_60": nonnegativeNumber,
  "61_90": nonnegativeNumber,
  "91_180": nonnegativeNumber,
  "181_360": nonnegativeNumber,
  "361_plus": nonnegativeNumber,
});

const replayPoint = z.strictObject({
  periodIndex: nonnegativeInteger,
  periodStart: localTimestamp,
  periodEnd: localTimestamp,
  newRequests: nonnegativeInteger,
  expectedRecordedClosures: nonnegativeNumber,
  expectedOpenBalance: nonnegativeNumber,
  netOpenChange: finiteNumber,
  openByAge,
});

const observedFlowPoint = z.strictObject({
  periodIndex: nonnegativeInteger,
  periodStart: localTimestamp,
  periodEnd: localTimestamp,
  newRequests: nonnegativeInteger,
  newRequestsWithKnownTiming: nonnegativeInteger,
  recordedClosures: nonnegativeInteger,
  netKnownOpenChange: integer,
  knownOpenBalance: nonnegativeInteger,
});

const cityWorkloadRecord = z.strictObject({
  label: z.string().min(1),
  requestCount: nonnegativeInteger,
  periodArrivals: z.array(nonnegativeInteger).length(13),
  knownTiming: nonnegativeInteger,
  closedByAge: z.array(nonnegativeInteger).length(19),
  closureCurve: z.array(closureCurvePoint).length(19),
  replay: z.array(replayPoint).length(19),
  observedFlow: z.array(observedFlowPoint).length(19),
});

const tractWorkloadBase = {
  requestCount: nonnegativeInteger,
  periodArrivals: z.array(nonnegativeInteger).length(13),
  meanFullPeriodArrivals: nonnegativeNumber,
  medianFullPeriodArrivals: nonnegativeNumber,
  p10FullPeriodArrivals: nonnegativeNumber,
  p90FullPeriodArrivals: nonnegativeNumber,
  knownTiming: nonnegativeInteger,
  validClosures: nonnegativeInteger,
  closedByAge: z.array(nonnegativeInteger).length(19),
};

const sufficientTractWorkload = z.strictObject({
  ...tractWorkloadBase,
  sampleStatus: z.literal("sufficient"),
  supportsTractSpecificCurve: z.literal(true),
  supportsTractSpecificReplay: z.literal(true),
  curveSource: z.literal("tract_observed"),
  uncertainty: z.strictObject({
    "30": interval,
    "180": interval,
  }),
});

const suppressedTractWorkload = z.strictObject({
  ...tractWorkloadBase,
  sampleStatus: z.enum([
    "no_requests",
    "no_known_timing",
    "insufficient_sample",
  ]),
  supportsTractSpecificCurve: z.literal(false),
  supportsTractSpecificReplay: z.literal(false),
  curveSource: z.null(),
  uncertainty: z.strictObject({
    "30": z.null(),
    "180": z.null(),
  }),
});

export const TractWorkloadRecordSchema = z
  .discriminatedUnion("sampleStatus", [
    sufficientTractWorkload,
    suppressedTractWorkload,
  ])
  .superRefine((record, context) => {
    const expectedStatus = record.requestCount === 0
      ? "no_requests"
      : record.knownTiming === 0
        ? "no_known_timing"
        : record.knownTiming < 30
          ? "insufficient_sample"
          : "sufficient";
    if (record.sampleStatus !== expectedStatus) {
      context.addIssue({
        code: "custom",
        message: "Sample status disagrees with request and timing counts",
        path: ["sampleStatus"],
      });
    }
    if (record.periodArrivals.reduce((sum, value) => sum + value, 0) !==
      record.requestCount) {
      context.addIssue({
        code: "custom",
        message: "Period arrivals must sum to requestCount",
        path: ["periodArrivals"],
      });
    }
    let previous = 0;
    for (const [index, value] of record.closedByAge.entries()) {
      if (value < previous || value > record.knownTiming) {
        context.addIssue({
          code: "custom",
          message: "closedByAge must be monotone and at most knownTiming",
          path: ["closedByAge", index],
        });
        break;
      }
      previous = value;
    }
  });

const domainSummary = z.strictObject({
  index: nonnegativeInteger,
  domain: z.string().min(1),
  requests: nonnegativeInteger,
  validClosureDates: nonnegativeInteger,
  timingKnownPct: percentage,
  medianValidDaysToClose: nonnegativeNumber,
  known30dOutcomes: nonnegativeInteger,
  closedWithin30dPct: percentage,
  known90dOutcomes: nonnegativeInteger,
  closedWithin90dPct: percentage,
  known180dOutcomes: nonnegativeInteger,
  closedWithin180dPct: percentage,
});

export const WorkloadSchema = ArtifactEnvelopeSchema.extend({
  semantics: z.strictObject({
    arrivalPattern: z.string().min(1),
    requestAge: z.string().min(1),
    replay: z.string().min(1),
    closureTerm: z.literal("recorded administrative closure"),
    closureWarning: z.string().min(1),
    notForecast: z.literal(true),
    notCausal: z.literal(true),
    sparseTractDomainPolicy: z.string().min(1),
    groupPooling: z.string().min(1),
    pooledFallback: z.null(),
  }),
  periods: z.array(workloadPeriod).length(13),
  fullPeriodIndices: exactArray(nonnegativeInteger, FULL_PERIOD_INDICES),
  ageCheckpointsDays: exactArray(positiveInteger, AGE_CHECKPOINTS_DAYS),
  uncertainty: z.strictObject({
    method: z.string().min(1),
    draws: z.literal(1000),
    seed: integer,
    intervalAgesDays: z.tuple([z.literal(30), z.literal(180)]),
    minimumKnownTimingSample: z.literal(30),
    tractSpecificFallback: z.null(),
    allowAggregatePooling: z.literal(true),
    scope: z.string().min(1),
  }),
  observationSummary: z.strictObject({
    matched_requests: nonnegativeInteger,
    observation_end: localTimestamp,
    latest_created_date: localTimestamp,
    latest_30_day_window_end: localTimestamp,
    latest_90_day_window_end: localTimestamp,
    latest_180_day_window_end: localTimestamp,
    valid_close_dates: nonnegativeInteger,
    negative_close_durations: nonnegativeInteger,
    timing_outcome_unknown: nonnegativeInteger,
    timing_outcome_known_pct: percentage,
  }),
  anomalyByDomain: z.array(z.strictObject({
    index: nonnegativeInteger,
    domain: z.string().min(1),
    requests: nonnegativeInteger,
    negativeCloseDurations: nonnegativeInteger,
    closedStatusWithoutValidDate: nonnegativeInteger,
    validDateButNotClosedStatus: nonnegativeInteger,
    timingUnknownPct: percentage,
  })).length(5),
  domainWindowSummary: z.array(domainSummary).length(5),
  tractSupportSummary: z.array(z.strictObject({
    index: nonnegativeInteger,
    domain: z.string().min(1),
    tractDomainCells: nonnegativeInteger,
    medianRequestsPerTract: nonnegativeNumber,
    p10RequestsPerTract: nonnegativeNumber,
    tractsWithAtLeast20Known180: nonnegativeInteger,
    tractsWithAtLeast30Known180: nonnegativeInteger,
    tractsWithAtLeast50Known180: nonnegativeInteger,
    tractsWithAtLeast100Known180: nonnegativeInteger,
  })).length(5),
  windowVariationSummary: z.array(z.strictObject({
    index: nonnegativeInteger,
    domain: z.string().min(1),
    windowDays: z.union([z.literal(30), z.literal(90), z.literal(180)]),
    tractsWithAtLeast30KnownOutcomes: nonnegativeInteger,
    meanTractClosureRatePct: percentage,
    stdTractClosureRatePct: nonnegativeNumber,
    p10TractClosureRatePct: percentage,
    medianTractClosureRatePct: percentage,
    p90TractClosureRatePct: percentage,
    p10ToP90SpreadPctPoints: nonnegativeNumber,
  })).length(15),
  city: domainRecordSchema(cityWorkloadRecord),
  tracts: z.record(geoid, domainRecordSchema(TractWorkloadRecordSchema)),
}).superRefine((workload, context) => {
  for (const [index, period] of workload.periods.entries()) {
    const isPartial = index === 12;
    if (period.index !== index ||
      period.isFullPeriod === isPartial ||
      period.daysObserved !== (isPartial ? 6 : 30)) {
      context.addIssue({
        code: "custom",
        message: "Historical period completeness metadata is invalid",
        path: ["periods", index],
      });
    }
  }
});

export const KnowledgeBaseSchema = ArtifactEnvelopeSchema.extend({
  project: z.literal("NYC 311 Priority Atlas"),
  productDefinition: z.string().min(1),
  defaults,
  methodology: z.strictObject({
    decisionUnit: z.string().min(1),
    portfolioSize: z.strictObject({
      symbol: z.literal("K"),
      supportedValues: z.array(kValue).length(5),
      definition: z.string().min(1),
    }),
    priorityBalance: z.strictObject({
      alphaValues: z.array(alpha).length(11),
      formulaRankBalanced: z.string().min(1),
      formulaMagnitudeSensitive: z.string().min(1),
    }),
    selectionRule: z.string().min(1),
    responseMetrics: z.string().min(1),
    workloadReplay: z.string().min(1),
    uncertainty: z.string().min(1),
    neighborGraph: z.string().min(1),
  }),
  metricDefinitions: z.strictObject({
    mappedComplaintVolumeCapturedPct: z.string().min(1),
    recordedClosureWithin30dPct: z.string().min(1),
    mean30dArrivals: z.string().min(1),
    openAt30d: z.string().min(1),
    openAt180d: z.string().min(1),
    netOpenChange: z.string().min(1),
    intensityRetentionVsRateMaxPct: z.string().min(1),
  }),
  assistantDelegation: z.strictObject({
    deterministicSystemResponsibilities: z.array(z.string().min(1)),
    claudeResponsibilities: z.array(z.string().min(1)),
    humanResponsibilities: z.array(z.string().min(1)),
    prohibitedClaudeActions: z.array(z.string().min(1)),
  }),
  limitations: z.array(z.strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    statement: z.string().min(1),
  })),
});

const evidenceBase = {
  id: z.string().min(1),
  text: z.string().min(1),
};

export const EvidenceItemSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...evidenceBase,
    kind: z.enum(["methodology", "limitation"]),
  }),
  z.strictObject({
    ...evidenceBase,
    kind: z.enum(["data_quality", "context"]),
    data: z.strictObject({ value: finiteNumber }),
  }),
]);

export const EvidenceSchema = ArtifactEnvelopeSchema.extend({
  items: z.array(EvidenceItemSchema).length(48),
});

type BaseTractFeatureProperties = {
  geoid: string;
  tractName: string;
  borough: z.infer<typeof BoroughSchema>;
  county: z.infer<typeof CountyNameSchema>;
  population: number | null;
  medianHouseholdIncome: number | null;
  incomeQuintile: z.infer<typeof IncomeQuintileSchema> | null;
  allocationEligible: boolean;
  allocationIneligibilityReason:
    | "missing_population"
    | "population_below_500"
    | "missing_income"
    | null;
  lowerIncomePriorityZ: number | null;
  lowerIncomePriorityPercentile: number | null;
  queenNeighborGeoids: string[];
};

type DomainMapMetricValues = {
  ComplaintCount: number;
  ComplaintRatePer1000: number | null;
  ComplaintIntensityZ: number | null;
  ComplaintIntensityPercentile: number | null;
  KnownClosureTimingOutcomes30d: number;
  RecordedClosureWithin30dPct: number | null;
  KnownClosureTimingOutcomes180d: number;
  RecordedClosureWithin180dPct: number | null;
  ValidRecordedClosures: number;
  MedianRecordedDaysToClose: number | null;
  NotRecordedClosedWithin30dCount: number;
  NotRecordedClosedWithin180dCount: number;
  NotRecordedClosedWithin30dPer1000: number | null;
  NotRecordedClosedWithin180dPer1000: number | null;
  Mean30dArrivals: number;
  Median30dArrivals: number;
  P10_30dArrivals: number;
  P90_30dArrivals: number;
  OpenAt30d: number | null;
  OpenAt180d: number | null;
  ResponseSampleStatus: z.infer<typeof WorkloadSampleStatusSchema>;
  SupportsTractSpecificReplay: boolean;
  ResponseSampleSufficient30d: boolean;
  ResponseSampleSufficient180d: boolean;
  MedianClosureSampleSufficient: boolean;
};

type PrefixedDomainMetrics<Prefix extends string> = {
  [Suffix in keyof DomainMapMetricValues as `${Prefix}${Suffix & string}`]:
    DomainMapMetricValues[Suffix];
};

export type TractFeatureProperties = BaseTractFeatureProperties &
  PrefixedDomainMetrics<"noise"> &
  PrefixedDomainMetrics<"housingBuilding"> &
  PrefixedDomainMetrics<"sanitationEnvironmental"> &
  PrefixedDomainMetrics<"streetInfrastructure"> &
  PrefixedDomainMetrics<"publicSafetyQualityOfLife">;

export type TractGeometry = z.infer<typeof TractGeometrySchema>;
export type TractFeature = {
  type: "Feature";
  properties: TractFeatureProperties;
  geometry: TractGeometry;
};
export type TractsGeoJson = {
  type: "FeatureCollection";
  features: TractFeature[];
  schemaVersion: typeof SCHEMA_VERSION;
  modelVersion: typeof MODEL_VERSION;
  artifactSetId: string;
};

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestFile = z.infer<typeof ManifestFileSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type Context = z.infer<typeof ContextSchema>;
export type TractDetails = z.infer<typeof TractDetailsSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Scenarios = z.infer<typeof ScenariosSchema>;
export type TradeoffPoint = z.infer<typeof TradeoffPointSchema>;
export type Tradeoff = z.infer<typeof TradeoffSchema>;
export type WorkloadInterval = z.infer<typeof WorkloadIntervalSchema>;
export type TractWorkloadRecord = z.infer<typeof TractWorkloadRecordSchema>;
export type Workload = z.infer<typeof WorkloadSchema>;
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;
export type Knowledge = KnowledgeBase;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ArtifactSchemas = {
  "tracts.geojson": TractsGeoJsonSchema,
  "tract_details.json": TractDetailsSchema,
  "scenarios.json": ScenariosSchema,
  "tradeoff.json": TradeoffSchema,
  "context.json": ContextSchema,
  "workload.json": WorkloadSchema,
  "metadata.json": MetadataSchema,
  "knowledge_base.json": KnowledgeBaseSchema,
  "evidence.json": EvidenceSchema,
} as const satisfies Record<ArtifactFile, z.ZodType>;

export type ArtifactDataByFile = {
  "tracts.geojson": TractsGeoJson;
  "tract_details.json": TractDetails;
  "scenarios.json": Scenarios;
  "tradeoff.json": Tradeoff;
  "context.json": Context;
  "workload.json": Workload;
  "metadata.json": Metadata;
  "knowledge_base.json": KnowledgeBase;
  "evidence.json": Evidence;
};
