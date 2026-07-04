import { describe, expect, it } from "vitest";

import { parseFormattedMarkdown } from "./markdown-format";

describe("parseFormattedMarkdown", () => {
  it("renders toolbar inline formatting as visible text without raw markers", () => {
    const document = parseFormattedMarkdown("**Hello**\n*dsads*");

    expect(document.visibleText).toBe("Hello\ndsads");
    expect(document.lines[0]?.runs).toEqual([
      { text: "Hello", sourceStart: 2, sourceEnd: 7, marks: ["bold"], url: undefined },
    ]);
    expect(document.lines[1]?.runs).toEqual([
      { text: "dsads", sourceStart: 11, sourceEnd: 16, marks: ["italic"], url: undefined },
    ]);
  });

  it("renders combined bold and italic markers", () => {
    const document = parseFormattedMarkdown("***word***");

    expect(document.visibleText).toBe("word");
    expect(document.lines[0]?.runs).toEqual([
      { text: "word", sourceStart: 3, sourceEnd: 7, marks: ["bold", "italic"], url: undefined },
    ]);
  });

  it("keeps malformed markers literal", () => {
    const document = parseFormattedMarkdown("**Hello\n[text](url");

    expect(document.visibleText).toBe("**Hello\n[text](url");
    expect(document.lines[0]?.runs).toEqual([
      { text: "**Hello", sourceStart: 0, sourceEnd: 7, marks: [], url: undefined },
    ]);
    expect(document.lines[1]?.runs).toEqual([
      { text: "[text](url", sourceStart: 8, sourceEnd: 18, marks: [], url: undefined },
    ]);
  });

  it("hides supported block markers from visible text", () => {
    const document = parseFormattedMarkdown("- item\n1. next\n- [ ] task\n> quoted");

    expect(document.visibleText).toBe("item\nnext\ntask\nquoted");
    expect(document.lines.map((line) => line.kind)).toEqual([
      "bullet",
      "numbered",
      "check",
      "quote",
    ]);
    expect(document.lines.map((line) => line.marker)).toEqual(["- ", "1. ", "- [ ] ", "> "]);
  });

});
