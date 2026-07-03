import { describe, expect, it } from "vitest";

import { type FormatPlan, planFormat } from "./apply-format";

function apply(value: string, plan: FormatPlan): { value: string; selected: string } {
  const next = value.slice(0, plan.replaceStart) + plan.insert + value.slice(plan.replaceEnd);
  return { value: next, selected: next.slice(plan.selectionStart, plan.selectionEnd) };
}

describe("planFormat inline actions", () => {
  it("wraps a selection in bold markers", () => {
    const plan = planFormat("hello", 0, 5, "bold");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 5,
      insert: "**hello**",
      selectionStart: 2,
      selectionEnd: 7,
    });
    expect(apply("hello", plan)).toEqual({ value: "**hello**", selected: "hello" });
  });

  it("normalizes reversed selections before wrapping bold text", () => {
    const value = "Is Velata using a native font? How can I make it look\nmore graceful?";
    const plan = planFormat(value, 30, 0, "bold");
    expect(apply(value, plan)).toEqual({
      value: "**Is Velata using a native font?** How can I make it look\nmore graceful?",
      selected: "Is Velata using a native font?",
    });
  });

  it("unwraps bold when the selection includes the markers (case A)", () => {
    const plan = planFormat("**hello**", 0, 9, "bold");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 9,
      insert: "hello",
      selectionStart: 0,
      selectionEnd: 5,
    });
    expect(apply("**hello**", plan)).toEqual({ value: "hello", selected: "hello" });
  });

  it("unwraps bold when the markers sit just outside the selection (case B)", () => {
    const plan = planFormat("**hello**", 2, 7, "bold");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 9,
      insert: "hello",
      selectionStart: 0,
      selectionEnd: 5,
    });
  });

  it("wraps a bold selection in italics to produce bold+italic markers", () => {
    const plan = planFormat("**bold**", 0, 8, "italic");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 8,
      insert: "***bold***",
      selectionStart: 1,
      selectionEnd: 9,
    });
    expect(apply("**bold**", plan)).toEqual({ value: "***bold***", selected: "**bold**" });
  });

  it("unwraps a plain italic selection", () => {
    const plan = planFormat("*x*", 1, 2, "italic");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 3,
      insert: "x",
      selectionStart: 0,
      selectionEnd: 1,
    });
    expect(apply("*x*", plan)).toEqual({ value: "x", selected: "x" });
  });

  it("does not treat a bold marker as italic when unwrapping (case B guard)", () => {
    const plan = planFormat("**x**", 2, 3, "italic");
    expect(plan).toEqual({
      replaceStart: 2,
      replaceEnd: 3,
      insert: "*x*",
      selectionStart: 3,
      selectionEnd: 4,
    });
    expect(apply("**x**", plan)).toEqual({ value: "***x***", selected: "x" });
  });

  it("wraps a selection in code markers", () => {
    const plan = planFormat("code", 0, 4, "code");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 4,
      insert: "`code`",
      selectionStart: 1,
      selectionEnd: 5,
    });
  });

  it("wraps an empty selection in bold with the caret centered", () => {
    const plan = planFormat("", 0, 0, "bold");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 0,
      insert: "****",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });
});

describe("planFormat line actions", () => {
  it("adds bullets across multiple lines, skipping the empty line", () => {
    const plan = planFormat("a\n\nb", 0, 4, "bullet-list");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 4,
      insert: "- a\n\n- b",
      selectionStart: 0,
      selectionEnd: 8,
    });
  });

  it("removes bullets when every non-empty line already has one", () => {
    const plan = planFormat("- a\n- b", 0, 7, "bullet-list");
    expect(plan.insert).toBe("a\nb");
  });

  it("adds bullets to checklist lines instead of stripping them", () => {
    const plan = planFormat("- [ ] a\n- [ ] b", 0, 15, "bullet-list");
    expect(plan.insert).toBe("- - [ ] a\n- - [ ] b");
  });

  it("adds and removes checklist prefixes", () => {
    expect(planFormat("a\nb", 0, 3, "check-list").insert).toBe("- [ ] a\n- [ ] b");
    expect(planFormat("- [ ] a\n- [x] b", 0, 15, "check-list").insert).toBe("a\nb");
  });

  it("numbers non-empty lines from one, skipping empty lines", () => {
    const plan = planFormat("a\n\nb\nc", 0, 6, "numbered-list");
    expect(plan.insert).toBe("1. a\n\n2. b\n3. c");
  });

  it("removes numbered prefixes", () => {
    expect(planFormat("1. a\n2. b", 0, 9, "numbered-list").insert).toBe("a\nb");
  });

  it("adds and removes quote prefixes", () => {
    expect(planFormat("a\nb", 0, 3, "quote").insert).toBe("> a\n> b");
    expect(planFormat("> a\n> b", 0, 7, "quote").insert).toBe("a\nb");
  });

  it("expands a caret with no selection to the whole line", () => {
    const plan = planFormat("hello world", 5, 5, "bullet-list");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 11,
      insert: "- hello world",
      selectionStart: 0,
      selectionEnd: 13,
    });
  });

  it("does not pull in the next line when the selection ends on a newline", () => {
    const plan = planFormat("a\nb", 0, 2, "bullet-list");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 1,
      insert: "- a",
      selectionStart: 0,
      selectionEnd: 3,
    });
    expect(apply("a\nb", plan).value).toBe("- a\nb");
  });

  it("is a pure no-op when the caret sits on an empty line", () => {
    const plan = planFormat("a\n\nb", 2, 2, "bullet-list");
    expect(plan.insert).toBe("");
    expect(plan.replaceStart).toBe(plan.replaceEnd);
  });
});

describe("planFormat link action", () => {
  it("wraps a selection and selects the url placeholder", () => {
    const plan = planFormat("click here", 0, 5, "link");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 5,
      insert: "[click](url)",
      selectionStart: 8,
      selectionEnd: 11,
    });
    expect(apply("click here", plan).selected).toBe("url");
  });

  it("inserts a template and selects the text placeholder for an empty selection", () => {
    const plan = planFormat("", 0, 0, "link");
    expect(plan).toEqual({
      replaceStart: 0,
      replaceEnd: 0,
      insert: "[text](url)",
      selectionStart: 1,
      selectionEnd: 5,
    });
    expect(apply("", plan).selected).toBe("text");
  });
});
