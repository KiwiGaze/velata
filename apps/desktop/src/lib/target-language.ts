import { type TargetLanguage } from "@velata/core";

/** Selectable target languages with their display labels, in menu order. */
export const TARGET_OPTIONS: readonly { value: TargetLanguage; label: string }[] = [
  { value: "match-input", label: "Match input" },
  { value: "English", label: "English" },
  { value: "简体中文", label: "简体中文" },
  { value: "繁體中文", label: "繁體中文" },
];

/** Narrows a raw select value back to a `TargetLanguage`. */
export function toTargetLanguage(value: string): TargetLanguage {
  const match = TARGET_OPTIONS.find((option) => option.value === value);
  return match?.value ?? "match-input";
}

/** Display label for a target language (e.g. `match-input` → "Match input"). */
export function targetLanguageLabel(value: TargetLanguage): string {
  const match = TARGET_OPTIONS.find((option) => option.value === value);
  return match?.label ?? value;
}
