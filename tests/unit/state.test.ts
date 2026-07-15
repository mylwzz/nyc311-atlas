import { beforeEach, describe, expect, it } from "vitest";

import { resetAtlasStore, useAtlasStore } from "@/lib/state/store";
import {
  parseShareableState,
  serializeShareableState,
} from "@/lib/state/url";

describe("multi-tract selection store", () => {
  beforeEach(() => resetAtlasStore());

  it("adds, activates, and removes tracts without a modifier", () => {
    const store = useAtlasStore.getState();
    store.toggleTract("36081003400");
    store.toggleTract("36081003900");

    expect(useAtlasStore.getState().selectedGeoids).toEqual([
      "36081003400",
      "36081003900",
    ]);
    expect(useAtlasStore.getState().activeGeoid).toBe("36081003900");

    useAtlasStore.getState().activateTract("36081003400");
    expect(useAtlasStore.getState().activeGeoid).toBe("36081003400");

    useAtlasStore.getState().toggleTract("36081003400");
    expect(useAtlasStore.getState().selectedGeoids).toEqual(["36081003900"]);
    expect(useAtlasStore.getState().activeGeoid).toBe("36081003900");
  });

  it("rejects a sixth tract and exposes the required notice", () => {
    const geoids = [
      "36081003400",
      "36081003900",
      "36081003600",
      "36081003700",
      "36081003800",
      "36081004000",
    ];
    for (const geoid of geoids) useAtlasStore.getState().toggleTract(geoid);

    expect(useAtlasStore.getState().selectedGeoids).toHaveLength(5);
    expect(useAtlasStore.getState().selectedGeoids).not.toContain(geoids[5]);
    expect(useAtlasStore.getState().selectionNotice).toBe(
      "Compare up to 5 tracts at once.",
    );
  });

  it("clears selection and disables neighborhood context", () => {
    useAtlasStore.getState().toggleTract("36081003400");
    useAtlasStore.getState().setNeighborhoodEnabled(true);
    useAtlasStore.getState().clearSelection();

    expect(useAtlasStore.getState().selectedGeoids).toEqual([]);
    expect(useAtlasStore.getState().activeGeoid).toBeNull();
    expect(useAtlasStore.getState().neighborhood.enabled).toBe(false);
  });
});

describe("shareable state URL", () => {
  beforeEach(() => resetAtlasStore());

  it("round-trips analytical state without assistant conversation", () => {
    const state = useAtlasStore.getState();
    state.setWorkspace("workload");
    state.setDomain("noise");
    state.setMapMetric("mapped_complaint_count");
    state.selectTracts(["36081003400", "36081003900"], "36081003400");
    state.setNeighborhoodRadius(3);
    state.setNeighborhoodEnabled(true);
    state.setDemandChange(20);

    const query = serializeShareableState(useAtlasStore.getState());
    expect(query).not.toContain("assistant");
    expect(parseShareableState(new URLSearchParams(query))).toMatchObject({
      workspace: "workload",
      activeDomain: "noise",
      activeMapMetric: "mapped_complaint_count",
      selectedGeoids: ["36081003400", "36081003900"],
      activeGeoid: "36081003400",
      neighborhood: { enabled: true, radius: 3 },
      workload: { demandChangePct: 20 },
    });
  });

  it("keeps the Scenario Lab service domain global", () => {
    useAtlasStore.getState().setScenarioControls({ domain: "noise" });
    expect(useAtlasStore.getState().activeDomain).toBe("noise");
    expect(useAtlasStore.getState().scenario.domain).toBe("noise");
  });

  it("applies workload assumptions only after approval and opens Scenario", () => {
    useAtlasStore.getState().setPendingAssistantAction({
      type: "set_workload_assumptions",
      demandChangePct: 12,
      closureCurveShiftPoints: 4,
    });
    expect(useAtlasStore.getState().workload.demandChangePct).toBe(0);
    useAtlasStore.getState().applyAssistantAction();
    expect(useAtlasStore.getState()).toMatchObject({
      workspace: "workload",
      workload: {
        tab: "scenario",
        demandChangePct: 12,
        closureCurveShiftPoints: 4,
      },
      assistant: { pendingAction: null },
    });
  });
});
