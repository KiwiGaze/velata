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
