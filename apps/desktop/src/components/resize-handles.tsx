import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { type PointerEvent as ReactPointerEvent, type ReactElement, useRef } from "react";

const MIN_WIDTH = 560;
const MIN_HEIGHT = 408;

type Axis = -1 | 0 | 1;

interface Handle {
  readonly id: string;
  readonly horizontal: Axis;
  readonly vertical: Axis;
  readonly className: string;
}

const HANDLES: readonly Handle[] = [
  { id: "n", horizontal: 0, vertical: -1, className: "inset-x-0 top-0 h-1.5 cursor-ns-resize" },
  { id: "s", horizontal: 0, vertical: 1, className: "inset-x-0 bottom-0 h-1.5 cursor-ns-resize" },
  { id: "w", horizontal: -1, vertical: 0, className: "inset-y-0 left-0 w-1.5 cursor-ew-resize" },
  { id: "e", horizontal: 1, vertical: 0, className: "inset-y-0 right-0 w-1.5 cursor-ew-resize" },
  { id: "nw", horizontal: -1, vertical: -1, className: "top-0 left-0 size-3 cursor-nwse-resize" },
  { id: "ne", horizontal: 1, vertical: -1, className: "top-0 right-0 size-3 cursor-nesw-resize" },
  { id: "sw", horizontal: -1, vertical: 1, className: "bottom-0 left-0 size-3 cursor-nesw-resize" },
  { id: "se", horizontal: 1, vertical: 1, className: "bottom-0 right-0 size-3 cursor-nwse-resize" },
];

interface Metrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragSession {
  horizontal: Axis;
  vertical: Axis;
  minWidth: number;
  pointerStartX: number;
  pointerStartY: number;
  pointerX: number;
  pointerY: number;
  metrics: Metrics | null;
  frame: number | null;
}

function applyResize(session: DragSession): void {
  const { metrics } = session;
  if (metrics === null) {
    return;
  }

  const deltaX = session.pointerX - session.pointerStartX;
  const deltaY = session.pointerY - session.pointerStartY;

  let width = metrics.width;
  let height = metrics.height;
  let x = metrics.x;
  let y = metrics.y;

  if (session.horizontal === 1) {
    width = Math.max(session.minWidth, metrics.width + deltaX);
  } else if (session.horizontal === -1) {
    width = Math.max(session.minWidth, metrics.width - deltaX);
    x = metrics.x + (metrics.width - width);
  }

  if (session.vertical === 1) {
    height = Math.max(MIN_HEIGHT, metrics.height + deltaY);
  } else if (session.vertical === -1) {
    height = Math.max(MIN_HEIGHT, metrics.height - deltaY);
    y = metrics.y + (metrics.height - height);
  }

  const appWindow = getCurrentWindow();
  void appWindow.setSize(new LogicalSize(width, height));
  if (x !== metrics.x || y !== metrics.y) {
    void appWindow.setPosition(new LogicalPosition(x, y));
  }
}

interface ResizeHandlesProps {
  /** Active lower bound for drag-resize width; split mode raises it. */
  minWidth?: number;
}

export function ResizeHandles({ minWidth = MIN_WIDTH }: ResizeHandlesProps = {}): ReactElement {
  const sessionRef = useRef<DragSession | null>(null);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>, handle: Handle): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();

    const target = event.currentTarget;
    const { pointerId } = event;
    target.setPointerCapture(pointerId);

    const session: DragSession = {
      horizontal: handle.horizontal,
      vertical: handle.vertical,
      minWidth,
      pointerStartX: event.screenX,
      pointerStartY: event.screenY,
      pointerX: event.screenX,
      pointerY: event.screenY,
      metrics: null,
      frame: null,
    };
    sessionRef.current = session;

    const appWindow = getCurrentWindow();

    const scheduleApply = (): void => {
      if (session.frame !== null || session.metrics === null) {
        return;
      }
      session.frame = requestAnimationFrame(() => {
        session.frame = null;
        applyResize(session);
      });
    };

    const handleMove = (moveEvent: PointerEvent): void => {
      session.pointerX = moveEvent.screenX;
      session.pointerY = moveEvent.screenY;
      scheduleApply();
    };

    const endResize = (): void => {
      if (session.frame !== null) {
        cancelAnimationFrame(session.frame);
        session.frame = null;
      }
      sessionRef.current = null;
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);

    void (async () => {
      const [scaleFactor, position, size] = await Promise.all([
        appWindow.scaleFactor(),
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ]);
      if (sessionRef.current !== session) {
        return;
      }
      const logicalPosition = position.toLogical(scaleFactor);
      const logicalSize = size.toLogical(scaleFactor);
      session.metrics = {
        x: logicalPosition.x,
        y: logicalPosition.y,
        width: logicalSize.width,
        height: logicalSize.height,
      };
      scheduleApply();
    })();
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      {HANDLES.map((handle) => (
        <div
          key={handle.id}
          className={`pointer-events-auto absolute ${handle.className}`}
          onPointerDown={(event) => {
            beginResize(event, handle);
          }}
        />
      ))}
    </div>
  );
}
