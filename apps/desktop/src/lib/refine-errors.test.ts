import { describe, expect, it } from "vitest";

import {
  CodexSparkError,
  describeRefineError,
  MissingApiKeyError,
  MissingModelError,
  normalizeCodexSparkError,
} from "./refine-errors";

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

describe("normalizeCodexSparkError", () => {
  it.each([
    ["cli-not-found", "Install or update the Codex CLI."],
    ["auth-required", "Run `codex login`."],
    ["model-unavailable", "Codex Spark is unavailable for this account."],
    ["timed-out", "Refine timed out after 30 seconds."],
    ["output-empty", "Codex returned empty output."],
  ] as const)("maps %s to its safe actionable message", (code, message) => {
    const error = normalizeCodexSparkError({ code, message: "untrusted diagnostic" });

    expect(error).toBeInstanceOf(CodexSparkError);
    expect(error).toMatchObject({ code, message });
  });

  it.each([
    "raw diagnostic with private data",
    { code: "future-code", message: "private details" },
    { code: "toString", message: "prototype member" },
    { message: "private details" },
  ])("bounds an unrecognized failure", (failure) => {
    expect(normalizeCodexSparkError(failure)).toMatchObject({
      code: "execution-failed",
      message: "Refine failed.",
    });
  });
});
