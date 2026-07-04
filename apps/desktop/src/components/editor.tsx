import { cn } from "@velata/ui";
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { MarkdownView } from "@/components/markdown-view";
import {
  type FormattedMarkdown,
  parseFormattedMarkdown,
  sourceOffsetFromVisibleOffset,
  visibleOffsetFromSourceOffset,
} from "@/lib/markdown-format";

interface EditorSelection {
  start: number;
  end: number;
}

export interface EditorHandle {
  focus: () => void;
  getSelectionRange: () => EditorSelection;
  setSelectionRange: (start: number, end: number) => void;
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

interface DomPoint {
  node: Node;
  offset: number;
}

interface VisibleSelection {
  start: number;
  end: number;
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isText(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function isEditorMarker(node: Node): boolean {
  return isElement(node) && node.getAttribute("data-editor-marker") === "true";
}

function visibleLength(node: Node): number {
  if (isText(node)) {
    return node.data.length;
  }
  if (isEditorMarker(node)) {
    return 0;
  }
  let length = 0;
  for (const child of node.childNodes) {
    length += visibleLength(child);
  }
  return length;
}

function visibleLengthBefore(node: Node, offset: number): number {
  if (isText(node)) {
    return Math.min(offset, node.data.length);
  }
  let length = 0;
  for (let index = 0; index < offset && index < node.childNodes.length; index += 1) {
    const child = node.childNodes[index];
    if (child !== undefined) {
      length += visibleLength(child);
    }
  }
  return length;
}

function visibleOffsetWithin(node: Node, target: Node, targetOffset: number): number | null {
  if (node === target) {
    return visibleLengthBefore(node, targetOffset);
  }
  if (isText(node) || isEditorMarker(node)) {
    return null;
  }

  let length = 0;
  for (const child of node.childNodes) {
    const childOffset = visibleOffsetWithin(child, target, targetOffset);
    if (childOffset !== null) {
      return length + childOffset;
    }
    length += visibleLength(child);
  }

  return null;
}

function lineElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-editor-line='true']"));
}

function visibleOffsetFromDomPoint(root: HTMLElement, node: Node, offset: number): number {
  const lines = lineElements(root);
  let cursor = 0;

  if (node === root) {
    for (let index = 0; index < offset && index < root.childNodes.length; index += 1) {
      const child = root.childNodes[index];
      if (child !== undefined) {
        cursor += visibleLength(child);
        if (index < root.childNodes.length - 1) {
          cursor += 1;
        }
      }
    }
    return cursor;
  }

  for (const [index, line] of lines.entries()) {
    if (line === node || line.contains(node)) {
      return cursor + (visibleOffsetWithin(line, node, offset) ?? 0);
    }
    cursor += visibleLength(line);
    if (index < lines.length - 1) {
      cursor += 1;
    }
  }

  return cursor;
}

function getVisibleSelection(root: HTMLElement, fallbackEnd: number): VisibleSelection {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return { start: 0, end: 0 };
  }
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (anchor === null || focus === null || !root.contains(anchor) || !root.contains(focus)) {
    return { start: 0, end: fallbackEnd };
  }

  const anchorOffset = visibleOffsetFromDomPoint(root, anchor, selection.anchorOffset);
  const focusOffset = visibleOffsetFromDomPoint(root, focus, selection.focusOffset);
  return {
    start: Math.min(anchorOffset, focusOffset),
    end: Math.max(anchorOffset, focusOffset),
  };
}

function domPointInNode(node: Node, visibleOffset: number): DomPoint | null {
  if (isEditorMarker(node)) {
    return null;
  }
  if (isText(node)) {
    return { node, offset: Math.max(0, Math.min(visibleOffset, node.data.length)) };
  }

  let cursor = 0;
  for (const child of node.childNodes) {
    const length = visibleLength(child);
    if (length === 0) {
      continue;
    }
    if (visibleOffset <= cursor + length) {
      return domPointInNode(child, visibleOffset - cursor);
    }
    cursor += length;
  }

  return { node, offset: node.childNodes.length };
}

function domPointFromVisibleOffset(root: HTMLElement, visibleOffset: number): DomPoint {
  const lines = lineElements(root);
  let cursor = 0;

  for (const [index, line] of lines.entries()) {
    const length = visibleLength(line);
    if (visibleOffset <= cursor + length) {
      return (
        domPointInNode(line, visibleOffset - cursor) ?? {
          node: line,
          offset: line.childNodes.length,
        }
      );
    }
    cursor += length;
    if (index < lines.length - 1) {
      if (visibleOffset === cursor) {
        return domPointInNode(line, length) ?? { node: line, offset: line.childNodes.length };
      }
      cursor += 1;
    }
  }

  const last = lines.at(-1) ?? root;
  return (
    domPointInNode(last, visibleLength(last)) ?? { node: last, offset: last.childNodes.length }
  );
}

