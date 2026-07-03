import { describe, expect, it } from "vitest";

import { isBlank } from "./index";

describe("isBlank", () => {
  it("is true for empty and whitespace-only text", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   \n\t")).toBe(true);
  });

  it("is false when text has content", () => {
    expect(isBlank("hello")).toBe(false);
  });
});
