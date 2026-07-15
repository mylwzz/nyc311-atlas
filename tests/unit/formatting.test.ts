import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatDateRange,
  formatExpected,
  formatInteger,
  formatPercent,
  formatSigned,
} from "@/lib/formatting";

describe("analytical formatting", () => {
  it("keeps unavailable values distinct from true zero", () => {
    expect(formatInteger(null)).toBe("Not available");
    expect(formatPercent(undefined)).toBe("Not available");
    expect(formatInteger(0)).toBe("0");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("formats actual, expected, monetary, and signed values consistently", () => {
    expect(formatInteger(3_846)).toBe("3,846");
    expect(formatExpected(4.25)).toBe("4.3");
    expect(formatExpected(125.4)).toBe("125");
    expect(formatCurrency(67_292)).toBe("$67,292");
    expect(formatSigned(-2.25, "%")).toBe("−2.3%");
  });

  it("shows the actual boundaries of a historical arrival period", () => {
    expect(formatDateRange("2016-01-01T00:00:00", "2016-01-30T00:00:00"))
      .toBe("Jan 1–Jan 30");
  });
});