function setVisibleSelection(root: HTMLElement, start: number, end: number): void {
  const selection = window.getSelection();
  if (selection === null) {
    return;
  }
  const range = document.createRange();
  const startPoint = domPointFromVisibleOffset(root, start);
  const endPoint = domPointFromVisibleOffset(root, end);
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function sourceSelectionFromDom(root: HTMLElement, document: FormattedMarkdown): EditorSelection {
  const selection = getVisibleSelection(root, document.visibleText.length);
  return {
    start: sourceOffsetFromVisibleOffset(document, selection.start),
    end: sourceOffsetFromVisibleOffset(document, selection.end),
  };
}

function serializeNode(node: Node): string {
  if (isText(node)) {
    return node.data.replace(/\u00a0/g, " ");
  }
  if (!isElement(node) || isEditorMarker(node)) {
    return "";
  }
  if (node.tagName === "BR") {
    return "\n";
  }

  const inner = Array.from(node.childNodes).map(serializeNode).join("");
  const mark = node.getAttribute("data-editor-mark");
  if (mark === "bold italic") {
    return `***${inner}***`;
  }
  if (mark === "bold") {
    return `**${inner}**`;
  }
  if (mark === "italic") {
    return `*${inner}*`;
  }
  if (mark === "code") {
    return `\`${inner}\``;
  }
  if (mark === "link") {
    const url = node.getAttribute("data-editor-url") ?? "url";
    return `[${inner}](${url})`;
  }
  return inner;
}

function isPlaceholderBreak(node: Node): boolean {
  return isElement(node) && node.tagName === "BR";
}

function serializeContent(content: Element): string {
  const child = content.firstChild;
  if (child !== null && content.childNodes.length === 1 && isPlaceholderBreak(child)) {
    return "";
  }
  return serializeNode(content);
}

function serializeEditor(root: HTMLElement): string {
  return lineElements(root)
    .map((line) => {
      const marker = line.getAttribute("data-source-marker") ?? "";
      const content = line.querySelector("[data-editor-content='true']");
      return `${marker}${content === null ? "" : serializeContent(content)}`;
    })
    .join("\n");
}

/** The hero editing surface: a rendered Markdown editor with optional overlay and formatting toolbar. */
export function Editor({
  value,
  onChange,
  dimmed,
  readOnly,
  ref,
  overlay,
  toolbar,
}: EditorProps): ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<VisibleSelection | null>(null);
  const composingRef = useRef(false);
  const formatted = useMemo(() => parseFormattedMarkdown(value), [value]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (): void => {
        editorRef.current?.focus();
      },
      getSelectionRange: (): EditorSelection => {
        const editor = editorRef.current;
        return editor === null
          ? { start: 0, end: value.length }
          : sourceSelectionFromDom(editor, formatted);
      },
      setSelectionRange: (start: number, end: number): void => {
        const editor = editorRef.current;
        if (editor === null) {
          return;
        }
        setVisibleSelection(
          editor,
          visibleOffsetFromSourceOffset(formatted, start),
          visibleOffsetFromSourceOffset(formatted, end),
        );
      },
    }),
    [formatted, value.length],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    const pendingSelection = pendingSelectionRef.current;
    if (editor === null || pendingSelection === null || document.activeElement !== editor) {
      return;
    }
    pendingSelectionRef.current = null;
    setVisibleSelection(editor, pendingSelection.start, pendingSelection.end);
  }, [value]);

  function syncEditor(): void {
    if (readOnly) {
      return;
    }
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }
    pendingSelectionRef.current = getVisibleSelection(editor, formatted.visibleText.length);
    onChange(serializeEditor(editor));
  }

  function handleInput(): void {
    if (composingRef.current) {
      return;
    }
    syncEditor();
  }

  function handleCompositionEnd(): void {
    composingRef.current = false;
    syncEditor();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (readOnly) {
      return;
    }
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key !== "Enter" || event.metaKey || event.altKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const selection = sourceSelectionFromDom(event.currentTarget, formatted);
    const next = `${value.slice(0, selection.start)}\n${value.slice(selection.end)}`;
    pendingSelectionRef.current = {
      start: visibleOffsetFromSourceOffset(formatted, selection.start) + 1,
      end: visibleOffsetFromSourceOffset(formatted, selection.start) + 1,
    };
    onChange(next);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        data-editor-scroll
        className="h-full cursor-default overflow-y-auto px-10 pb-4 pt-[26px]"
      >
        <div
          ref={editorRef}
          data-editor-content-root
          role="textbox"
          aria-label="Scratch pad"
          aria-multiline="true"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          tabIndex={0}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={handleCompositionEnd}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          className={cn(
            "caret-ink min-h-full cursor-text text-[18px] leading-[1.72] tracking-[-0.003em] whitespace-pre-wrap outline-none focus-visible:ring-0",
            dimmed ? "text-ink-2" : "text-ink",
          )}
        >
          <div key={value}>
            <MarkdownView document={formatted} />
          </div>
        </div>
      </div>
      {overlay}
      {toolbar}
    </div>
  );
}
