import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Editor, type EditorHandle } from "./editor";

describe("Editor", () => {
  it("keeps the editable region inside the padded scroll container", () => {
    const html = renderToStaticMarkup(
      createElement(Editor, {
        ref: createRef<EditorHandle>(),
        value: "First\n\nSecond",
        onChange: vi.fn(),
        dimmed: false,
        readOnly: false,
      }),
    );

    expect(html).toContain("data-editor-scroll");
    expect(html).toContain('role="textbox"');
    expect(html).toContain("data-editor-content-root");
    expect(html).not.toContain(
      'role="textbox" aria-label="Scratch pad" aria-multiline="true" contenteditable="true" tabindex="0" class="caret-ink focus-visible:ring-0 h-full cursor-default overflow-y-auto px-10',
    );
  });
});
