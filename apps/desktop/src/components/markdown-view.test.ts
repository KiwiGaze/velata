import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { parseFormattedMarkdown } from "@/lib/markdown-format";

import { MarkdownView } from "./markdown-view";

describe("MarkdownView", () => {
  it("keeps the editor DOM contract for lines, markers, and marks", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownView, {
        document: parseFormattedMarkdown("- item with **bold**\n> quote\nplain"),
      }),
    );
    expect(html).toContain('data-editor-line="true"');
    expect(html).toContain('data-editor-marker="true"');
    expect(html).toContain('data-editor-content="true"');
    expect(html).toContain('data-editor-mark="bold"');
    expect(html).toContain("•");
  });

  it("renders numbered, check, code, link, and empty lines", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownView, {
        document: parseFormattedMarkdown(
          "1. step with `code`\n- [ ] open\n- [x] done\n[label](https://example.com)\n",
        ),
      }),
    );
    expect(html).toContain(">1.</span>");
    expect(html).toContain("□");
    expect(html).toContain("☑");
    expect(html).toContain('data-editor-mark="code"');
    expect(html).toContain('data-editor-mark="link"');
    expect(html).toContain('data-editor-url="https://example.com"');
    expect(html).toContain("<br/>");
  });
});
