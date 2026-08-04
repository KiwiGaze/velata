import { load } from "@tauri-apps/plugin-store";

import { type Draft } from "@/hooks/use-drafts";

/** The persisted drafts workspace: the ordered draft list and active selection. */
export interface Workspace {
  drafts: Draft[];
  activeId: string;
}

const STORE_PATH = "drafts.json";
const STORE_OPTIONS = { defaults: {}, autoSave: false };
const WORKSPACE_KEY = "workspace";

// The Tauri store plugin returns the same instance for a given path; cache the
// resolved promise (lazily, so importing this module never touches the store)
// so the debounced save path doesn't re-open the store on every call. A failed
// open clears the cache so the next operation retries instead of reusing the
// rejected promise forever.
let storePromise: ReturnType<typeof load> | null = null;
function getStore(): ReturnType<typeof load> {
  storePromise ??= load(STORE_PATH, STORE_OPTIONS).catch((error: unknown) => {
    storePromise = null;
    throw error;
  });
  return storePromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDraft(value: unknown): value is Draft {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["text"] === "string" &&
    typeof value["updatedAt"] === "number"
  );
}

function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) {
    return false;
  }
  const drafts = value["drafts"];
  return Array.isArray(drafts) && drafts.every(isDraft) && typeof value["activeId"] === "string";
}

/** Reads the persisted workspace, returning null when it is absent, malformed, or unreadable. */
export async function loadWorkspace(): Promise<Workspace | null> {
  try {
    const store = await getStore();
    const stored = await store.get<unknown>(WORKSPACE_KEY);
    return isWorkspace(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists the full workspace to the drafts store in a single write. */
export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const store = await getStore();
  await store.set(WORKSPACE_KEY, workspace);
  await store.save();
}
