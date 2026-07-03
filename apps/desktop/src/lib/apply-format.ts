/** A formatting command the editor toolbar can apply to the current selection. */
export type FormatAction =
  "bold" | "italic" | "code" | "bullet-list" | "numbered-list" | "check-list" | "quote" | "link";

/** An edit to apply to a textarea: what to replace and where the selection should land after. */
export interface FormatPlan {
  replaceStart: number;
  replaceEnd: number;
  insert: string;
  selectionStart: number;
  selectionEnd: number;
}

interface LineAction {
  detect: RegExp;
  prefix: (index: number) => string;
}

const BULLET: LineAction = { detect: /^- (?!\[)/, prefix: () => "- " };
const CHECK: LineAction = { detect: /^- \[[ xX]\] /, prefix: () => "- [ ] " };
const QUOTE: LineAction = { detect: /^> /, prefix: () => "> " };
const NUMBERED: LineAction = { detect: /^\d+\. /, prefix: (index) => `${index.toString()}. ` };

function planInline(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
  isItalic: boolean,
): FormatPlan {
  const markerLength = marker.length;
  const selected = value.slice(selectionStart, selectionEnd);

  const wrapsSelection =
    selected.length >= 2 * markerLength &&
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    !(isItalic && selected.startsWith("**") && selected.endsWith("**"));
  if (wrapsSelection) {
    const inner = selected.slice(markerLength, selected.length - markerLength);
    return {
      replaceStart: selectionStart,
      replaceEnd: selectionEnd,
      insert: inner,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  const innerStart = selectionStart - markerLength;
  const outerBefore = innerStart >= 0 && value.slice(innerStart, selectionStart) === marker;
  const outerAfter = value.slice(selectionEnd, selectionEnd + markerLength) === marker;
  let wrapsOutside = outerBefore && outerAfter;
  if (wrapsOutside && isItalic) {
    const before = innerStart - 1 >= 0 ? value[innerStart - 1] : undefined;
    const after = value[selectionEnd + markerLength];
    if (before === "*" || after === "*") {
      wrapsOutside = false;
    }
  }
  if (wrapsOutside) {
    return {
      replaceStart: innerStart,
      replaceEnd: selectionEnd + markerLength,
      insert: selected,
      selectionStart: innerStart,
      selectionEnd: innerStart + selected.length,
    };
  }

  return {
    replaceStart: selectionStart,
    replaceEnd: selectionEnd,
    insert: `${marker}${selected}${marker}`,
    selectionStart: selectionStart + markerLength,
    selectionEnd: selectionStart + markerLength + selected.length,
  };
}

function planLineBlock(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: LineAction,
): FormatPlan {
  const anchor =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const newlineIndex = value.indexOf("\n", anchor);
  const blockEnd = newlineIndex === -1 ? value.length : newlineIndex;

  const lines = value.slice(blockStart, blockEnd).split("\n");
  const nonEmpty = lines.filter((line) => line.length > 0);
  const allPrefixed = nonEmpty.length > 0 && nonEmpty.every((line) => action.detect.test(line));

  let index = 0;
  const rewritten = lines.map((line) => {
    if (line.length === 0) {
      return line;
    }
    if (allPrefixed) {
      return line.replace(action.detect, "");
    }
    index += 1;
    return `${action.prefix(index)}${line}`;
  });

  const insert = rewritten.join("\n");
  return {
    replaceStart: blockStart,
    replaceEnd: blockEnd,
    insert,
    selectionStart: blockStart,
    selectionEnd: blockStart + insert.length,
  };
}

function planLink(value: string, selectionStart: number, selectionEnd: number): FormatPlan {
  const selected = value.slice(selectionStart, selectionEnd);
  if (selected.length > 0) {
    const urlStart = selectionStart + 1 + selected.length + 2;
    return {
      replaceStart: selectionStart,
      replaceEnd: selectionEnd,
      insert: `[${selected}](url)`,
      selectionStart: urlStart,
      selectionEnd: urlStart + 3,
    };
  }
  const textStart = selectionStart + 1;
  return {
    replaceStart: selectionStart,
    replaceEnd: selectionEnd,
    insert: "[text](url)",
    selectionStart: textStart,
    selectionEnd: textStart + 4,
  };
}

/** Plan how `action` rewrites `value` over `[selectionStart, selectionEnd)`, using absolute offsets. */
export function planFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: FormatAction,
): FormatPlan {
  switch (action) {
    case "bold":
      return planInline(value, selectionStart, selectionEnd, "**", false);
    case "italic":
      return planInline(value, selectionStart, selectionEnd, "*", true);
    case "code":
      return planInline(value, selectionStart, selectionEnd, "`", false);
    case "bullet-list":
      return planLineBlock(value, selectionStart, selectionEnd, BULLET);
    case "numbered-list":
      return planLineBlock(value, selectionStart, selectionEnd, NUMBERED);
    case "check-list":
      return planLineBlock(value, selectionStart, selectionEnd, CHECK);
    case "quote":
      return planLineBlock(value, selectionStart, selectionEnd, QUOTE);
    case "link":
      return planLink(value, selectionStart, selectionEnd);
  }
}
