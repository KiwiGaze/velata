import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { DEFAULT_INSTRUCTION, type Instruction, isBlank, TRANSFORM_PRESETS } from "@velata/core";
import { Button, Select, SelectContent, SelectItem, SelectTrigger } from "@velata/ui";
import { X } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";

import { DiffOverlay } from "@/components/diff-overlay";
import { DraftsRail } from "@/components/drafts-rail";
import { Editor, type EditorHandle } from "@/components/editor";
import { FooterHints, type Hint } from "@/components/footer-hints";
import { FormattingToolbar } from "@/components/formatting-toolbar";
import { InstructionPalette } from "@/components/instruction-palette";
import { ProgressLine } from "@/components/progress-line";
import { ResizeHandles } from "@/components/resize-handles";
import { TransformBar } from "@/components/transform-bar";
import { useDrafts } from "@/hooks/use-drafts";
import { MissingApiKeyError, MissingModelError, useRefine } from "@/hooks/use-refine";
import { useScratchpadKeys } from "@/hooks/use-scratchpad-keys";
import { useSettings } from "@/hooks/use-settings";
import { type FormatAction, planFormat } from "@/lib/apply-format";
import { TARGET_OPTIONS, targetLanguageLabel, toTargetLanguage } from "@/lib/target-language";
import { pickTransforms, TRANSFORM_COUNT } from "@/lib/transforms";

type Phase =
  | { kind: "idle" }
  | { kind: "refining"; previous: string }
  | { kind: "refined"; previous: string }
  | { kind: "error"; message: string };

const DEFAULT_HINTS: readonly Hint[] = [
  { keyLabel: "⌘K", label: "Refine" },
  { keyLabel: "⌘↵", label: "Copy & Close" },
  { keyLabel: "esc", label: "Dismiss", className: "@max-[22rem]:hidden" },
];

const REFINING_HINTS: readonly Hint[] = [{ keyLabel: "esc", label: "Cancel" }];

const ERROR_MAX_LENGTH = 80;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function truncateError(message: string): string {
  if (message.length <= ERROR_MAX_LENGTH) {
    return message;
  }
  return `${message.slice(0, ERROR_MAX_LENGTH - 1)}…`;
}

