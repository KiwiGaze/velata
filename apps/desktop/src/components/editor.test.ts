import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Editor, type EditorHandle } from "./editor";

function classNamesForMarker(html: string, marker: string): string[] {
  const match = new RegExp(`<div(?=[^>]*${marker})(?=[^>]*class="([^"]*)")[^>]*>`).exec(html);
  expect(match?.[1]).toBeDefined();
  return (match?.[1] ?? "").split(/\s+/);
}

function indexForMarker(html: string, marker: string): number {
  const index = html.indexOf(marker);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("Editor", () => {
  it("keeps the editable region inside the padded scroll container without a focus ring", () => {
    const html = renderToStaticMarkup(
      createElement(Editor, {
        ref: createRef<EditorHandle>(),
        value: "First\n\nSecond",
        onChange: vi.fn(),
        dimmed: false,
        readOnly: false,
      }),
    );
    const scrollClasses = classNamesForMarker(html, "data-editor-scroll");
    const contentRootClasses = classNamesForMarker(html, "data-editor-content-root");

    expect(indexForMarker(html, "data-editor-content-root")).toBeGreaterThan(
      indexForMarker(html, "data-editor-scroll"),
    );
    expect(scrollClasses).toEqual(
      expect.arrayContaining(["overflow-y-auto", "px-10", "pb-4", "pt-[26px]"]),
    );
    expect(contentRootClasses).not.toEqual(expect.arrayContaining(["px-10", "pb-4"]));
    expect(contentRootClasses).not.toEqual(
      expect.arrayContaining(["focus-visible:ring-2", "focus-visible:ring-ring"]),
    );
    expect(contentRootClasses).toContain("focus-visible:ring-0");
  });
});
