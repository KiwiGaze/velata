/** Refine error classes shared by the refine hook, the live-preview scheduler, and the ScratchPad. */

/** Thrown when a refine is attempted with no API key stored in the keychain. */
export class MissingApiKeyError extends Error {
  public override readonly name = "MissingApiKeyError";
  public constructor() {
    super("No API key configured");
  }
}

/** Thrown when a refine is attempted with no model configured in settings. */
export class MissingModelError extends Error {
  public override readonly name = "MissingModelError";
  public constructor() {
    super("No model configured");
  }
}

export type CodexSparkErrorCode =
  | "invalid-request"
  | "task-prompt-too-large"
  | "input-too-large"
  | "cli-not-found"
  | "cli-incompatible"
  | "auth-required"
  | "model-unavailable"
  | "execution-failed"
  | "timed-out"
  | "cancelled"
  | "output-unreadable"
  | "output-empty"
  | "output-too-large";

const CODEX_SPARK_MESSAGES = {
  "invalid-request": "Invalid request.",
  "task-prompt-too-large": "Refine instruction is too large.",
  "input-too-large": "Draft is too large.",
  "cli-not-found": "Install or update the Codex CLI.",
  "cli-incompatible": "Update the Codex CLI.",
  "auth-required": "Run `codex login`.",
  "model-unavailable": "Codex Spark is unavailable for this account.",
  "execution-failed": "Refine failed.",
  "timed-out": "Refine timed out after 30 seconds.",
  cancelled: "Refine cancelled.",
  "output-unreadable": "Could not read the refined output.",
  "output-empty": "Codex returned empty output.",
  "output-too-large": "Codex response is too large.",
} as const satisfies Readonly<Record<CodexSparkErrorCode, string>>;

const GENERIC_CODE: CodexSparkErrorCode = "execution-failed";

/** A safe, user-facing failure returned by the Codex Spark process boundary. */
export class CodexSparkError extends Error {
  public override readonly name = "CodexSparkError";
  public readonly code: CodexSparkErrorCode;

  public constructor(code: CodexSparkErrorCode) {
    super(CODEX_SPARK_MESSAGES[code]);
    this.code = code;
  }
}

/** Converts an untrusted IPC failure to a bounded Codex Spark error. */
export function normalizeCodexSparkError(error: unknown): CodexSparkError {
  if (error instanceof CodexSparkError) {
    return error;
  }
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return new CodexSparkError(GENERIC_CODE);
  }
  const code = error.code;
  if (typeof code !== "string" || !Object.hasOwn(CODEX_SPARK_MESSAGES, code)) {
    return new CodexSparkError(GENERIC_CODE);
  }
  return new CodexSparkError(code as CodexSparkErrorCode);
}

const CONNECT_MESSAGE = "Connect a model in Settings";

/**
 * Maps a refine error to the message shown to the user: a connect prompt for
 * missing API key / model, otherwise the underlying error text (or a fallback).
 */
export function describeRefineError(error: unknown): string {
  if (error instanceof MissingApiKeyError || error instanceof MissingModelError) {
    return CONNECT_MESSAGE;
  }
  return error instanceof Error && error.message.length > 0 ? error.message : "Refine failed";
}