export function ScratchPad(): ReactElement {
  const { settings, updateSettings } = useSettings();
  const refine = useRefine();
  const { drafts, activeId, activeText, createDraft, selectDraft, deleteDraft, updateActiveText } =
    useDrafts();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [railOpen, setRailOpen] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
  const [transformsOpen, setTransformsOpen] = useState(false);
  const [transformBatch, setTransformBatch] = useState<readonly Instruction[]>(() =>
    pickTransforms(TRANSFORM_PRESETS, TRANSFORM_COUNT, []),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [formatUndo, setFormatUndo] = useState<{
    text: string;
    selectionStart: number;
    selectionEnd: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  const focusEditor = useCallback((): void => {
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const instruction: Instruction =
    settings.instructions.find((entry) => entry.isDefault) ?? DEFAULT_INSTRUCTION;
  const refining = phase.kind === "refining";
  const model = settings.model.length > 0 ? settings.model : "No model";

  const setTargetLanguage = useCallback(
    (value: string): void => {
      const next = settings.instructions.map((entry) =>
        entry.isDefault ? { ...entry, targetLanguage: toTargetLanguage(value) } : entry,
      );
      void updateSettings({ instructions: next });
    },
    [settings.instructions, updateSettings],
  );

  const resetTransient = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFormatUndo(null);
    setPhase({ kind: "idle" });
  }, []);

  const handleCreateDraft = useCallback((): void => {
    resetTransient();
    createDraft();
  }, [resetTransient, createDraft]);

  const handleSummon = useCallback((): void => {
    if (settings.summonBehavior === "recent-draft") {
      return;
    }
    if (settings.reuseEmptyDraft && isBlank(activeText)) {
      return;
    }
    handleCreateDraft();
  }, [settings.summonBehavior, settings.reuseEmptyDraft, activeText, handleCreateDraft]);

  function handleSelectDraft(id: string): void {
    resetTransient();
    selectDraft(id);
  }

  function handleDeleteDraft(id: string): void {
    if (id === activeId) {
      resetTransient();
    }
    deleteDraft(id);
  }

  function handleDeleteActive(): void {
    handleDeleteDraft(activeId);
  }

  function handleSelectIndex(index: number): void {
    const id = drafts[index]?.id;
    if (id !== undefined) {
      handleSelectDraft(id);
    }
  }

  function handleTextChange(next: string): void {
    setFormatUndo(null);
    updateActiveText(next);
    if (phase.kind === "refined" || phase.kind === "error") {
      setPhase({ kind: "idle" });
    }
  }

  function handleApplyFormat(action: FormatAction): void {
    const editor = editorRef.current;
    if (editor === null || phase.kind === "refining") {
      return;
    }
    const selection = editor.getSelectionRange();
    const plan = planFormat(activeText, selection.start, selection.end, action);
    const next = `${activeText.slice(0, plan.replaceStart)}${plan.insert}${activeText.slice(plan.replaceEnd)}`;
    setFormatUndo({
      text: activeText,
      selectionStart: selection.start,
      selectionEnd: selection.end,
    });
    updateActiveText(next);
    if (phase.kind === "refined" || phase.kind === "error") {
      setPhase({ kind: "idle" });
    }
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(plan.selectionStart, plan.selectionEnd);
    });
  }

  function handleShuffleTransforms(): void {
    setTransformBatch((prev) => pickTransforms(TRANSFORM_PRESETS, TRANSFORM_COUNT, prev));
  }

  function handleRefine(chosen: Instruction = instruction): void {
    if (phase.kind === "refining") {
      return;
    }

    let target = activeText;
    let selectionStart = 0;
    let selectionEnd = activeText.length;
    let hasSelection = false;
    const selection = editorRef.current?.getSelectionRange();
    if (selection !== undefined && selection.start !== selection.end) {
      selectionStart = selection.start;
      selectionEnd = selection.end;
      target = activeText.slice(selectionStart, selectionEnd);
      hasSelection = true;
    }

    if (isBlank(target)) {
      return;
    }

    const previous = activeText;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "refining", previous });

    void (async () => {
      try {
        const result = await refine(chosen, target, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        const next = hasSelection
          ? `${previous.slice(0, selectionStart)}${result}${previous.slice(selectionEnd)}`
          : result;
        updateActiveText(next);
        setPhase({ kind: "refined", previous });
        focusEditor();
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof MissingApiKeyError || error instanceof MissingModelError) {
          setPhase({ kind: "error", message: "Connect a model in Settings" });
        } else {
          const message = error instanceof Error ? error.message : "Refine failed";
          setPhase({ kind: "error", message: truncateError(message) });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    })();
  }

  function handleUndo(): void {
    if (phase.kind === "refined") {
      updateActiveText(phase.previous);
      setPhase({ kind: "idle" });
      focusEditor();
      return;
    }
    if (formatUndo === null) {
      return;
    }
    updateActiveText(formatUndo.text);
    const { selectionStart, selectionEnd } = formatUndo;
    setFormatUndo(null);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function handleDismissDiff(): void {
    setPhase({ kind: "idle" });
    focusEditor();
  }

  function handleCopyClose(): void {
    void (async () => {
      await writeText(activeText);
      if (!settings.keepDraftHistory) {
        handleDeleteActive();
      }
      await invoke("hide_scratchpad");
    })();
  }

  function handleCutClose(): void {
    void (async () => {
      await writeText(activeText);
      handleDeleteActive();
      await invoke("hide_scratchpad");
    })();
  }

  function handleDismiss(): void {
    if (phase.kind === "refining") {
      abortRef.current?.abort();
      abortRef.current = null;
      setPhase({ kind: "idle" });
      return;
    }
    void invoke("hide_scratchpad");
  }

  const summonRef = useRef(handleSummon);
  const newDraftRef = useRef(handleCreateDraft);
  useEffect(() => {
    summonRef.current = handleSummon;
    newDraftRef.current = handleCreateDraft;
  }, [handleSummon, handleCreateDraft]);

  useEffect(() => {
    const unlistenPromises = [
      listen("summon", () => {
        summonRef.current();
        focusEditor();
      }),
      listen("new-draft", () => {
        newDraftRef.current();
        focusEditor();
      }),
    ];
    return () => {
      for (const promise of unlistenPromises) {
        void promise.then((unlisten) => {
          unlisten();
        });
      }
    };
  }, [focusEditor]);

  useScratchpadKeys({
    onRefine: handleRefine,
    onCopyClose: handleCopyClose,
    onCutClose: handleCutClose,
    onDismiss: handleDismiss,
    onUndo: handleUndo,
    onDeleteActive: handleDeleteActive,
    onSelectIndex: handleSelectIndex,
    onOpenPalette: () => {
      setPaletteOpen(true);
    },
    onOpenSettings: () => {
      void invoke("open_settings");
    },
    canUndo: phase.kind === "refined" || formatUndo !== null,
    draftCount: drafts.length,
    paletteOpen,
  });

  return (
    <div className="relative h-full w-full">
      <div className="bg-paper relative flex h-full w-full overflow-hidden rounded-[18px] border border-[rgba(20,22,30,0.06)]">
        <ProgressLine active={refining} />

        <InstructionPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          instructions={settings.instructions}
          onRun={handleRefine}
        />

        <DraftsRail
          open={railOpen}
          drafts={drafts}
          activeId={activeId}
          formattingOpen={formattingOpen}
          transformsOpen={transformsOpen}
          onSelect={handleSelectDraft}
          onDelete={handleDeleteDraft}
          onCreate={handleCreateDraft}
          onToggleOpen={() => {
            setRailOpen((open) => !open);
          }}
          onToggleFormatting={() => {
            setFormattingOpen((open) => !open);
            setTransformsOpen(false);
          }}
          onToggleTransforms={() => {
            setTransformsOpen((open) => !open);
            setFormattingOpen(false);
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            data-tauri-drag-region="deep"
            className="flex h-[52px] flex-none items-center justify-end gap-1 px-5"
          >
            <Select value={instruction.targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger
                aria-label="Target language"
                className="text-ink-3 hover:bg-raise hover:text-ink h-auto w-auto gap-1.5 rounded-[7px] border-0 bg-transparent px-2 py-[5px] font-mono text-[11px]"
              >
                {`→ ${targetLanguageLabel(instruction.targetLanguage)}`}
              </SelectTrigger>
              <SelectContent align="end">
                {TARGET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDismiss}
              aria-label="Close"
              className="text-ink-3 hover:bg-raise hover:text-ink size-7 rounded-[7px] border-0 bg-transparent p-0 transition-colors"
            >
              <X aria-hidden className="size-3.5" />
            </Button>
          </div>

          <Editor
            ref={editorRef}
            value={activeText}
            onChange={handleTextChange}
            dimmed={refining}
            readOnly={refining}
            overlay={
              phase.kind === "refined" ? (
                <DiffOverlay
                  before={phase.previous}
                  after={activeText}
                  onDismiss={handleDismissDiff}
                />
              ) : undefined
            }
            toolbar={
              phase.kind === "refining" ? undefined : formattingOpen ? (
                <FormattingToolbar onApply={handleApplyFormat} />
              ) : transformsOpen ? (
                <TransformBar
                  presets={transformBatch}
                  disabled={isBlank(activeText)}
                  onRun={handleRefine}
                  onShuffle={handleShuffleTransforms}
                />
              ) : undefined
            }
          />

          <div className="text-ink-3 flex min-h-[16px] flex-wrap gap-x-[14px] gap-y-1 px-10 pb-3.5 font-mono text-[11px]">
            {phase.kind === "refining" ? (
              <span className="text-ink-2">Refining…</span>
            ) : phase.kind === "refined" ? (
              <>
                <span className="text-ink-2">Refined</span>
                <span>click or type to edit</span>
                <span>⌘Z to undo</span>
              </>
            ) : phase.kind === "error" ? (
              <span className="text-ink-2">{phase.message}</span>
            ) : isBlank(activeText) ? null : (
              <>
                <span>{`${countWords(activeText).toString()} words`}</span>
                <span>draft saved</span>
              </>
            )}
          </div>

          <footer className="@container flex items-center justify-between gap-4 px-[22px] py-[13px]">
            <FooterHints hints={refining ? REFINING_HINTS : DEFAULT_HINTS} />
            <span className="text-ink-3 min-w-0 truncate font-mono text-[11px] @max-[30rem]:hidden">{`${model} · local mode`}</span>
          </footer>
        </div>
      </div>

      <ResizeHandles />
    </div>
  );
}
