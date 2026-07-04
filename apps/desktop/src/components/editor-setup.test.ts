import { highlightingFor } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";

import { velataEditorExtensions, velataEditorKeymap } from "./editor-setup";

describe("velataEditorExtensions", () => {
  it("builds a source-mode state whose document is the raw markdown", () => {
    const state = EditorState.create({
      doc: "# Title\n**bold**",
      extensions: velataEditorExtensions,
    });

    expect(state.doc.toString()).toBe("# Title\n**bold**");
  });

  it("treats source offsets as document offsets for a programmatic selection", () => {
    const state = EditorState.create({ doc: "**bold**", extensions: velataEditorExtensions });
    const next = state.update({ selection: EditorSelection.range(2, 6) }).state;

    expect(next.selection.main.from).toBe(2);
    expect(next.selection.main.to).toBe(6);
  });

  it("does not bind app-owned copy close shortcut in CodeMirror", () => {
    expect(velataEditorKeymap.some((binding) => binding.key === "Mod-Enter")).toBe(false);
  });

  it("keeps Escape scoped to the search panel so editor Escape can dismiss the window", () => {
    const escapeBindings = velataEditorKeymap.filter((binding) => binding.key === "Escape");

    expect(escapeBindings).toHaveLength(1);
    expect(escapeBindings[0]?.scope).toBe("editor search-panel");
  });

  it("styles common fenced-code token tags without adding hue", () => {
    const state = EditorState.create({ extensions: velataEditorExtensions });

    expect(highlightingFor(state, [tags.keyword])).not.toBeNull();
    expect(highlightingFor(state, [tags.string])).not.toBeNull();
    expect(highlightingFor(state, [tags.comment])).not.toBeNull();
  });
});
