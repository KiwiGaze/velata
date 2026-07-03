import { type Instruction, isBlank, normalizeStructureOutput } from "@velata/core";

/** Lifecycle phase of the live preview. */
export type PreviewPhase = "idle" | "refreshing" | "ready" | "error";

/** Snapshot the scheduler pushes to its host on every state change. */
export interface PreviewState {
  text: string;
  phase: PreviewPhase;
  errorMessage?: string;
}

/** Runs an instruction against the provider; structurally matches the app's `RefineFn`. */
export type PreviewRefineFn = (
  instruction: Instruction,
  input: string,
  signal: AbortSignal,
) => Promise<string>;

/** Debounced live-preview scheduler; see the Live Split Refine spec §6.3. */
export interface LivePreviewScheduler {
  schedule: (source: string, instruction: Instruction, draftKey: string) => void;
  refreshNow: (source: string, instruction: Instruction, draftKey: string) => void;
  reset: (draftKey: string) => void;
}

/** Idle time after the last edit before the preview auto-refines. */
export const PREVIEW_DEBOUNCE_MS = 1500;

const CONNECT_MESSAGE = "Connect a model in Settings";

const CONFIG_ERROR_NAMES = new Set(["MissingApiKeyError", "MissingModelError"]);

interface LastRefined {
  source: string;
  instructionId: string;
}

/** Chooses what split-mode `⌘↵` copies: a shown preview result, else the raw source. */
export function previewCopyText(state: PreviewState, source: string): string {
  const showsResult =
    state.phase === "ready" || (state.phase === "refreshing" && state.text.length > 0);
  return showsResult ? state.text : source;
}

/**
 * Creates the plain (React-free, fake-timer-testable) scheduler behind the
 * live preview: 1.5s debounce, skip-unchanged, latest-wins, draft-key guard,
 * Structure-output normalization, and no auto-retry after errors.
 */
export function createLivePreviewScheduler(
  refine: PreviewRefineFn,
  onState: (state: PreviewState) => void,
): LivePreviewScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let requestId = 0;
  let lastRefined: LastRefined | null = null;
  let draftKey = "";
  let text = "";

  function emit(phase: PreviewPhase, errorMessage?: string): void {
    onState({ text, phase, ...(errorMessage === undefined ? {} : { errorMessage }) });
  }

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    controller?.abort();
    controller = null;
  }

  function clear(): void {
    cancel();
    requestId += 1;
    lastRefined = null;
    text = "";
    emit("idle");
  }

  function run(source: string, instruction: Instruction, key: string, force: boolean): void {
    draftKey = key;
    if (isBlank(source)) {
      clear();
      return;
    }
    if (
      !force &&
      lastRefined !== null &&
      lastRefined.source === source &&
      lastRefined.instructionId === instruction.id
    ) {
      return;
    }
    cancel();
    const current = new AbortController();
    controller = current;
    requestId += 1;
    const id = requestId;
    emit("refreshing");
    void refine(instruction, source, current.signal)
      .then((result) => {
        if (id !== requestId || key !== draftKey) {
          return;
        }
        text = instruction.id === "structure" ? normalizeStructureOutput(result) : result;
        lastRefined = { source, instructionId: instruction.id };
        emit("ready");
      })
      .catch((error: unknown) => {
        if (current.signal.aborted || id !== requestId || key !== draftKey) {
          return;
        }
        emit("error", describeError(error));
      })
      .finally(() => {
        if (controller === current) {
          controller = null;
        }
      });
  }

  return {
    schedule: (source, instruction, key): void => {
      draftKey = key;
      if (isBlank(source)) {
        clear();
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        run(source, instruction, key, false);
      }, PREVIEW_DEBOUNCE_MS);
    },
    refreshNow: (source, instruction, key): void => {
      run(source, instruction, key, true);
    },
    reset: (key): void => {
      draftKey = key;
      clear();
    },
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error && CONFIG_ERROR_NAMES.has(error.name)) {
    return CONNECT_MESSAGE;
  }
  return error instanceof Error ? error.message : "Refine failed";
}
