import { type DiffToken, diffWords, isWhitespaceToken } from "@velata/core";
import { type ReactElement, type ReactNode, useMemo } from "react";

interface DiffOverlayProps {
  before: string;
  after: string;
  onDismiss: () => void;
}

function renderToken(token: DiffToken, index: number): ReactNode {
  if (isWhitespaceToken(token) || token.type === "kept") {
    return token.text;
  }
  if (token.type === "added") {
    return (
      <span key={index} className="underline decoration-1 underline-offset-[3px]">
        {token.text}
      </span>
    );
  }
  return (
    <span key={index} className="text-ink-3 line-through">
      {token.text}
    </span>
  );
}

/**
 * Read-only before/after view drawn over the editor during the refined phase.
 * Added words are underlined and removed words struck through in a single ink,
 * per the zero-color design language. It is opaque and scrolls on its own for
 * long drafts. Clicking it — or typing in the editor — dismisses it and returns
 * to the clean, editable refined text, so it never traps the user.
 */
export function DiffOverlay({ before, after, onDismiss }: DiffOverlayProps): ReactElement {
  const tokens = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <div
      aria-hidden
      onClick={onDismiss}
      className="bg-paper text-ink absolute inset-0 cursor-text overflow-y-auto overscroll-contain px-10 pb-4 pt-[26px] text-[18px] leading-[1.72] tracking-[-0.003em] break-words whitespace-pre-wrap select-none"
    >
      {tokens.map((token, index) => renderToken(token, index))}
    </div>
  );
}
