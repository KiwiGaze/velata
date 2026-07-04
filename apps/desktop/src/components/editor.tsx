import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import { velataEditorExtensions } from "@/components/editor-setup";
import { computeReconcileChange } from "@/lib/editor-sync";

interface EditorSelectionRange {
  start: number;
  end: number;
}

export interface EditorHandle {
  focus: () => void;
  getSelectionRange: () => EditorSelectionRange;
  setSelectionRange: (start: number, end: number) => void;
}

interface EditorProps {
  value: string;
  docId: string;
  onChange: (value: string) => void;
  dimmed: boolean;
  readOnly: boolean;
  ref: Ref<EditorHandle>;
  overlay?: ReactNode;
  toolbar?: ReactNode;
}

function readOnlyExtension(readOnly: boolean): readonly Extension[] {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function clampToDoc(view: EditorView, position: number): number {
  return Math.max(0, Math.min(position, view.state.doc.length));
}

export function Editor({
  value,
  docId,
  onChange,
  dimmed,
  readOnly,
  ref,
  overlay,
  toolbar,
}: EditorProps): ReactElement {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const lastDocIdRef = useRef(docId);
  const syncingRef = useRef(false);
  const readOnlyCompartment = useRef(new Compartment()).current;

  onChangeRef.current = onChange;
  readOnlyRef.current = readOnly;

  const buildState = useCallback(
    (doc: string): EditorState =>
      EditorState.create({
        doc,
        extensions: [
          readOnlyCompartment.of(readOnlyExtension(readOnlyRef.current)),
          velataEditorExtensions,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncingRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    [readOnlyCompartment],
  );

  useEffect(() => {
    const parent = parentRef.current;
    if (parent === null) {
      return;
    }
    const view = new EditorView({ parent, state: buildState(value) });
    viewRef.current = view;
    lastDocIdRef.current = docId;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    if (docId !== lastDocIdRef.current) {
      lastDocIdRef.current = docId;
      syncingRef.current = true;
      view.setState(buildState(value));
      syncingRef.current = false;
      return;
    }
    const current = view.state.doc.toString();
    const change = current === value ? null : computeReconcileChange(current, value);
    if (change === null) {
      return;
    }
    syncingRef.current = true;
    view.dispatch({ changes: change });
    syncingRef.current = false;
  }, [docId, value, buildState]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(readOnlyExtension(readOnly)),
    });
  }, [readOnly, readOnlyCompartment]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (): void => {
        viewRef.current?.focus();
      },
      getSelectionRange: (): EditorSelectionRange => {
        const view = viewRef.current;
        if (view === null) {
          return { start: 0, end: value.length };
        }
        const { from, to } = view.state.selection.main;
        return { start: from, end: to };
      },
      setSelectionRange: (start: number, end: number): void => {
        const view = viewRef.current;
        if (view === null) {
          return;
        }
        view.dispatch({
          selection: EditorSelection.range(clampToDoc(view, start), clampToDoc(view, end)),
          scrollIntoView: true,
        });
      },
    }),
    [value.length],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={parentRef}
        data-editor-host
        style={{ "--cm-fg": dimmed ? "var(--ink-2)" : "var(--ink)" } as CSSProperties}
        className="h-full min-h-0"
      />
      {overlay}
      {toolbar}
    </div>
  );
}
