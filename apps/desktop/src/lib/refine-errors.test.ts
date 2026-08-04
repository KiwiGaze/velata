import { describe, expect, it } from "vitest";

import { describeRefineError, MissingApiKeyError, MissingModelError } from "./refine-errors";

describe("describeRefineError", () => {
  it("prompts to connect a model when the API key or model is missing", () => {
    expect(describeRefineError(new MissingApiKeyError())).toBe("Connect a model in Settings");
    expect(describeRefineError(new MissingModelError())).toBe("Connect a model in Settings");
  });

  it("returns the underlying message when the error has one", () => {
    expect(describeRefineError(new Error("boom"))).toBe("boom");
  });

  it("falls back to a generic message when the error has no message", () => {
    expect(describeRefineError(new Error())).toBe("Refine failed");
    expect(describeRefineError("nope")).toBe("Refine failed");
  });
});
