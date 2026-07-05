import "@/components/editor-theme.css";

import { EditorContent, useEditor } from "@tiptap/react";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import {
  applyFormatCommand,
  type FormatAction,
  velataExtensions,
} from "@/components/editor-extensions";

interface EditorSelectionSlice {
  from: number;
  to: number;
  text: string;
}

export interface EditorHandle {
  focus: () => void;
  getSelection: () => EditorSelectionSlice | null;
  replaceRange: (from: number, to: number, markdown: string) => void;
  applyFormat: (action: FormatAction) => void;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  dimmed: boolean;
  readOnly: boolean;
  ref: Ref<EditorHandle>;
  overlay?: ReactNode;
  toolbar?: ReactNode;
}

/** The hero editing surface: a Tiptap v3 rendered Markdown editor with overlay and toolbar slots. */
export function Editor({
  value,
  onChange,
  dimmed,
  readOnly,
  ref,
  overlay,
  toolbar,
}: EditorProps): ReactElement {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: velataExtensions,
    content: value,
    contentType: "markdown",
    editable: !readOnly,
    editorProps: {
      attributes: { "aria-label": "Scratch pad", role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current(instance.getMarkdown());
    },
  });

  useEffect(() => {
    if (value !== editor.getMarkdown()) {
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (): void => {
        editor.commands.focus();
      },
      getSelection: (): EditorSelectionSlice | null => {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          return null;
        }
        return { from, to, text: editor.state.doc.textBetween(from, to, "\n") };
      },
      replaceRange: (from: number, to: number, markdown: string): void => {
        editor
          .chain()
          .focus()
          .insertContentAt({ from, to }, markdown, { contentType: "markdown" })
          .run();
      },
      applyFormat: (action: FormatAction): void => {
        applyFormatCommand(editor, action);
      },
    }),
    [editor],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="velata-editor h-full min-h-0 overflow-y-auto"
        style={{ "--cm-fg": dimmed ? "var(--ink-2)" : "var(--ink)" } as CSSProperties}
      >
        <EditorContent editor={editor} className="min-h-full" />
      </div>
      {overlay}
      {toolbar}
    </div>
  );
}
