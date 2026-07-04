import { type Editor, type Extensions } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

/** Tiptap extensions for Velata: StarterKit (minus its plain code block) + Markdown + task lists + highlighted code. */
export const velataExtensions: Extensions = [
  StarterKit.configure({
    codeBlock: false,
    link: { openOnClick: false },
  }),
  Markdown.configure({ markedOptions: { gfm: true } }),
  CodeBlockLowlight.configure({ lowlight }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

/** A formatting command the toolbar can apply to the current selection. */
export type FormatAction =
  "bold" | "italic" | "code" | "bullet-list" | "numbered-list" | "check-list" | "quote" | "link";

/** Run the Tiptap command for a toolbar `action` against the current selection. */
export function applyFormatCommand(editor: Editor, action: FormatAction): void {
  const chain = editor.chain().focus();
  switch (action) {
    case "bold":
      chain.toggleBold().run();
      return;
    case "italic":
      chain.toggleItalic().run();
      return;
    case "code":
      chain.toggleCode().run();
      return;
    case "bullet-list":
      chain.toggleBulletList().run();
      return;
    case "numbered-list":
      chain.toggleOrderedList().run();
      return;
    case "check-list":
      chain.toggleTaskList().run();
      return;
    case "quote":
      chain.toggleBlockquote().run();
      return;
    case "link":
      chain.toggleLink({ href: "https://" }).run();
      return;
  }
}
