import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadMock } = vi.hoisted(() => ({ loadMock: vi.fn() }));

vi.mock("@tauri-apps/plugin-store", () => ({ load: loadMock }));

beforeEach(() => {
  vi.resetModules();
  loadMock.mockReset();
});

describe("loadSettings", () => {
  it("retries opening the store after a failed first attempt", async () => {
    loadMock
      .mockRejectedValueOnce(new Error("transient open failure"))
      .mockResolvedValueOnce({ get: vi.fn().mockResolvedValue(null) });

    const { DEFAULT_SETTINGS, loadSettings } = await import("./settings");

    await expect(loadSettings()).rejects.toThrow("transient open failure");
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });
});
