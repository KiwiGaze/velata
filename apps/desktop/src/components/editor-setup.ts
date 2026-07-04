import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { search, searchKeymap } from "@codemirror/search";
import { type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const MONO_STACK = "var(--font-mono, ui-monospace, SFMono-Regular, 'SF Mono', monospace)";

const velataHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, textDecoration: "underline", textUnderlineOffset: "3px" },
  { tag: tags.url, color: "var(--ink-3)" },
  { tag: tags.monospace, fontFamily: MONO_STACK, fontSize: "0.92em" },
  { tag: tags.processingInstruction, color: "var(--ink-3)" },
  { tag: tags.meta, color: "var(--ink-3)" },
]);

const velataTheme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "transparent", color: "var(--ink)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "-apple-system, system-ui, sans-serif",
      fontSize: "18px",
      lineHeight: "1.72",
      letterSpacing: "0",
      padding: "26px 40px 16px",
      overflowY: "auto",
    },
    ".cm-content": { color: "var(--cm-fg, var(--ink))", caretColor: "var(--ink)", padding: "0" },
    ".cm-line": { padding: "0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ink)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--raise-2)",
    },
    ".cm-panels": { backgroundColor: "var(--paper)", color: "var(--ink)" },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--line)" },
    ".cm-panel.cm-search": {
      fontFamily: "-apple-system, system-ui, sans-serif",
      padding: "6px 10px",
    },
    ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
      fontSize: "12px",
    },
    ".cm-searchMatch": { backgroundColor: "var(--raise)" },
    ".cm-searchMatch-selected": { backgroundColor: "var(--raise-2)" },
  },
  { dark: false },
);

export const velataEditorExtensions: Extension = [
  markdown({ codeLanguages: languages }),
  history(),
  drawSelection(),
  EditorView.lineWrapping,
  syntaxHighlighting(velataHighlightStyle),
  velataTheme,
  search({ top: true }),
  keymap.of([...historyKeymap, ...searchKeymap, ...defaultKeymap]),
];
