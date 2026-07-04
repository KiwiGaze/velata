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
