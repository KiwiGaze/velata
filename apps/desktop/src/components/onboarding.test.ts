/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ updateSettings: vi.fn() }),
}));
vi.mock("@/lib/keychain", () => ({ setApiKey: vi.fn() }));
vi.mock("@velata/ui", async () => {
  const { createElement: element, Fragment } = await import("react");
  interface ElementProps {
    readonly children?: ReactNode;
    readonly [key: string]: unknown;
  }
  return {
    Button: ({ children }: ElementProps) => element("button", null, children),
    Input: () => element("input"),
    Kbd: ({ children }: ElementProps) => element("kbd", null, children),
    Label: ({ children }: ElementProps) => element("label", null, children),
    Select: ({ children }: ElementProps) => element("select", null, children),
    SelectContent: ({ children }: ElementProps) => element(Fragment, null, children),
    SelectItem: ({ children, value }: ElementProps) => element("option", { value }, children),
    SelectTrigger: () => null,
    SelectValue: () => null,
  };
});

const { Onboarding } = await import("./onboarding");

describe("Onboarding", () => {
  it("offers the HTTP presets without offering Codex Spark", () => {
    const html = renderToStaticMarkup(createElement(Onboarding));

    expect(html).toContain("GLM (Zhipu)");
    expect(html).toContain("OpenAI");
    expect(html).toContain("Cerebras");
    expect(html).toContain("Kimi (Moonshot)");
    expect(html).not.toContain("Codex Spark");
    expect(html).not.toContain("Custom…");
  });
});
