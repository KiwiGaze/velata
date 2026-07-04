// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { velataExtensions } from "./editor-extensions";

function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: velataExtensions,
    content: markdown,
    contentType: "markdown",
  });
  const out = editor.getMarkdown();
  editor.destroy();
  return out;
}

const SUBSET = [
  "**bold**",
  "*italic*",
  "`code`",
  "# Heading one",
  "## Heading two",
  "- first\n- second",
  "1. one\n2. two",
  "> quoted line",
  "[label](https://example.com)",
  "```js\nconst x = 1;\n```",
];

describe("velata markdown round-trip", () => {
  it.each(SUBSET)("is idempotent for %j", (markdown) => {
    const once = roundTrip(markdown);
    const twice = roundTrip(once);
    expect(twice).toBe(once);
  });

  it("renders bold as a <strong> element", () => {
    const editor = new Editor({
      extensions: velataExtensions,
      content: "**bold**",
      contentType: "markdown",
    });
    expect(editor.getHTML()).toContain("<strong>");
    editor.destroy();
  });
});

describe("velata markdown round-trip preserves structure", () => {
  it("keeps the heading marker and text", () => {
    const out = roundTrip("# Heading one");
    expect(out).toMatch(/^# /);
    expect(out).toContain("Heading one");
  });

  it("keeps the link target and label", () => {
    const out = roundTrip("[label](https://example.com)");
    expect(out).toContain("](https://example.com)");
    expect(out).toContain("label");
  });

  it("keeps both bullet items under a bullet marker", () => {
    const out = roundTrip("- first\n- second");
    expect(out).toContain("first");
    expect(out).toContain("second");
    expect(out).toMatch(/^[-*] /m);
  });

  it("keeps both ordered items under a numbered marker", () => {
    const out = roundTrip("1. one\n2. two");
    expect(out).toContain("one");
    expect(out).toContain("two");
    expect(out).toMatch(/^\d+[.)] /m);
  });

  it("keeps the blockquote marker and text", () => {
    const out = roundTrip("> quoted line");
    expect(out).toMatch(/^>/);
    expect(out).toContain("quoted line");
  });

  it("keeps inline code wrapped in backticks", () => {
    expect(roundTrip("`code`")).toContain("`code`");
  });

  it("keeps fenced code content inside a fence", () => {
    const out = roundTrip("```js\nconst x = 1;\n```");
    expect(out).toContain("const x = 1;");
    expect(out).toContain("```");
  });

  it.each([
    ["**bold**", "bold"],
    ["*italic*", "italic"],
  ])("keeps the emphasized word from %j", (input, word) => {
    expect(roundTrip(input)).toContain(word);
  });
});

describe("velata extension set", () => {
  it("excludes hard break so ⌘↵ stays a window shortcut", () => {
    const editor = new Editor({ extensions: velataExtensions });
    expect(editor.extensionManager.extensions.map((e) => e.name)).not.toContain("hardBreak");
    editor.destroy();
  });
});
