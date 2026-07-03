import { DEFAULT_REFINE_PROMPT, type Instruction } from "@velata/core";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Input,
  Kbd,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@velata/ui";
import { type ReactElement, type ReactNode } from "react";

import { useSettings } from "@/hooks/use-settings";
import { TARGET_OPTIONS, toTargetLanguage } from "@/lib/target-language";

import { PaneHeader } from "./primitives";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="mt-3 first:mt-0">
      <Label htmlFor={htmlFor} className="text-ink-2 mb-1.5 text-[11.5px]">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function RefinePane(): ReactElement {
  const { settings, updateSettings } = useSettings();
  const instructions = settings.instructions;
  const isLast = instructions.length <= 1;

  function updateField(id: string, updater: (instruction: Instruction) => Instruction): void {
    const next = instructions.map((instruction) =>
      instruction.id === id ? updater(instruction) : instruction,
    );
    void updateSettings({ instructions: next });
  }

  function setName(id: string, value: string): void {
    updateField(id, (instruction) => ({ ...instruction, name: value }));
  }

  function setPrompt(id: string, value: string): void {
    updateField(id, (instruction) => ({ ...instruction, prompt: value }));
  }

  function setTargetLanguage(id: string, value: string): void {
    updateField(id, (instruction) => ({ ...instruction, targetLanguage: toTargetLanguage(value) }));
  }

  function setShortcut(id: string, value: string): void {
    const trimmed = value.trim();
    updateField(id, (instruction) => {
      const base: Instruction = {
        id: instruction.id,
        name: instruction.name,
        prompt: instruction.prompt,
        targetLanguage: instruction.targetLanguage,
        isDefault: instruction.isDefault,
      };
      return trimmed === "" ? base : { ...base, shortcut: trimmed };
    });
  }

  function makeDefault(id: string): void {
    const next = instructions.map((instruction) => ({
      ...instruction,
      isDefault: instruction.id === id,
    }));
    void updateSettings({ instructions: next });
  }

  function deleteInstruction(id: string): void {
    if (isLast) {
      return;
    }
    const removed = instructions.find((instruction) => instruction.id === id);
    const remaining = instructions.filter((instruction) => instruction.id !== id);
    if (removed?.isDefault === true && !remaining.some((instruction) => instruction.isDefault)) {
      const [first, ...others] = remaining;
      if (first !== undefined) {
        void updateSettings({ instructions: [{ ...first, isDefault: true }, ...others] });
        return;
      }
    }
    void updateSettings({ instructions: remaining });
  }

  function addInstruction(): void {
    const created: Instruction = {
      id: crypto.randomUUID(),
      name: "New instruction",
      prompt: DEFAULT_REFINE_PROMPT,
      targetLanguage: "match-input",
      isDefault: false,
    };
    void updateSettings({ instructions: [...instructions, created] });
  }

  return (
    <section>
      <PaneHeader
        title="Refine"
        subtitle="Your rewrite instructions. ⌘K runs the default; each can also have its own shortcut."
      />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-ink-3 font-mono text-[10.5px] uppercase tracking-[0.1em]">
          Instructions
        </span>
        <Button variant="ghost" size="sm" onClick={addInstruction}>
          + New instruction
        </Button>
      </div>

      <Accordion type="multiple">
        {instructions.map((instruction) => (
          <AccordionItem key={instruction.id} value={instruction.id}>
            <AccordionTrigger>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-ink truncate text-[13.5px] font-medium">
                  {instruction.name}
                </span>
                {instruction.isDefault ? <Badge>Default</Badge> : null}
              </span>
              {instruction.shortcut !== undefined ? (
                <Kbd className="shrink-0">{instruction.shortcut}</Kbd>
              ) : null}
            </AccordionTrigger>
            <AccordionContent>
              <Field label="Name" htmlFor={`${instruction.id}-name`}>
                <Input
                  id={`${instruction.id}-name`}
                  defaultValue={instruction.name}
                  onBlur={(event) => {
                    setName(instruction.id, event.target.value);
                  }}
                />
              </Field>
              <Field label="Prompt" htmlFor={`${instruction.id}-prompt`}>
                <Textarea
                  id={`${instruction.id}-prompt`}
                  defaultValue={instruction.prompt}
                  className="border-line-2 focus-visible:border-ink-3 min-h-[176px] resize-none rounded-[9px] border px-3 py-2.5 text-[12.5px] leading-[1.6] transition-colors"
                  onBlur={(event) => {
                    setPrompt(instruction.id, event.target.value);
                  }}
                />
              </Field>
              <div className="mt-3 flex gap-4">
                <div className="flex-1">
                  <Label
                    htmlFor={`${instruction.id}-target`}
                    className="text-ink-2 mb-1.5 text-[11.5px]"
                  >
                    Target language
                  </Label>
                  <Select
                    value={instruction.targetLanguage}
                    onValueChange={(value) => {
                      setTargetLanguage(instruction.id, value);
                    }}
                  >
                    <SelectTrigger id={`${instruction.id}-target`} aria-label="Target language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Field label="Shortcut" htmlFor={`${instruction.id}-shortcut`}>
                    <Input
                      id={`${instruction.id}-shortcut`}
                      defaultValue={instruction.shortcut ?? ""}
                      placeholder="⌘⇧1"
                      onBlur={(event) => {
                        setShortcut(instruction.id, event.target.value);
                      }}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Switch
                    checked={instruction.isDefault}
                    disabled={instruction.isDefault}
                    onCheckedChange={() => {
                      makeDefault(instruction.id);
                    }}
                    aria-label="Default for ⌘K"
                  />
                  <span className="text-ink-2 text-[12.5px]">Default for ⌘K</span>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 hover:text-[#b3261e]"
                  disabled={isLast}
                  onClick={() => {
                    deleteInstruction(instruction.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
