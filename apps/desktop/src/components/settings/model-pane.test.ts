/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteApiKey: vi.fn<() => Promise<void>>(),
  getApiKey: vi.fn<() => Promise<string | null>>(),
  setApiKey: vi.fn<(key: string) => Promise<void>>(),
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
  deleteApiKey: mocks.deleteApiKey,
  getApiKey: mocks.getApiKey,
  setApiKey: mocks.setApiKey,
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
  readonly reject: (reason: unknown) => void;
  readonly resolve: (value: TValue) => void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let reject: ((reason: unknown) => void) | undefined;
  let resolve: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    reject = promiseReject;
    resolve = promiseResolve;
  });
  if (reject === undefined || resolve === undefined) {
    throw new Error("Deferred promise did not initialize");
  }
  return { promise, reject, resolve };
}

function enterInputValue(input: HTMLInputElement, value: string): void {
  const didSetValue = Reflect.set(HTMLInputElement.prototype, "value", value, input);
  if (!didSetValue) {
    throw new Error("Input value setter was not available");
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
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
    mocks.deleteApiKey.mockResolvedValue();
    mocks.setApiKey.mockResolvedValue();
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

  async function blurKeyInput(input: HTMLInputElement, value: string): Promise<void> {
    await act(async () => {
      enterInputValue(input, value);
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });
  }

  function getVisibleErrorText(): string | undefined {
    return [...container.querySelectorAll("span")]
      .map((span) => (span as Node).textContent ?? "")
      .find((text) => text.startsWith("✗ "));
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

  it("reports mounted key lookup failures and contains stale unmounted failures", async () => {
    const mountedLookup = createDeferred<string | null>();
    const staleLookup = createDeferred<string | null>();
    const untrustedReadDetail = `key read rejected: ${"detail".repeat(100)}`;
    const unhandledRejections: unknown[] = [];
    const recordUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    mocks.getApiKey
      .mockReturnValueOnce(mountedLookup.promise)
      .mockReturnValueOnce(staleLookup.promise);
    process.on("unhandledRejection", recordUnhandledRejection);

    try {
      render();
      mountedLookup.reject(new Error(untrustedReadDetail));
      await flush();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      const visibleError = getVisibleErrorText();
      const hasBoundedReadError =
        visibleError !== undefined && visibleError.length <= 80 && /key/i.test(visibleError);
      const exposesUntrustedDetail = visibleError?.includes(untrustedReadDetail) ?? false;

      act(() => {
        root?.unmount();
      });
      root = createRoot(container);
      render();
      act(() => {
        root?.unmount();
        root = null;
      });
      staleLookup.reject(new Error("stale key read rejected"));
      await flush();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      expect({
        exposesUntrustedDetail,
        hasBoundedReadError,
        unhandledRejectionCount: unhandledRejections.length,
      }).toEqual({
        exposesUntrustedDetail: false,
        hasBoundedReadError: true,
        unhandledRejectionCount: 0,
      });
    } finally {
      process.off("unhandledRejection", recordUnhandledRejection);
    }
  });

  it("preserves a newer successful save when the initial lookup completes later", async () => {
    const keyLookup = createDeferred<string | null>();
    mocks.getApiKey.mockReturnValue(keyLookup.promise);
    render();

    const keyInput = container.querySelector<HTMLInputElement>("#model-api-key");
    if (keyInput === null) {
      throw new Error("API key input was not rendered");
    }
    await act(async () => {
      enterInputValue(keyInput, "new-key");
      keyInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });

    const hasRemoveAction = (): boolean =>
      [...container.querySelectorAll("button")].some((button) => button.textContent === "Remove");
    expect(hasRemoveAction()).toBe(true);

    keyLookup.resolve(null);
    await flush();

    expect(hasRemoveAction()).toBe(true);
  });

  it("dispatches each rapid save before the earlier save settles", async () => {
    const firstSave = createDeferred<undefined>();
    const secondSave = createDeferred<undefined>();
    mocks.setApiKey.mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(secondSave.promise);
    render();

    const keyInput = container.querySelector<HTMLInputElement>("#model-api-key");
    if (keyInput === null) {
      throw new Error("API key input was not rendered");
    }
    await act(async () => {
      enterInputValue(keyInput, "first-key");
      keyInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      enterInputValue(keyInput, "newer-key");
      keyInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });

    const savesDispatchedBeforeFirstSettles = mocks.setApiKey.mock.calls.map(([key]) => key);
    firstSave.resolve(undefined);
    await flush();
    secondSave.resolve(undefined);
    await flush();

    expect(savesDispatchedBeforeFirstSettles).toEqual(["first-key", "newer-key"]);
  });

  it("keeps a newer connection test active when a pending save succeeds", async () => {
    const keySave = createDeferred<undefined>();
    const connection = createDeferred<{ readonly ok: true }>();
    mocks.setApiKey.mockReturnValue(keySave.promise);
    mocks.testConnection.mockReturnValue(connection.promise);
    render();

    const keyInput = container.querySelector<HTMLInputElement>("#model-api-key");
    if (keyInput === null) {
      throw new Error("API key input was not rendered");
    }
    await blurKeyInput(keyInput, "new-key");
    await clickTest();

    keySave.resolve(undefined);
    await flush();
    expect(container.textContent).toContain("testing…");
    expect(container.textContent).not.toContain("not tested");

    connection.resolve({ ok: true });
    await flush();

    expect(container.textContent).toContain("connected");
  });

  it("reports a failed save while preserving retry and stored-key state", async () => {
    const keyLookup = createDeferred<string | null>();
    const keySave = createDeferred<undefined>();
    const untrustedSaveDetail = `save rejected: ${"detail".repeat(100)}`;
    const unhandledRejections: unknown[] = [];
    const recordUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    mocks.getApiKey.mockReturnValue(keyLookup.promise);
    mocks.setApiKey.mockReturnValue(keySave.promise);
    process.on("unhandledRejection", recordUnhandledRejection);

    try {
      render();
      const keyInput = container.querySelector<HTMLInputElement>("#model-api-key");
      if (keyInput === null) {
        throw new Error("API key input was not rendered");
      }
      await act(async () => {
        enterInputValue(keyInput, "new-key");
        keyInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        await Promise.resolve();
      });

      keySave.reject(new Error(untrustedSaveDetail));
      await flush();
      keyLookup.resolve("stored-key");
      await flush();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      const retryInput = keyInput.value;
      const visibleError = getVisibleErrorText();
      const hasBoundedSaveError =
        visibleError !== undefined &&
        visibleError.length <= 80 &&
        /save/i.test(visibleError) &&
        /key/i.test(visibleError);
      const exposesUntrustedDetail = visibleError?.includes(untrustedSaveDetail) ?? false;

      await act(async () => {
        enterInputValue(keyInput, "");
        await Promise.resolve();
      });
      const hasRemoveAction = [...container.querySelectorAll("button")].some(
        (button) => button.textContent === "Remove",
      );
      expect({
        exposesUntrustedDetail,
        hasBoundedSaveError,
        hasRemoveAction,
        retryInput,
        unhandledRejectionCount: unhandledRejections.length,
      }).toEqual({
        exposesUntrustedDetail: false,
        hasBoundedSaveError: true,
        hasRemoveAction: true,
        retryInput: "new-key",
        unhandledRejectionCount: 0,
      });
    } finally {
      process.off("unhandledRejection", recordUnhandledRejection);
    }
  });

  it("reports a failed removal while preserving the stored-key action", async () => {
    const keyRemoval = createDeferred<undefined>();
    const untrustedRemovalDetail = `remove rejected: ${"detail".repeat(100)}`;
    const unhandledRejections: unknown[] = [];
    const recordUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    mocks.deleteApiKey.mockReturnValue(keyRemoval.promise);
    process.on("unhandledRejection", recordUnhandledRejection);

    try {
      render();
      await flush();
      const removeButton = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Remove",
      );
      if (removeButton === undefined) {
        throw new Error("Remove button was not rendered");
      }
      await act(async () => {
        removeButton.click();
        await Promise.resolve();
      });

      keyRemoval.reject(new Error(untrustedRemovalDetail));
      await flush();
      await flush();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      const visibleError = getVisibleErrorText();
      const hasBoundedRemovalError =
        visibleError !== undefined &&
        visibleError.length <= 80 &&
        /remove/i.test(visibleError) &&
        /key/i.test(visibleError);
      const exposesUntrustedDetail = visibleError?.includes(untrustedRemovalDetail) ?? false;
      const hasRemoveAction = [...container.querySelectorAll("button")].some(
        (button) => button.textContent === "Remove",
      );

      expect({
        exposesUntrustedDetail,
        hasBoundedRemovalError,
        hasRemoveAction,
        unhandledRejectionCount: unhandledRejections.length,
      }).toEqual({
        exposesUntrustedDetail: false,
        hasBoundedRemovalError: true,
        hasRemoveAction: true,
        unhandledRejectionCount: 0,
      });
    } finally {
      process.off("unhandledRejection", recordUnhandledRejection);
    }
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
