/** Returns true when the text is empty or whitespace-only. */
export function isBlank(text: string): boolean {
  return text.trim().length === 0;
}
