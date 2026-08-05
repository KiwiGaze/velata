/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiKey: vi.fn<() => Promise<string | null>>(),
  settings: {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
  },
  testCodexSparkConnection: vi.fn(),
  testConnection: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@velata/core", () => ({ testConnection: mocks.testConnection }));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ settings: mocks.settings, updateSettings: mocks.updateSettings }),
}));
vi.mock("@/lib/codex-spark", () => ({
  testCodexSparkConnection: mocks.testCodexSparkConnection,
}));
vi.mock("@/lib/keychain", () => ({
  deleteApiKey: vi.fn(),
  getApiKey: mocks.getApiKey,
  setApiKey: vi.fn(),
}));
vi.mock("@velata/ui", async () => {
  const { createElement: element, Fragment } = await import("react");
  interface ElementProps {
    readonly children?: ReactNode;
    readonly [key: string]: unknown;
  }
  interface SelectProps extends ElementProps {
    readonly onValueChange?: (value: string) => void;
    readonly value?: string;
  }
  return {
    Button: ({ children, ...props }: ElementProps) => element("button", props, children),
    Input: (props: ElementProps) => element("input", props),
    Label: ({ children, ...props }: ElementProps) => element("label", props, children),
    Select: ({ children, onValueChange, value }: SelectProps) =>
      element(
        "select",
        {
          "aria-label": "Provider",
          value,
          onChange: (event: Event) => {
            onValueChange?.((event.target as HTMLSelectElement).value);
          },
        },
        children,
      ),
    SelectContent: ({ children }: ElementProps) => element(Fragment, null, children),
    SelectItem: ({ children, value }: ElementProps) => element("option", { value }, children),
    SelectTrigger: () => null,
    SelectValue: () => null,
  };
});

const { ModelPane } = await import("./model-pane");

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolve: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((promiseResolve) => {
    resolve = promiseResolve;
  });
  if (resolve === undefined) {
    throw new Error("Deferred promise did not initialize");
  }
  return { promise, resolve };
}

