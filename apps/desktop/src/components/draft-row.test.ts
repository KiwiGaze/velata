import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DraftRow } from "./draft-row";

const draft = {
  id: "draft-1",
  text: "A saved draft",
  updatedAt: Date.now(),
};

function deleteButtonClassName(html: string): string {
  const match = /aria-label="Delete draft" class="([^"]+)"/.exec(html);
  expect(match?.[1]).toBeDefined();
  return match?.[1] ?? "";
}

describe("DraftRow", () => {
  it("keeps the delete action hidden until row hover or focus", () => {
    const html = renderToStaticMarkup(
      createElement(DraftRow, {
        draft,
        active: true,
        now: draft.updatedAt,
        onSelect: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
    const classNames = deleteButtonClassName(html).split(/\s+/);

    expect(html).toContain('aria-label="Delete draft"');
    expect(classNames).toContain("opacity-0");
    expect(classNames).toContain("group-hover:opacity-100");
    expect(classNames).toContain("group-focus-within:opacity-100");
    expect(classNames).not.toContain("opacity-100");
  });
});
