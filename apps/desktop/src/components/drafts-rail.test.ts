import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DraftsRail } from "./drafts-rail";

const drafts = [
  { id: "draft-1", text: "A saved draft", updatedAt: Date.now() },
  {
    id: "draft-2",
    text: "https://example.com/very-long-unbreakable-meeting-link",
    updatedAt: Date.now(),
  },
];

describe("DraftsRail", () => {
  it("forces the scroll viewport content to block layout so rows cannot exceed the rail width", () => {
    const html = renderToStaticMarkup(
      createElement(DraftsRail, {
        open: true,
        drafts,
        activeId: "draft-1",
        formattingOpen: false,
        transformsOpen: false,
        onSelect: vi.fn(),
        onDelete: vi.fn(),
        onCreate: vi.fn(),
        onToggleOpen: vi.fn(),
        onToggleFormatting: vi.fn(),
        onToggleTransforms: vi.fn(),
      }),
    );

    expect(html).toContain("[&amp;_[data-slot=scroll-area-viewport]&gt;div]:block!");
  });
});
