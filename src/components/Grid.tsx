import { useEffect, useRef } from "react";
import { COLOR_BY_CODE } from "../data/palette";

type Props = {
  cells: (string | null)[];
  gridSize: number;
  onStrokeStart: () => void;
  onPaint: (index: number) => void;
};

export function Grid({ cells, gridSize, onStrokeStart, onPaint }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const onPaintRef = useRef(onPaint);
  const onStrokeStartRef = useRef(onStrokeStart);

  useEffect(() => {
    onPaintRef.current = onPaint;
    onStrokeStartRef.current = onStrokeStart;
  });

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    let painting = false;
    let lastIndex = -1;

    const paintAt = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      const cellEl = el?.closest<HTMLElement>("[data-cell-index]");
      if (!cellEl) return;
      const i = Number(cellEl.dataset.cellIndex);
      if (i === lastIndex) return;
      onPaintRef.current(i);
      lastIndex = i;
    };

    const start = (clientX: number, clientY: number) => {
      painting = true;
      lastIndex = -1;
      onStrokeStartRef.current();
      paintAt(clientX, clientY);
    };

    const stop = () => {
      painting = false;
      lastIndex = -1;
    };

    // iOS Safari 的触控走 touch 事件——pointer events 在 touch 类型 pointer 上
    // setPointerCapture 行为不可靠，会把 pointermove 锁死在初始 cell 上
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      start(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!painting) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      paintAt(t.clientX, t.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      start(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!painting) return;
      paintAt(e.clientX, e.clientY);
    };

    grid.addEventListener("touchstart", onTouchStart, { passive: false });
    grid.addEventListener("touchmove", onTouchMove, { passive: false });
    grid.addEventListener("touchend", stop);
    grid.addEventListener("touchcancel", stop);
    grid.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);

    return () => {
      grid.removeEventListener("touchstart", onTouchStart);
      grid.removeEventListener("touchmove", onTouchMove);
      grid.removeEventListener("touchend", stop);
      grid.removeEventListener("touchcancel", stop);
      grid.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
    };
  }, []);

  return (
    <div
      ref={gridRef}
      className="grid"
      style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
    >
      {cells.map((code, i) => {
        const hex = code ? COLOR_BY_CODE.get(code)?.hex : undefined;
        return (
          <div
            key={i}
            data-cell-index={i}
            className="cell"
            style={hex ? { background: hex } : undefined}
            role="gridcell"
            aria-label={code ?? "空"}
          />
        );
      })}
    </div>
  );
}