describe("ModelPane", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.settings = {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1",
    };
    mocks.getApiKey.mockResolvedValue("stored-key");
    mocks.testConnection.mockResolvedValue({ ok: true });
    mocks.testCodexSparkConnection.mockResolvedValue({ ok: true });
    mocks.updateSettings.mockImplementation((patch: Partial<typeof mocks.settings>) => {
      Object.assign(mocks.settings, patch);
      return Promise.resolve();
    });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function render(): void {
    act(() => {
      root?.render(createElement(ModelPane));
    });
  }

  async function selectProvider(value: string): Promise<void> {
    const provider = container.querySelector<HTMLSelectElement>('select[aria-label="Provider"]');
    if (provider === null) {
      throw new Error("Provider selector was not rendered");
    }
    await act(async () => {
      provider.value = value;
      provider.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    render();
  }

  async function flush(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function clickTest(): Promise<void> {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Test",
    );
    if (button === undefined) {
      throw new Error("Test button was not rendered");
    }
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
  }

  it("renders Spark guidance and tests the CLI without HTTP credentials", async () => {
    mocks.settings = {
      provider: "codex-spark",
      baseUrl: "https://saved.example/v1",
      model: "saved-http-model",
    };
    render();

    expect(container.querySelector("#model-base-url")).toBeNull();
    expect(container.querySelector("#model-api-key")).toBeNull();
    const model = container.querySelector<HTMLInputElement>('input[aria-label="Model"]');
    expect(model?.value).toBe("gpt-5.3-codex-spark");
    expect(model?.readOnly).toBe(true);
    expect(container.textContent).toContain("codex login");
    expect(container.textContent).toContain("ChatGPT Pro");
    expect(container.textContent).toContain("Spark access");

    await clickTest();

    expect(mocks.testCodexSparkConnection).toHaveBeenCalledOnce();
    expect(mocks.testConnection).not.toHaveBeenCalled();
    expect(mocks.getApiKey).not.toHaveBeenCalled();
    expect(container.textContent).toContain("connected");
  });

  it("retains HTTP controls and tests the configured endpoint", async () => {
    render();

    expect(container.querySelector<HTMLInputElement>("#model-base-url")?.value).toBe(
      "https://api.openai.com/v1",
    );
    expect(container.querySelector("#model-api-key")).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Model"]')?.value).toBe(
      "gpt-4.1",
    );

    await clickTest();

    expect(mocks.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.openai.com/v1",
        apiKey: "stored-key",
        model: "gpt-4.1",
      }),
    );
    expect(mocks.testCodexSparkConnection).not.toHaveBeenCalled();
  });

  it("clears a previous result and preserves HTTP configuration when Spark is selected", async () => {
    render();
    await clickTest();
    expect(container.textContent).toContain("connected");

    await selectProvider("codex-spark");

    expect(mocks.updateSettings).toHaveBeenCalledWith({ provider: "codex-spark" });
    expect(mocks.settings.baseUrl).toBe("https://api.openai.com/v1");
    expect(mocks.settings.model).toBe("gpt-4.1");
    expect(container.textContent).toContain("not tested");
    expect(container.textContent).not.toContain("connected");

    await selectProvider("openai");

    expect(container.querySelector<HTMLInputElement>("#model-base-url")?.value).toBe(
      "https://api.openai.com/v1",
    );
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Model"]')?.value).toBe(
      "gpt-4.1",
    );
  });

  it("does not continue a deferred key lookup after the provider changes", async () => {
    const keyLookup = createDeferred<string | null>();
    mocks.getApiKey.mockReturnValue(keyLookup.promise);
    render();
    await clickTest();

    await selectProvider("codex-spark");
    keyLookup.resolve(null);
    await flush();

    expect(mocks.testConnection).not.toHaveBeenCalled();
    expect(container.textContent).toContain("not tested");
    expect(container.textContent).not.toContain("Add a base URL");
  });

  it("does not continue a deferred key lookup after unmount", async () => {
    const keyLookup = createDeferred<string | null>();
    mocks.getApiKey.mockReturnValue(keyLookup.promise);
    render();
    await clickTest();

    act(() => {
      root?.unmount();
      root = null;
    });
    keyLookup.resolve("late-key");
    await flush();

    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it("cancels an in-flight Spark test when the provider changes", async () => {
    const connection = createDeferred<{ readonly ok: true }>();
    let signal: AbortSignal | undefined;
    mocks.settings = {
      provider: "codex-spark",
      baseUrl: "https://saved.example/v1",
      model: "saved-http-model",
    };
    mocks.testCodexSparkConnection.mockImplementation((nextSignal: AbortSignal) => {
      signal = nextSignal;
      return connection.promise;
    });
    render();
    await clickTest();

    await selectProvider("openai");
    expect(signal?.aborted).toBe(true);
    connection.resolve({ ok: true });
    await flush();

    expect(container.textContent).toContain("not tested");
    expect(container.textContent).not.toContain("connected");
  });

  it("cancels an in-flight HTTP test when the provider changes", async () => {
    const connection = createDeferred<{ readonly ok: true }>();
    let signal: AbortSignal | undefined;
    mocks.testConnection.mockImplementation((options: { readonly signal: AbortSignal }) => {
      signal = options.signal;
      return connection.promise;
    });
    render();
    await clickTest();

    await selectProvider("codex-spark");
    expect(signal?.aborted).toBe(true);
    connection.resolve({ ok: true });
    await flush();

    expect(container.textContent).toContain("not tested");
    expect(container.textContent).not.toContain("connected");
  });

  it("cancels an in-flight HTTP test on unmount", async () => {
    const connection = createDeferred<{ readonly ok: true }>();
    let signal: AbortSignal | undefined;
    mocks.testConnection.mockImplementation((options: { readonly signal: AbortSignal }) => {
      signal = options.signal;
      return connection.promise;
    });
    render();
    await clickTest();

    act(() => {
      root?.unmount();
      root = null;
    });
    expect(signal?.aborted).toBe(true);
    connection.resolve({ ok: true });
    await flush();
  });
});
