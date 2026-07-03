import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { loadWorkspace, saveWorkspace, type Workspace } from "@/lib/drafts-store";

/** A single scratch buffer held in the drafts workspace. */
export interface Draft {
  id: string;
  text: string;
  updatedAt: number;
}

const SAVE_DEBOUNCE_MS = 400;

interface DraftsState {
  drafts: Draft[];
  activeId: string;
}

type DraftsAction =
  | { type: "create" }
  | { type: "select"; id: string }
  | { type: "delete"; id: string }
  | { type: "update"; text: string }
  | { type: "hydrate"; workspace: Workspace };

/** The drafts workspace: the ordered list plus operations to mutate it. */
export interface DraftsController {
  drafts: Draft[];
  activeId: string;
  activeText: string;
  createDraft: () => void;
  selectDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  updateActiveText: (text: string) => void;
}

function makeDraft(): Draft {
  return { id: crypto.randomUUID(), text: "", updatedAt: Date.now() };
}

function init(): DraftsState {
  const draft = makeDraft();
  return { drafts: [draft], activeId: draft.id };
}

function reduce(state: DraftsState, action: DraftsAction): DraftsState {
  switch (action.type) {
    case "create": {
      const draft = makeDraft();
      return { drafts: [...state.drafts, draft], activeId: draft.id };
    }
    case "select": {
      if (!state.drafts.some((draft) => draft.id === action.id)) {
        return state;
      }
      return { ...state, activeId: action.id };
    }
    case "delete": {
      const index = state.drafts.findIndex((draft) => draft.id === action.id);
      if (index === -1) {
        return state;
      }
      if (state.drafts.length <= 1) {
        return init();
      }
      const drafts = state.drafts.filter((draft) => draft.id !== action.id);
      if (state.activeId !== action.id) {
        return { drafts, activeId: state.activeId };
      }
      const neighborId = drafts[Math.min(index, drafts.length - 1)]?.id ?? state.activeId;
      return { drafts, activeId: neighborId };
    }
    case "update": {
      return {
        ...state,
        drafts: state.drafts.map((draft) =>
          draft.id === state.activeId
            ? { ...draft, text: action.text, updatedAt: Date.now() }
            : draft,
        ),
      };
    }
    case "hydrate": {
      const isPristine = state.drafts.length === 1 && state.drafts[0]?.text === "";
      if (!isPristine || action.workspace.drafts.length === 0) {
        return state;
      }
      const { drafts, activeId } = action.workspace;
      const resolvedId = drafts.some((draft) => draft.id === activeId)
        ? activeId
        : (drafts[0]?.id ?? activeId);
      return { drafts, activeId: resolvedId };
    }
  }
}

/** Manages the in-memory multi-draft workspace; the list is never empty. */
export function useDrafts(): DraftsController {
  const [state, dispatch] = useReducer(reduce, undefined, init);
  const [hydrated, setHydrated] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<Workspace | null>(null);

  useEffect(() => {
    let active = true;
    void loadWorkspace().then((workspace) => {
      if (!active) {
        return;
      }
      if (workspace !== null) {
        dispatch({ type: "hydrate", workspace });
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const snapshot: Workspace = { drafts: state.drafts, activeId: state.activeId };
    latestRef.current = snapshot;
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveWorkspace(snapshot);
    }, SAVE_DEBOUNCE_MS);
  }, [hydrated, state.drafts, state.activeId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current === null) {
        return;
      }
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (latestRef.current !== null) {
        void saveWorkspace(latestRef.current);
      }
    };
  }, []);

  const createDraft = useCallback((): void => {
    dispatch({ type: "create" });
  }, []);
  const selectDraft = useCallback((id: string): void => {
    dispatch({ type: "select", id });
  }, []);
  const deleteDraft = useCallback((id: string): void => {
    dispatch({ type: "delete", id });
  }, []);
  const updateActiveText = useCallback((text: string): void => {
    dispatch({ type: "update", text });
  }, []);

  const activeText = state.drafts.find((draft) => draft.id === state.activeId)?.text ?? "";

  return {
    drafts: state.drafts,
    activeId: state.activeId,
    activeText,
    createDraft,
    selectDraft,
    deleteDraft,
    updateActiveText,
  };
}
