/** Returns true when the text is empty or whitespace-only. */
export function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

/** Counts whitespace-separated words; an empty/blank string counts as zero. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
