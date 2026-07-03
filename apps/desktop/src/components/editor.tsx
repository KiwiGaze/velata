import { cn, Textarea } from "@velata/ui";
import { type ChangeEvent, type ReactElement, type ReactNode, type Ref } from "react";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  dimmed: boolean;
  readOnly: boolean;
  ref: Ref<HTMLTextAreaElement>;
  overlay?: ReactNode;
  toolbar?: ReactNode;
}

/** The hero editing surface: a borderless textarea with an optional overlay and formatting toolbar. */
export function Editor({
  value,
  onChange,
  dimmed,
  readOnly,
  ref,
  overlay,
  toolbar,
}: EditorProps): ReactElement {
  return (
    <div className="relative min-h-0 flex-1">
      <Textarea
        ref={ref}
        autoFocus
        aria-label="Scratch pad"
        value={value}
        readOnly={readOnly}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(event.target.value);
        }}
        className={cn(
          "caret-ink focus-visible:ring-0 h-full resize-none px-10 pb-4 pt-[26px] text-[18px] leading-[1.72] tracking-[-0.003em]",
          dimmed && "text-ink-2",
        )}
      />
      {overlay}
      {toolbar}
    </div>
  );
}
