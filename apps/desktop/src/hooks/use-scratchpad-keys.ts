import { useEffect, useRef } from "react";

/** Callbacks invoked by the in-window ScratchPad keybindings. */
export interface ScratchpadKeyHandlers {
  onRefine: () => void;
  onCopyClose: () => void;
  onCutClose: () => void;
  onDismiss: () => void;
  onUndo: () => void;
  onDeleteActive: () => void;
  onSelectIndex: (index: number) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  canUndo: boolean;
  draftCount: number;
  paletteOpen: boolean;
}

/**
 * Wires the ScratchPad keyboard shortcuts to a window `keydown` listener.
 * Handlers are read through a ref so the listener stays attached across renders.
 */
export function useScratchpadKeys(handlers: ScratchpadKeyHandlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.isComposing) {
        return;
      }

      const current = handlersRef.current;

      if (current.paletteOpen) {
        return;
      }

      if (event.key === "Escape") {
        current.onDismiss();
        return;
      }

      if (!event.metaKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "enter") {
        event.preventDefault();
        if (event.shiftKey) {
          current.onCutClose();
        } else {
          current.onCopyClose();
        }
        return;
      }

      if (key === "k") {
        event.preventDefault();
        current.onRefine();
        return;
      }

      if (key === "p") {
        event.preventDefault();
        current.onOpenPalette();
        return;
      }

      if (key === ",") {
        event.preventDefault();
        current.onOpenSettings();
        return;
      }

      if (key === "w") {
        event.preventDefault();
        current.onDeleteActive();
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (index < current.draftCount) {
          event.preventDefault();
          current.onSelectIndex(index);
        }
        return;
      }

      if (key === "z" && !event.shiftKey && current.canUndo) {
        event.preventDefault();
        current.onUndo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
