import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { velataEditorExtensions } from "./editor-setup";

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
});
