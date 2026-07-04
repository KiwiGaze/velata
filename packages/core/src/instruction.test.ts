import { describe, expect, it } from "vitest";

import { normalizeStructureOutput, STRUCTURE_INSTRUCTION } from "./instruction";

describe("STRUCTURE_INSTRUCTION", () => {
  it("is the built-in non-default structure instruction", () => {
    expect(STRUCTURE_INSTRUCTION.id).toBe("structure");
    expect(STRUCTURE_INSTRUCTION.isDefault).toBe(false);
    expect(STRUCTURE_INSTRUCTION.targetLanguage).toBe("match-input");
  });
});

describe("normalizeStructureOutput", () => {
  it("rewrites ATX headings as bold lines", () => {
    expect(normalizeStructureOutput("# Title")).toBe("**Title**");
    expect(normalizeStructureOutput("### Deploy steps")).toBe("**Deploy steps**");
  });

  it("keeps indentation before a heading", () => {
    expect(normalizeStructureOutput("  ## Indented")).toBe("  **Indented**");
  });

  it("leaves non-heading uses of # unchanged", () => {
    expect(normalizeStructureOutput("join #general today")).toBe("join #general today");
    expect(normalizeStructureOutput("#hashtag")).toBe("#hashtag");
    expect(normalizeStructureOutput("####### seven")).toBe("####### seven");
  });

  it("leaves already-clean documents unchanged", () => {
    const document = "**Title**\n- one\n1. two\n> quote";
    expect(normalizeStructureOutput(document)).toBe(document);
  });

  it("normalizes only heading lines in a mixed document", () => {
    expect(normalizeStructureOutput("# Plan\n- step\n## Next\ndone")).toBe(
      "**Plan**\n- step\n**Next**\ndone",
    );
  });
});
