import { type Instruction } from "@velata/core";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@velata/ui";
import { type ReactElement } from "react";

interface InstructionPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructions: readonly Instruction[];
  onRun: (instruction: Instruction) => void;
}

export function InstructionPalette({
  open,
  onOpenChange,
  instructions,
  onRun,
}: InstructionPaletteProps): ReactElement {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Run an instruction"
      description="Search instructions and run one to refine the current draft"
    >
      <CommandInput placeholder="Run an instruction…" />
      <CommandList>
        <CommandEmpty>No instructions</CommandEmpty>
        <CommandGroup>
          {instructions.map((instruction) => (
            <CommandItem
              key={instruction.id}
              value={instruction.name}
              onSelect={() => {
                onOpenChange(false);
                onRun(instruction);
              }}
            >
              <span className="text-ink min-w-0 flex-1 truncate">{instruction.name}</span>
              {instruction.isDefault ? (
                <span className="bg-raise text-ink-2 rounded-[6px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                  Default
                </span>
              ) : null}
              {instruction.shortcut !== undefined ? (
                <CommandShortcut>{instruction.shortcut}</CommandShortcut>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
