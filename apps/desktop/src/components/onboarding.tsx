import {
  Button,
  Input,
  Kbd,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@velata/ui";
import { type ReactElement, useState } from "react";

import { VelataMark } from "@/components/logo";
import { useSettings } from "@/hooks/use-settings";
import { setApiKey } from "@/lib/keychain";

interface ProviderOption {
  value: string;
  label: string;
  baseUrl: string;
  model: string;
}

const PROVIDERS: readonly ProviderOption[] = [
  {
    value: "glm",
    label: "GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
  },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1" },
  {
    value: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "llama-3.3-70b",
  },
  { value: "kimi", label: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
];

const HERO_KEYS: readonly string[] = ["⌘", "⇧", "Space"];

export function Onboarding(): ReactElement {
  const { updateSettings } = useSettings();
  const [provider, setProvider] = useState<string>("glm");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");

  function handleStart(): void {
    const key = apiKeyInput.trim();
    const option = PROVIDERS.find((item) => item.value === provider);
    if (option === undefined || key === "") {
      void updateSettings({ onboarded: true });
      return;
    }
    void (async () => {
      await setApiKey(key);
      await updateSettings({
        provider: option.value,
        baseUrl: option.baseUrl,
        model: option.model,
        onboarded: true,
      });
    })();
  }

  function handleSkip(): void {
    void updateSettings({ onboarded: true });
  }

  return (
    <div className="bg-paper h-full overflow-y-auto rounded-[18px] border border-[rgba(20,22,30,0.06)]">
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-[440px] px-11 pb-[34px] pt-[52px] text-center">
          <VelataMark size={40} className="text-ink mx-auto mb-4 block" />
          <div className="text-ink-3 font-mono text-[12px] uppercase tracking-[0.14em]">velata</div>

          <h1 className="text-ink mb-3 mt-5 text-[30px] font-semibold leading-[1.12] tracking-[-0.025em]">
            Say it messy.
            <br />
            Send it clean.
          </h1>

          <p className="text-ink-2 mx-auto mb-[34px] max-w-[330px] text-[14px] leading-[1.55]">
            Velata catches your dictation and refines it before you paste — into your terminal, or
            anywhere.
          </p>

          <div className="border-line flex flex-col items-center gap-2.5 border-y pb-[26px] pt-[22px]">
            <span className="text-ink-3 text-[12px]">Summon it from any app with</span>
            <div className="flex gap-1.5" aria-hidden>
              {HERO_KEYS.map((keyLabel) => (
                <Kbd
                  key={keyLabel}
                  className="text-ink border-line-2 rounded-[10px] px-[15px] py-[11px] text-[15px] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                >
                  {keyLabel}
                </Kbd>
              ))}
            </div>
          </div>

          <div className="mb-2 mt-[26px] text-left">
            <Label htmlFor="onboarding-api-key" className="text-ink-2 mb-2 text-[12px] font-normal">
              Connect a model to start
            </Label>
            <div className="flex gap-2">
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="w-[130px] flex-none" aria-label="Provider">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="onboarding-api-key"
                type="password"
                value={apiKeyInput}
                placeholder="Paste your API key"
                autoComplete="off"
                onChange={(event) => {
                  setApiKeyInput(event.target.value);
                }}
              />
            </div>
          </div>

          <Button className="mt-5 h-11 w-full" onClick={handleStart}>
            Start using Velata
          </Button>

          <div className="mt-3">
            <Button variant="link" className="h-auto p-0 text-[12px]" onClick={handleSkip}>
              I’ll add a key later
            </Button>
          </div>

          <p className="text-ink-3 mt-4 font-mono text-[11px] leading-[1.7]">
            Local mode today · no microphone access · key stored in Keychain
          </p>
        </div>
      </div>
    </div>
  );
}
