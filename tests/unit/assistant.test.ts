import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/assistant/route";
import {
  assertActionAllowed,
  AssistantBoundaryError,
  createAssistantGroundingCatalog,
  isActionSafeForKnownGeoids,
  parseAssistantModelText,
  validateAndRenderAssistantResponse,
} from "@/lib/assistant/guardrails";
import {
  AssistantActionSchema,
  AssistantRequestSchema,
  type AssistantContext,
} from "@/lib/assistant/schemas";

const UNAVAILABLE_COPY =
  "Claude interpretation is unavailable. All analytical controls remain active.";

const emptyContext: AssistantContext = {
  workspace: "explore",
  activeDomain: "housing_building",
  activeMapMetric: "complaint_intensity",
  selectedTracts: [],
  activeNeighborhood: null,
  currentScenario: null,
  pinnedScenario: null,
  workload: null,
};

const sufficientTractContext = {
  geoid: "36081003700",
  name: "Census Tract 37, Queens",
  population: 2_000,
  medianHouseholdIncome: 50_000,
  allocationEligible: true,
  allocationIneligibilityReason: null,
  mappedComplaintCount: 40,
  complaintsPer1000: 20,
  responseSampleStatus: "sufficient",
  activeDomainResponse: {
    sampleStatus: "sufficient",
    requestCount: 40,
    knownTimingOutcomes30d: 40,
    knownTimingOutcomes180d: 40,
    validRecordedClosures: 40,
    recordedClosureWithin30dPct: 100,
    recordedClosureWithin180dPct: 100,
    medianRecordedDaysToClose: 0,
    notRecordedClosedWithin30dCount: 0,
    notRecordedClosedWithin180dCount: 0,
    notRecordedClosedWithin30dPer1000: 0,
    notRecordedClosedWithin180dPer1000: 0,
    expectedCohortOpenAt30d: 0,
    expectedCohortOpenAt180d: 0,
  },
  activeMapMetric: {
    key: "mapped_complaint_count",
    value: 40,
    available: true,
    unavailableReason: null,
  },
  complaintDetails: {
    complaintTypes: [
      { complaintType: "HEAT/HOT WATER", count: 30, sharePct: 75 },
    ],
    agencies: [{ agency: "HPD", count: 40, sharePct: 100 }],
  },
  active: true,
} satisfies AssistantContext["selectedTracts"][number];

