import { type Instruction } from "@velata/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { type RefineFn } from "@/hooks/use-refine";
import {
  createLivePreviewScheduler,
  type LivePreviewScheduler,
  type PreviewState,
} from "@/lib/live-preview-scheduler";

/** Inputs the live-preview binding tracks; `instruction` must be memoized by the caller. */
export interface LivePreviewInputs {
  enabled: boolean;
  source: string;
  draftId: string;
  instruction: Instruction;
  refine: RefineFn;
}

/** Live preview state plus an immediate-refresh trigger for split-mode `⌘K`. */
export interface LivePreview extends PreviewState {
  refreshNow: () => void;
}

interface TrackedInputs {
  draftId: string;
  instructionId: string;
  targetLanguage: string;
  prompt: string;
}

function sameInstruction(tracked: TrackedInputs, instruction: Instruction): boolean {
  return (
    tracked.instructionId === instruction.id &&
    tracked.targetLanguage === instruction.targetLanguage &&
    tracked.prompt === instruction.prompt
  );
}

/**
 * Binds the live-preview scheduler to React state. Draft changes reset the
 * preview, instruction changes refresh immediately, source changes debounce;
 * the injected refine is read through a ref so Settings edits (model / base
 * URL) take effect without recreating the scheduler.
 */
export function useLivePreview(inputs: LivePreviewInputs): LivePreview {
  const { enabled, source, draftId, instruction, refine } = inputs;
  const [state, setState] = useState<PreviewState>({ text: "", phase: "idle" });
  const refineRef = useRef<RefineFn>(refine);
  const schedulerRef = useRef<LivePreviewScheduler | null>(null);
  const trackedRef = useRef<TrackedInputs | null>(null);

  useEffect(() => {
    refineRef.current = refine;
  }, [refine]);

  schedulerRef.current ??= createLivePreviewScheduler(
    (chosen, input, signal) => refineRef.current(chosen, input, signal),
    setState,
  );
  const scheduler = schedulerRef.current;

  useEffect(() => {
    if (!enabled) {
      trackedRef.current = null;
      scheduler.reset(draftId);
      return;
    }
    const tracked = trackedRef.current;
    trackedRef.current = {
      draftId,
      instructionId: instruction.id,
      targetLanguage: instruction.targetLanguage,
      prompt: instruction.prompt,
    };
    if (tracked?.draftId !== draftId) {
      scheduler.reset(draftId);
      scheduler.schedule(source, instruction, draftId);
      return;
    }
    if (!sameInstruction(tracked, instruction)) {
      scheduler.refreshNow(source, instruction, draftId);
      return;
    }
    scheduler.schedule(source, instruction, draftId);
  }, [scheduler, enabled, source, draftId, instruction]);

  useEffect(() => {
    return () => {
      schedulerRef.current?.reset("");
    };
  }, []);

  const refreshNow = useCallback((): void => {
    scheduler.refreshNow(source, instruction, draftId);
  }, [scheduler, source, instruction, draftId]);

  return { ...state, refreshNow };
}
