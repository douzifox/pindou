import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { COLOR_BY_CODE } from "../data/palette";

type Props = {
  cells: (string | null)[];
  gridSize: number;
  onStrokeStart: () => void;
  onPaint: (index: number) => void;
};

export function Grid({ cells, gridSize, onStrokeStart, onPaint }: Props) {
  const painting = useRef(false);
  const lastIndex = useRef(-1);

  const paintAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const cellEl = el?.closest<HTMLElement>("[data-cell-index]");
    if (!cellEl) return;
    const i = Number(cellEl.dataset.cellIndex);
    if (i === lastIndex.current) return;
    onPaint(i);
    lastIndex.current = i;
  };

  const handleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    // iOS Safari 默认会把 pointer 绑给初始 target——释放掉，move 才能命中其他格子
    if (e.target instanceof Element && e.target.hasPointerCapture(e.pointerId)) {
      e.target.releasePointerCapture(e.pointerId);
    }
    painting.current = true;
    lastIndex.current = -1;
    onStrokeStart();
    paintAt(e.clientX, e.clientY);
  };

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!painting.current) return;
    e.preventDefault();
    paintAt(e.clientX, e.clientY);
  };

  const stop = () => {
    painting.current = false;
    lastIndex.current = -1;
  };

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
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
