import { describe, expect, it } from "vitest";

import { type Draft, reduceDrafts } from "./use-drafts";

function testDraft(id: string, updatedAt: number): Draft {
  return { id, text: `${id} text`, updatedAt };
}

const pristineState = {
  drafts: [{ id: "seed", text: "", updatedAt: 0 }],
  activeId: "seed",
};

describe("reduceDrafts", () => {
  it("puts a newly created draft at the top of the list", () => {
    const existing = [testDraft("newer", 2000), testDraft("older", 1000)];
    const next = reduceDrafts({ drafts: existing, activeId: "newer" }, { type: "create" });

    expect(next.drafts).toHaveLength(3);
    expect(next.drafts[0]?.id).toBe(next.activeId);
    expect(next.drafts[0]?.text).toBe("");
    expect(next.drafts.slice(1)).toEqual(existing);
  });

  it("moves the edited draft to the top so the list stays newest first", () => {
    const drafts = [testDraft("c", 3000), testDraft("b", 2000), testDraft("a", 1000)];
    const next = reduceDrafts({ drafts, activeId: "a" }, { type: "update", text: "hello" });

    expect(next.drafts.map((draft) => draft.id)).toEqual(["a", "c", "b"]);
    expect(next.drafts[0]?.text).toBe("hello");
  });

  it("sorts hydrated drafts newest first", () => {
    const stored = [testDraft("old", 1000), testDraft("mid", 2000), testDraft("new", 3000)];
    const next = reduceDrafts(pristineState, {
      type: "hydrate",
      workspace: { drafts: stored, activeId: "mid" },
    });

    expect(next.drafts.map((draft) => draft.id)).toEqual(["new", "mid", "old"]);
    expect(next.activeId).toBe("mid");
  });

  it("falls back to the newest draft when the hydrated active id is unknown", () => {
    const stored = [testDraft("old", 1000), testDraft("new", 3000)];
    const next = reduceDrafts(pristineState, {
      type: "hydrate",
      workspace: { drafts: stored, activeId: "missing" },
    });

    expect(next.activeId).toBe("new");
  });
});
