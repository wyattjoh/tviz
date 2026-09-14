import { describe, expect, it } from "vitest";
import { formatPercent, formatTimestamp, formatTokens } from "./format.ts";

describe("formatTokens", () => {
  it("is exact below a thousand", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(512)).toBe("512");
    expect(formatTokens(999)).toBe("999");
  });

  it("uses one decimal of thousands up to a million", () => {
    expect(formatTokens(1_000)).toBe("1.0k");
    expect(formatTokens(45_321)).toBe("45.3k");
    expect(formatTokens(200_000)).toBe("200.0k");
    expect(formatTokens(501_607)).toBe("501.6k");
  });

  // A 1M Context Window is the common case, and `1000.0k` is neither of the
  // two windows the grid offers — enough to make a correct denominator read
  // as a wrong one.
  it("rolls up to M rather than printing a four-digit k", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });

  it("rolls up at the seam, where the thousands would round to 1000.0", () => {
    expect(formatTokens(999_990)).toBe("1.0M");
    expect(formatTokens(999_949)).toBe("999.9k");
  });
});

describe("formatPercent", () => {
  it("reports a share to one decimal", () => {
    expect(formatPercent(104_589, 200_000)).toBe("52.3%");
    expect(formatPercent(45_321, 1_000_000)).toBe("4.5%");
  });

  it("is zero rather than NaN when there is no window to divide by", () => {
    expect(formatPercent(100, 0)).toBe("0.0%");
    expect(formatPercent(100, -1)).toBe("0.0%");
  });
});

describe("formatTimestamp", () => {
  it("falls back to an em dash when nothing was recorded", () => {
    expect(formatTimestamp(undefined)).toBe("—");
  });

  it("hands back an unparsable value rather than printing Invalid Date", () => {
    expect(formatTimestamp("not a date")).toBe("not a date");
  });
});
