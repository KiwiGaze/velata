/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type RefineFn } from "@/hooks/use-refine";

const mocks = vi.hoisted(() => ({
  activeText: "raw draft",
  refine: vi.fn<RefineFn>(),
  settings: {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
    instructions: [
      {
        id: "default",
        name: "Clean up",
        prompt: "clean {target}",
        targetLanguage: "match-input" as const,
        isDefault: true,
      },
    ],
    summonBehavior: "recent-draft" as const,
    reuseEmptyDraft: true,
    keepDraftHistory: true,
    onboarded: true,
  },
  updateActiveText: vi.fn<(text: string) => void>(),
  updateSettings: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));
vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: vi.fn(),
  getCurrentWindow: vi.fn(),
  LogicalPosition: vi.fn(),
  LogicalSize: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@velata/ui", async () => {
  const { createElement: element, Fragment } = await import("react");
  interface ElementProps {
    readonly children?: ReactNode;
    readonly [key: string]: unknown;
  }
  return {
    Button: ({ children, ...props }: ElementProps) => element("button", props, children),
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
    Select: ({ children }: ElementProps) => element(Fragment, null, children),
    SelectContent: ({ children }: ElementProps) => element(Fragment, null, children),
    SelectItem: ({ children }: ElementProps) => element(Fragment, null, children),
    SelectTrigger: ({ children, ...props }: ElementProps) => element("button", props, children),
  };
});
vi.mock("@/components/diff-overlay", () => ({ DiffOverlay: () => null }));
vi.mock("@/components/drafts-rail", () => ({ DraftsRail: () => null }));
vi.mock("@/components/editor", async () => {
  const { createElement: element, useImperativeHandle } = await import("react");
  interface EditorProps {
    readonly value: string;
    readonly ref: React.Ref<{
      focus: () => void;
      getSelection: () => null;
      replaceRange: () => void;
      applyFormat: () => void;
    }>;
    readonly overlay?: ReactNode;
    readonly toolbar?: ReactNode;
  }
  return {
    Editor: ({ value, ref, overlay, toolbar }: EditorProps) => {
      useImperativeHandle(ref, () => ({
        focus: () => undefined,
        getSelection: () => null,
        replaceRange: () => undefined,
        applyFormat: () => undefined,
      }));
      return element("div", { "data-testid": "editor" }, value, overlay, toolbar);
    },
  };
});
vi.mock("@/components/footer-hints", () => ({ FooterHints: () => null }));
vi.mock("@/components/formatting-toolbar", () => ({ FormattingToolbar: () => null }));
vi.mock("@/components/instruction-palette", () => ({ InstructionPalette: () => null }));
vi.mock("@/components/preview-pane", () => ({ PreviewPane: () => null }));
vi.mock("@/components/progress-line", async () => {
  const { createElement: element } = await import("react");
  return {
    ProgressLine: ({ active }: { readonly active: boolean }) =>
      element("span", { "data-active": String(active), "data-testid": "progress" }),
  };
});
vi.mock("@/components/resize-handles", () => ({ ResizeHandles: () => null }));
vi.mock("@/components/transform-bar", () => ({ TransformBar: () => null }));
vi.mock("@/hooks/use-drafts", () => ({
  useDrafts: () => ({
    drafts: [{ id: "d1", text: mocks.activeText, updatedAt: 0 }],
    activeId: "d1",
    activeText: mocks.activeText,
    createDraft: vi.fn(),
    selectDraft: vi.fn(),
    deleteDraft: vi.fn(),
    updateActiveText: mocks.updateActiveText,
  }),
}));
vi.mock("@/hooks/use-live-preview", () => ({
  useLivePreview: () => ({
    text: "",
    phase: "idle",
    draftKey: "d1",
    refreshNow: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-refine", () => ({ useRefine: () => mocks.refine }));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ settings: mocks.settings, updateSettings: mocks.updateSettings }),
}));

const { ScratchPad } = await import("./scratch-pad");

interface Deferred {
  readonly promise: Promise<string>;
  readonly resolve: (value: string) => void;
  readonly reject: (reason: Error) => void;
}

function createDeferred(): Deferred {
  let resolve: ((value: string) => void) | undefined;
  let reject: ((reason: Error) => void) | undefined;
  const promise = new Promise<string>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  if (resolve === undefined || reject === undefined) {
    throw new Error("Deferred promise did not initialize");
  }
  return { promise, resolve, reject };
}

describe("ScratchPad provider switching", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.activeText = "raw draft";
    mocks.settings.provider = "openai";
    mocks.updateActiveText.mockImplementation((text) => {
      mocks.activeText = text;
    });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function render(): void {
    act(() => {
      root?.render(createElement(ScratchPad));
    });
  }

  it.each(["resolve", "reject"] as const)(
    "aborts classic refine and ignores a late %s after the provider changes",
    async (completion) => {
      const request = createDeferred();
      let signal: AbortSignal | undefined;
      mocks.refine.mockImplementation((_instruction, _input, nextSignal) => {
        signal = nextSignal;
        return request.promise;
      });
      render();

      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
      });
      expect(mocks.refine).toHaveBeenCalledOnce();
      expect(container.querySelector('[data-testid="progress"]')?.getAttribute("data-active")).toBe(
        "true",
      );

      mocks.settings.provider = "codex-spark";
      render();
      expect(signal?.aborted).toBe(true);
      expect(container.querySelector('[data-testid="progress"]')?.getAttribute("data-active")).toBe(
        "false",
      );

      await act(async () => {
        if (completion === "resolve") {
          request.resolve("stale refined text");
        } else {
          request.reject(new Error("stale provider error"));
        }
        await Promise.resolve();
      });
      render();

      expect(mocks.updateActiveText).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="editor"]')?.textContent).toBe("raw draft");
      expect(container.textContent).not.toContain("stale refined text");
      expect(container.textContent).not.toContain("stale provider error");
    },
  );
});