describe("assistant request boundary", () => {
  it("accepts a bounded supported explanatory task", () => {
    const parsed = AssistantRequestSchema.parse({
      task: "explain_methodology_limitations",
      prompt: "Explain the sparse-sample policy.",
      context: emptyContext,
    });

    expect(parsed.task).toBe("explain_methodology_limitations");
  });

  it("accepts bounded artifact-only tract detail and preserves valid zeros", () => {
    const parsed = AssistantRequestSchema.parse({
      task: "explain_active_tract",
      prompt: "Explain the active tract.",
      context: {
        ...emptyContext,
        activeMapMetric: "mapped_complaint_count",
        selectedTracts: [sufficientTractContext],
      },
    });

    expect(
      parsed.context.selectedTracts[0]?.activeDomainResponse
        .expectedCohortOpenAt30d,
    ).toBe(0);
    expect(
      parsed.context.selectedTracts[0]?.complaintDetails?.complaintTypes,
    ).toHaveLength(1);
  });

  it("keeps sparse derived response and unavailable map values null", () => {
    const sparseTract = {
      ...sufficientTractContext,
      mappedComplaintCount: 12,
      responseSampleStatus: "insufficient_sample" as const,
      activeDomainResponse: {
        sampleStatus: "insufficient_sample" as const,
        requestCount: 12,
        knownTimingOutcomes30d: 5,
        knownTimingOutcomes180d: 5,
        validRecordedClosures: 5,
        recordedClosureWithin30dPct: null,
        recordedClosureWithin180dPct: null,
        medianRecordedDaysToClose: null,
        notRecordedClosedWithin30dCount: null,
        notRecordedClosedWithin180dCount: null,
        notRecordedClosedWithin30dPer1000: null,
        notRecordedClosedWithin180dPer1000: null,
        expectedCohortOpenAt30d: null,
        expectedCohortOpenAt180d: null,
      },
      activeMapMetric: {
        key: "recorded_closure_30d" as const,
        value: null,
        available: false,
        unavailableReason: "Insufficient sample",
      },
      complaintDetails: null,
    };
    const request = {
      task: "explain_active_tract",
      prompt: "Explain the sparse response state.",
      context: {
        ...emptyContext,
        activeMapMetric: "recorded_closure_30d",
        selectedTracts: [sparseTract],
      },
    };

    expect(AssistantRequestSchema.safeParse(request).success).toBe(true);
    expect(
      AssistantRequestSchema.safeParse({
        ...request,
        context: {
          ...request.context,
          selectedTracts: [{
            ...sparseTract,
            activeDomainResponse: {
              ...sparseTract.activeDomainResponse,
              recordedClosureWithin30dPct: 0,
            },
          }],
        },
      }).success,
    ).toBe(false);
    expect(
      AssistantRequestSchema.safeParse({
        ...request,
        context: {
          ...request.context,
          selectedTracts: [{
            ...sparseTract,
            activeMapMetric: {
              ...sparseTract.activeMapMetric,
              value: 0,
            },
          }],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects complaint-detail context beyond its bounded limits", () => {
    expect(
      AssistantRequestSchema.safeParse({
        task: "explain_active_tract",
        prompt: "Explain the active tract.",
        context: {
          ...emptyContext,
          activeMapMetric: "mapped_complaint_count",
          selectedTracts: [{
            ...sufficientTractContext,
            complaintDetails: {
              ...sufficientTractContext.complaintDetails,
              complaintTypes: Array.from({ length: 6 }, (_, index) => ({
                complaintType: `Complaint type ${index + 1}`,
                count: 1,
                sharePct: 2.5,
              })),
            },
          }],
        },
      }).success,
    ).toBe(false);
    expect(
      AssistantRequestSchema.safeParse({
        task: "explain_active_tract",
        prompt: "Explain the active tract.",
        context: {
          ...emptyContext,
          activeMapMetric: "mapped_complaint_count",
          selectedTracts: [{
            ...sufficientTractContext,
            complaintDetails: {
              ...sufficientTractContext.complaintDetails,
              agencies: Array.from({ length: 4 }, (_, index) => ({
                agency: `Agency ${index + 1}`,
                count: 1,
                sharePct: 2.5,
              })),
            },
          }],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects task/context mismatches and unbounded context fields", () => {
    expect(
      AssistantRequestSchema.safeParse({
        task: "compare_selected_tracts",
        prompt: "Compare these tracts.",
        context: emptyContext,
      }).success,
    ).toBe(false);

    expect(
      AssistantRequestSchema.safeParse({
        task: "explain_methodology_limitations",
        prompt: "Explain the method.",
        context: { ...emptyContext, arbitraryPayload: "not allowed" },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate selections and an active GEOID outside the proposal", () => {
    expect(
      AssistantActionSchema.safeParse({
        type: "select_tracts",
        geoids: ["36061000100", "36061000100"],
      }).success,
    ).toBe(false);
    expect(
      AssistantActionSchema.safeParse({
        type: "select_tracts",
        geoids: ["36061000100"],
        activeGeoid: "36081003700",
      }).success,
    ).toBe(false);
  });
});

describe("assistant model-output boundary", () => {
  it("parses strict JSON, including a fenced response", () => {
    expect(
      parseAssistantModelText(
        "```json\n{\"narrative\":\"The supplied historical replay shows a higher expected open balance.\",\"action\":null}\n```",
      ),
    ).toEqual({
      narrative:
        "The supplied historical replay shows a higher expected open balance.",
      action: null,
    });
  });

  it("blocks prohibited claims and malformed fallback text", () => {
    expect(() =>
      parseAssistantModelText(
        JSON.stringify({
          narrative: "This is the recommended plan for current conditions.",
          action: null,
        }),
      )
    ).toThrow(AssistantBoundaryError);
    expect(() => parseAssistantModelText("An unstructured answer.")).toThrow(
      AssistantBoundaryError,
    );
  });

  it.each([
    "Today, the supplied record indicates stronger agency performance.",
    "This live dashboard shows stronger service performance.",
    "Recorded closure means service delivered for these requests.",
    "The problem was eliminated after recorded administrative closure.",
    "A physical outcome was achieved for the supplied requests.",
    "This is the best policy among the supplied selection scenarios.",
    "The selection scenario is the best approach.",
  ])("blocks exact current-state, physical-outcome, and normative claim: %s", (narrative) => {
    expect(() =>
      parseAssistantModelText(JSON.stringify({ narrative, action: null }))
    ).toThrow(AssistantBoundaryError);
  });

  it.each([
    "The current selection scenario can be compared with the pinned selection scenario.",
    "Recorded administrative closure does not establish whether a physical outcome occurred.",
    "The supplied historical record does not establish agency performance outside the snapshot.",
  ])("allows bounded methodological language: %s", (narrative) => {
    expect(
      parseAssistantModelText(JSON.stringify({ narrative, action: null })),
    ).toEqual({ narrative, action: null });
  });

  it("limits actions by task and to supplied tract context", () => {
    const action = AssistantActionSchema.parse({
      type: "select_tracts",
      geoids: ["36061000100"],
      activeGeoid: "36061000100",
    });
    const context: AssistantContext = {
      ...emptyContext,
      selectedTracts: [sufficientTractContext],
    };

    expect(() =>
      assertActionAllowed(action, "explain_active_tract", context)
    ).toThrow(AssistantBoundaryError);
    expect(() =>
      assertActionAllowed(
        { type: "set_scenario", scalingMode: "rank_balanced", domain: "noise", k: 25, alpha: 0.5 },
        "explain_methodology_limitations",
        context,
      )
    ).toThrow(AssistantBoundaryError);
  });

  it("rechecks proposed tract GEOIDs immediately before Apply", () => {
    const knownGeoids = new Set(["36061000100"]);
    expect(
      isActionSafeForKnownGeoids(
        {
          type: "select_tracts",
          geoids: ["36061000100"],
          activeGeoid: "36061000100",
        },
        knownGeoids,
      ),
    ).toBe(true);
    expect(
      isActionSafeForKnownGeoids(
        { type: "select_tracts", geoids: ["36081003700"] },
        knownGeoids,
      ),
    ).toBe(false);
  });

  it("requires task-aware hypothesis labels and investigation-brief sections", () => {
    expect(() =>
      validateAndRenderAssistantResponse(
        { narrative: "Reporting differences may merit review.", action: null },
        "generate_hypotheses",
        [],
      )
    ).toThrow(/Hypothesis to investigate/);
    expect(
      validateAndRenderAssistantResponse(
        {
          narrative:
            "Hypothesis to investigate\nReporting differences may merit review.",
          action: null,
        },
        "generate_hypotheses",
        [],
      ).narrative,
    ).toContain("Hypothesis to investigate");

    const completeBrief = [
      "What the data shows",
      "The supplied historical record shows variation.",
      "Possible explanations to investigate",
      "Reporting behavior may differ.",
      "Evidence still needed",
      "Administrative record review.",
      "Potential intervention categories",
      "Process review and outreach.",
      "How to evaluate a pilot",
      "Compare a defined baseline with documented outcomes.",
      "Limitations",
      "The supplied evidence is observational.",
    ].join("\n");
    expect(
      validateAndRenderAssistantResponse(
        { narrative: completeBrief, action: null },
        "draft_investigation_brief",
        [],
      ).narrative,
    ).toBe(completeBrief);
    expect(() =>
      validateAndRenderAssistantResponse(
        {
          narrative: completeBrief.replace("Evidence still needed", "Evidence gaps"),
          action: null,
        },
        "draft_investigation_brief",
        [],
      )
    ).toThrow(/Evidence still needed/);
  });

  it("substitutes only bounded numeric and administrative-label references", () => {
    const context: AssistantContext = {
      ...emptyContext,
      activeMapMetric: "mapped_complaint_count",
      selectedTracts: [sufficientTractContext],
    };
    const catalog = createAssistantGroundingCatalog(context, {
      evidence: [{ id: "snapshot", text: "Snapshot year = 2016" }],
    });
    const countReference = "context.selectedTracts.0.mappedComplaintCount";
    const complaintTypeReference =
      "context.selectedTracts.0.complaintDetails.complaintTypes.0.complaintType";
    const agencyReference =
      "context.selectedTracts.0.complaintDetails.agencies.0.agency";
    expect(catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: countReference, value: 40 }),
      expect.objectContaining({
        id: complaintTypeReference,
        kind: "complaint_type",
        value: "HEAT/HOT WATER",
      }),
      expect.objectContaining({
        id: agencyReference,
        kind: "agency",
        value: "HPD",
      }),
    ]));

    const rendered = validateAndRenderAssistantResponse(
      {
        narrative:
          `The supplied tract has {{${countReference}}} mapped complaints. ` +
          `The complaint type is {{${complaintTypeReference}}}, and the agency is {{${agencyReference}}}.`,
        action: null,
        references: [countReference, complaintTypeReference, agencyReference],
      },
      "explain_active_tract",
      catalog,
    );
    expect(rendered.narrative).toContain("40 mapped complaints");
    expect(rendered.narrative).toContain("HEAT/HOT WATER");
    expect(rendered.narrative).toContain("HPD");

    expect(() =>
      validateAndRenderAssistantResponse(
        { narrative: "The supplied tract has 999 mapped complaints.", action: null },
        "explain_active_tract",
        catalog,
      )
    ).toThrow(/numeric claim/);
    expect(() =>
      validateAndRenderAssistantResponse(
        {
          narrative: "The complaint type is HEAT/HOT WATER.",
          action: null,
        },
        "explain_active_tract",
        catalog,
      )
    ).toThrow(/typed directly/);
    expect(() =>
      validateAndRenderAssistantResponse(
        {
          narrative: "The complaint type is UNSUPPLIED LABEL.",
          action: null,
        },
        "explain_active_tract",
        catalog,
      )
    ).toThrow(/not supplied through bounded grounding/);
    expect(
      validateAndRenderAssistantResponse(
        { narrative: "Independent review may add useful evidence.", action: null },
        "explain_active_tract",
        [...catalog, { id: "test.agency", kind: "agency", value: "DEP" }],
      ).narrative,
    ).toBe("Independent review may add useful evidence.");
  });

  it("rejects unknown, malformed, or undeclared grounding references", () => {
    const context: AssistantContext = {
      ...emptyContext,
      activeMapMetric: "mapped_complaint_count",
      selectedTracts: [sufficientTractContext],
    };
    const catalog = createAssistantGroundingCatalog(context, {});
    const unknown = "context.selectedTracts.0.inventedValue";
    expect(() =>
      validateAndRenderAssistantResponse(
        {
          narrative: `The supplied value is {{${unknown}}}.`,
          action: null,
          references: [unknown],
        },
        "explain_active_tract",
        catalog,
      )
    ).toThrow(/outside the bounded grounding catalog/);
    expect(() =>
      validateAndRenderAssistantResponse(
        {
          narrative:
            "The supplied value is {{context.selectedTracts.0.mappedComplaintCount}}.",
          action: null,
        },
        "explain_active_tract",
        catalog,
      )
    ).toThrow(/declared grounding references/);
    expect(() =>
      validateAndRenderAssistantResponse(
        {
          narrative: "The supplied value is {{broken reference}}.",
          action: null,
        },
        "explain_active_tract",
        catalog,
      )
    ).toThrow(/malformed grounding reference/);
  });
});

describe.sequential("assistant availability API", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns the exact unavailable copy when no key exists", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: false,
      message: UNAVAILABLE_COPY,
    });
  });

  it("omits a nullable message when interpretation is available", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const response = await GET();

    expect(await response.json()).toEqual({ available: true });
  });

  it("does not parse or forward a request when no key exists", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(await response.json()).toEqual({
      available: false,
      message: UNAVAILABLE_COPY,
    });
  });

  it("returns only a validated interpretation from grounded upstream JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "server-only-test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                narrative:
                  "The sparse-sample policy suppresses unsupported tract-specific response estimates.",
                action: null,
              }),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "explain_methodology_limitations",
          prompt: "Explain the sparse-sample policy.",
          context: emptyContext,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      available: true,
      narrative:
        "The sparse-sample policy suppresses unsupported tract-specific response estimates.",
      action: null,
    });
    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const upstreamBody = JSON.parse(String(requestOptions.body)) as {
      system: string;
    };
    expect(upstreamBody.system).toContain("Artifact contract: schema 4.0.0");
    expect(upstreamBody.system).toContain("limitation.sparse_tract_domain_response");
    expect(upstreamBody.system).toContain("Bounded grounding reference catalog");
    expect(upstreamBody.system).not.toContain("data.raw_311_rows");
    expect(JSON.stringify(responseBody)).not.toContain("server-only-test-key");
  });

  it("substitutes a bounded reference before returning the interpretation", async () => {
    process.env.ANTHROPIC_API_KEY = "server-only-test-key";
    const reference = "context.selectedTracts.0.mappedComplaintCount";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                narrative: `The supplied tract has {{${reference}}} mapped complaints.`,
                action: null,
                references: [reference],
              }),
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          task: "explain_active_tract",
          prompt: "Explain the mapped complaint count.",
          context: {
            ...emptyContext,
            activeMapMetric: "mapped_complaint_count",
            selectedTracts: [sufficientTractContext],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      narrative: "The supplied tract has 40 mapped complaints.",
      action: null,
    });
    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(requestOptions.body)).toContain(reference);
  });

  it("rejects an uncatalogued numeric claim from the upstream narrative", async () => {
    process.env.ANTHROPIC_API_KEY = "server-only-test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  narrative: "The snapshot contains 999 records.",
                  action: null,
                }),
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          task: "explain_methodology_limitations",
          prompt: "Explain the supplied method.",
          context: emptyContext,
        }),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      available: true,
      error:
        "Claude returned an interpretation outside the supported analytical boundaries. Manual controls remain active.",
    });
  });

  it("does not return an upstream narrative that crosses a claim boundary", async () => {
    process.env.ANTHROPIC_API_KEY = "server-only-test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  narrative: "This is the recommended plan.",
                  action: null,
                }),
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          task: "explain_methodology_limitations",
          prompt: "Explain the method.",
          context: emptyContext,
        }),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      available: true,
      error:
        "Claude returned an interpretation outside the supported analytical boundaries. Manual controls remain active.",
    });
  });
});
