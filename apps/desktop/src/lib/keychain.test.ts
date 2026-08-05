import { beforeEach, expect, it, vi } from "vitest";

interface TestChannel {
  onmessage: (value: unknown) => void;
}

const mocks = vi.hoisted(() => ({
  channels: [] as TestChannel[],
  invoke: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class<TValue> {
    onmessage = vi.fn<(value: TValue) => void>();

    constructor() {
      mocks.channels.push(this as unknown as TestChannel);
    }
  },
  invoke: mocks.invoke,
}));

const { deleteApiKey, getApiKey, setApiKey } = await import("./keychain");

beforeEach(() => {
  mocks.channels.length = 0;
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(undefined);
});

function getChannel(): TestChannel {
  const channel = mocks.channels[0];
  if (channel === undefined) {
    throw new Error("Keychain completion channel was not created");
  }
  return channel;
}

it("waits for native keychain completion after the command is accepted", async () => {
  const save = setApiKey("test-key");
  const settlement = await Promise.race([
    save.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    new Promise<"pending">((resolve) => {
      setTimeout(() => {
        resolve("pending");
      }, 0);
    }),
  ]);

  expect(mocks.channels).toHaveLength(1);
  expect(settlement).toBe("pending");

  getChannel().onmessage({ status: "success", value: null });
  await save;

  expect(mocks.invoke).toHaveBeenCalledOnce();
  const invocation = mocks.invoke.mock.calls[0];
  expect(invocation?.[0]).toBe("set_api_key");
  expect(invocation?.[1]).toMatchObject({ key: "test-key" });
  expect(invocation?.[1]?.["onComplete"]).toBe(mocks.channels[0]);
});

it("rejects when the native keychain operation reports an error", async () => {
  const lookup = getApiKey();
  await Promise.resolve();

  getChannel().onmessage({ status: "error", value: "Keychain denied access" });

  await expect(lookup).rejects.toThrow("Keychain denied access");
});

it("rejects when the native command cannot be accepted", async () => {
  mocks.invoke.mockRejectedValue(new Error("IPC unavailable"));

  await expect(deleteApiKey()).rejects.toThrow("IPC unavailable");
});
