import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { type PreviewPhase } from "@/lib/live-preview-scheduler";

import { type PreviewMode, PreviewPane } from "./preview-pane";

interface RenderOptions {
  text?: string;
  mode?: PreviewMode;
  phase?: PreviewPhase;
  errorMessage?: string;
}

function render(options: RenderOptions): string {
  return renderToStaticMarkup(
    createElement(PreviewPane, {
      text: options.text ?? "",
      mode: options.mode ?? "clean",
      phase: options.phase ?? "idle",
      ...(options.errorMessage === undefined ? {} : { errorMessage: options.errorMessage }),
      onModeChange: vi.fn(),
    }),
  );
}

describe("PreviewPane", () => {
  it("renders the transform toggle as an accessible radiogroup", () => {
    const html = render({});
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Preview transform"');
    const checked = html.match(/aria-checked="true"/g) ?? [];
    const unchecked = html.match(/aria-checked="false"/g) ?? [];
    expect(checked).toHaveLength(1);
    expect(unchecked).toHaveLength(1);
  });

  it("announces status through a polite live region", () => {
    expect(render({ phase: "ready", text: "done" })).toContain('aria-live="polite"');
    expect(render({ phase: "ready", text: "done" })).toContain(">live</span>");
    expect(render({ phase: "refreshing", text: "done" })).toContain(">refreshing…</span>");
  });

  it("shows a placeholder naming the mode when empty", () => {
    expect(render({ mode: "clean" })).toContain("Clean preview");
    expect(render({ mode: "structure" })).toContain("Structure preview");
  });

  it("renders result text through the shared markdown view", () => {
    const html = render({ phase: "ready", text: "- item\n**Title**" });
    expect(html).toContain('data-editor-line="true"');
    expect(html).toContain('data-editor-mark="bold"');
  });

  it("keeps the previous result visible while refreshing", () => {
    const html = render({ phase: "refreshing", text: "**Title**" });
    expect(html).toContain('data-editor-mark="bold"');
  });

  it("shows only the error message in the error phase", () => {
    const html = render({ phase: "error", text: "old result", errorMessage: "boom" });
    expect(html).toContain("boom");
    expect(html).not.toContain('data-editor-line="true"');
  });
});
