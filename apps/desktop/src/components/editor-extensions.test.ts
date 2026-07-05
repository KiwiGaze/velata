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

describe("copy & close passthrough", () => {
  function mountEditor(markdown: string): Editor {
    const host = document.createElement("div");
    document.body.appendChild(host);
    return new Editor({
      element: host,
      extensions: velataExtensions,
      content: markdown,
      contentType: "markdown",
    });
  }

  function dispatchKeydown(editor: Editor, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    editor.view.dom.dispatchEvent(event);
    return event;
  }

  it("leaves ⌘↵ unhandled inside a fenced code block", () => {
    const editor = mountEditor("```js\nconst x = 1;\n```");
    editor.commands.setTextSelection(3);
    const before = editor.getMarkdown();
    const event = dispatchKeydown(editor, { key: "Enter", metaKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(editor.getMarkdown()).toBe(before);
    editor.destroy();
  });

  it("leaves ⌘⇧↵ unhandled inside a fenced code block", () => {
    const editor = mountEditor("```js\nconst x = 1;\n```");
    editor.commands.setTextSelection(3);
    const event = dispatchKeydown(editor, { key: "Enter", metaKey: true, shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
    editor.destroy();
  });

  it("leaves Ctrl-Enter (Mod-Enter off macOS) unhandled inside a fenced code block", () => {
    const editor = mountEditor("```js\nconst x = 1;\n```");
    editor.commands.setTextSelection(3);
    const before = editor.getMarkdown();
    const event = dispatchKeydown(editor, { key: "Enter", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(editor.getMarkdown()).toBe(before);
    editor.destroy();
  });

  it("still lets the editor handle plain Enter", () => {
    const editor = mountEditor("plain text");
    editor.commands.setTextSelection(3);
    const event = dispatchKeydown(editor, { key: "Enter" });
    expect(event.defaultPrevented).toBe(true);
    editor.destroy();
  });
});
