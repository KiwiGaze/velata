import { describe, expect, it } from "vitest";

import { computeReconcileChange } from "./editor-sync";

describe("computeReconcileChange", () => {
  it("returns null when the strings are identical", () => {
    expect(computeReconcileChange("hello", "hello")).toBeNull();
  });

  it("describes a pure append", () => {
    expect(computeReconcileChange("ab", "abc")).toEqual({ from: 2, to: 2, insert: "c" });
  });

  it("describes a pure deletion", () => {
    expect(computeReconcileChange("abc", "ab")).toEqual({ from: 2, to: 3, insert: "" });
  });

  it("describes a minimal middle replacement", () => {
    expect(computeReconcileChange("hello", "heLlo")).toEqual({ from: 2, to: 3, insert: "L" });
  });

  it("replaces the whole string when nothing is shared", () => {
    expect(computeReconcileChange("abc", "xyz")).toEqual({ from: 0, to: 3, insert: "xyz" });
  });

  it("handles insertion between a shared prefix and suffix", () => {
    expect(computeReconcileChange("ac", "abc")).toEqual({ from: 1, to: 1, insert: "b" });
  });
});
