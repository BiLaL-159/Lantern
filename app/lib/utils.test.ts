import { describe, it, expect } from "vitest";
import { formatUsd } from "./utils";

describe("formatUsd", () => {
  it("renders zero as $0.00 rather than Free", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("converts cents to dollars with thousands separators", () => {
    expect(formatUsd(17497)).toBe("$174.97");
    expect(formatUsd(1234567)).toBe("$12,345.67");
  });
});
