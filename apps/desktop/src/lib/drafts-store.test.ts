import { beforeEach, describe, expect, it, vi } from "vitest";

import { type Workspace } from "./drafts-store";

const { loadMock } = vi.hoisted(() => ({ loadMock: vi.fn() }));

vi.mock("@tauri-apps/plugin-store", () => ({ load: loadMock }));

const WORKSPACE: Workspace = {
  drafts: [{ id: "d1", text: "hello", updatedAt: 1000 }],
  activeId: "d1",
};

beforeEach(() => {
  vi.resetModules();
  loadMock.mockReset();
});

describe("loadWorkspace", () => {
  it("retries opening the store after a failed first attempt", async () => {
    loadMock
      .mockRejectedValueOnce(new Error("transient open failure"))
      .mockResolvedValueOnce({ get: vi.fn().mockResolvedValue(WORKSPACE) });

    const { loadWorkspace } = await import("./drafts-store");

    await expect(loadWorkspace()).resolves.toBeNull();
    await expect(loadWorkspace()).resolves.toEqual(WORKSPACE);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it("opens the store once while loads keep succeeding", async () => {
    loadMock.mockResolvedValue({ get: vi.fn().mockResolvedValue(WORKSPACE) });

    const { loadWorkspace } = await import("./drafts-store");

    await loadWorkspace();
    await loadWorkspace();
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});
