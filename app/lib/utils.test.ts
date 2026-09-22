import { describe, it, expect } from "vitest";
import { formatUsd, formatUsdCompact, formatCount } from "./utils";

describe("formatUsd", () => {
  it("renders zero as $0.00 rather than Free", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("converts cents to dollars with thousands separators", () => {
    expect(formatUsd(17497)).toBe("$174.97");
    expect(formatUsd(1234567)).toBe("$12,345.67");
  });
});

describe("formatUsdCompact", () => {
  it("abbreviates large amounts for axis ticks", () => {
    expect(formatUsdCompact(0)).toBe("$0");
    expect(formatUsdCompact(17497)).toBe("$175");
    expect(formatUsdCompact(1234567)).toBe("$12.3K");
    expect(formatUsdCompact(430000000)).toBe("$4.3M");
  });
});

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1284)).toBe("1,284");
  });
});
