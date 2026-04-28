import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Grid } from "./Grid";
import { Palette } from "./Palette";
import { Slots } from "./Slots";
import {
  COLOR_BY_CODE,
  DEFAULT_GRID_SIZE,
  PALETTE_24,
  getPaletteBySize,
} from "../data/palette";
import { imageToBeads } from "../lib/imageToBeads";
import { cellsToPreview } from "../lib/preview";
import { loadSlots, saveSlots, SLOT_COUNT, type Slot } from "../lib/storage";

type Cells = (string | null)[];
type Board = { cells: Cells; gridSize: number };

const HISTORY_LIMIT = 50;

const emptyBoard = (gridSize: number = DEFAULT_GRID_SIZE): Board => ({
  cells: Array(gridSize * gridSize).fill(null),
  gridSize,
});
const isEmpty = (cells: Cells) => cells.every((c) => c === null);

export function Editor() {
  const [selectedCode, setSelectedCode] = useState<string | null>(PALETTE_24[0].code);
  // 色板规模：24（默认）或 48。切到 48 跟拖滑块一样，标记为"用户已自定义"，下次上传也用 48
  const [paletteSize, setPaletteSize] = useState<24 | 48>(24);
  const [hasCustomPalette, setHasCustomPalette] = useState(false);
  const [tool, setTool] = useState<"paint" | "bucket">("paint");
  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [past, setPast] = useState<Board[]>([]);
  const [futureStack, setFutureStack] = useState<Board[]>([]);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<(Slot | null)[]>(() => new Array(SLOT_COUNT).fill(null));
  // 当前打开的存档位置：load 后再按 💾 默认覆盖它，不再跑去新位置
  const [currentSlotIndex, setCurrentSlotIndex] = useState<number | null>(null);
  // 自定义画板尺寸：
  //   customSizeEnabled = 是否显示滑块 UI（防误触）
  //   hasCustomSized   = 用户是否主动拖过滑块（一次拖过就持续 true，下次上传也用同一尺寸）
  //   customGridSize   = 当前尺寸
  const [customSizeEnabled, setCustomSizeEnabled] = useState(false);
  const [hasCustomSized, setHasCustomSized] = useState(false);
  const [customGridSize, setCustomGridSize] = useState(DEFAULT_GRID_SIZE);
  // 缓存最后一次上传的图，让滑块停下时能用同一张图重渲染（不用再选文件）
  const [lastFile, setLastFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSlots(loadSlots());
  }, []);

  // 滑块停下 / 切色板规模时用同一张原图重渲染（300ms debounce）。
  // 触发条件：有缓存原图 + 用户主动改过尺寸或色板（避免 mount 时一开关就触发）
  useEffect(() => {
    if (!lastFile) return;
    if (!hasCustomSized && !hasCustomPalette) return;
    const timer = setTimeout(async () => {
      try {
        setBusy(true);
        const result = await imageToBeads(
          lastFile,
          hasCustomSized ? customGridSize : undefined,
          hasCustomPalette ? paletteSize : 24,
        );
        setBoard({ cells: result.cells, gridSize: result.gridSize });
      } catch (err) {
        console.error(err);
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    customGridSize,
    customSizeEnabled,
    hasCustomSized,
    paletteSize,
    hasCustomPalette,
    lastFile,
  ]);

  // 用 functional update 读最新 slots，避免连续操作时 closure 拿到陈旧值把改动覆盖回去
  const updateSlots = (updater: (prev: (Slot | null)[]) => (Slot | null)[]) => {
    setSlots((prev) => {
      const next = updater(prev);
      saveSlots(next);
      return next;
    });
  };

  const pushHistory = useCallback((current: Board) => {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current]);
    setFutureStack([]);
  }, []);

  const startStroke = useCallback(() => {
    pushHistory(board);
  }, [board, pushHistory]);

  const paint = useCallback(
    (index: number) => {
      if (tool === "bucket") {
        setBoard((b) => {
          const oldCode = b.cells[index];
          if (oldCode === selectedCode) return b;
          // Flood fill：从 index 出发，4-连通找所有同色相邻 cell 一起换
          const cells = b.cells.slice();
          const gs = b.gridSize;
          const stack = [index];
          while (stack.length > 0) {
            const idx = stack.pop()!;
            if (cells[idx] !== oldCode) continue;
            cells[idx] = selectedCode;
            const cy = (idx / gs) | 0;
            const cx = idx - cy * gs;
            if (cx > 0) stack.push(idx - 1);
            if (cx < gs - 1) stack.push(idx + 1);
            if (cy > 0) stack.push(idx - gs);
            if (cy < gs - 1) stack.push(idx + gs);
          }
          return { ...b, cells };
        });
        setTool("paint"); // 用一次自动切回画笔，避免拖拽误触发多次替换
        return;
      }
      setBoard((b) => {
        if (b.cells[index] === selectedCode) return b;
        const cells = b.cells.slice();
        cells[index] = selectedCode;
        return { ...b, cells };
      });
    },
    [selectedCode, tool],
  );

  const undo = () => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFutureStack((f) => [board, ...f.slice(0, HISTORY_LIMIT - 1)]);
    setBoard(prev);
  };

  const redo = () => {
    if (futureStack.length === 0) return;
    const next = futureStack[0];
    setFutureStack((f) => f.slice(1));
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), board]);
    setBoard(next);
  };

  const clear = () => {
    if (isEmpty(board.cells)) return;
    pushHistory(board);
    setBoard(emptyBoard(board.gridSize));
    setCurrentSlotIndex(null);
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      // 用户拖过滑块就一直用那个尺寸；切过 48 色就一直用 48（哪怕开关收起）
      const result = await imageToBeads(
        file,
        hasCustomSized ? customGridSize : undefined,
        hasCustomPalette ? paletteSize : 24,
      );
      pushHistory(board);
      setBoard({ cells: result.cells, gridSize: result.gridSize });
      setCurrentSlotIndex(null);
      setLastFile(file);
    } catch (err) {
      console.error(err);
      alert("照片打不开，换一张试试~");
    } finally {
      setBusy(false);
    }
  };

  const saveToSlot = (index: number) => {
    if (isEmpty(board.cells)) return;
    const slot: Slot = {
      cells: board.cells.slice(),
      gridSize: board.gridSize,
      preview: cellsToPreview(board.cells, board.gridSize),
      savedAt: Date.now(),
    };
    updateSlots((prev) => {
      const next = prev.slice();
      next[index] = slot;
      return next;
    });
  };

  const loadFromSlot = (index: number) => {
    const slot = slots[index];
    if (!slot) return;
    // 加载存档 = 清空历史栈，避免 undo 跨过 load 边界把"加载前的画"再倒回来
    setPast([]);
    setFutureStack([]);
    setBoard({ cells: slot.cells.slice(), gridSize: slot.gridSize });
    setCurrentSlotIndex(index);
  };

  const deleteSlot = (index: number) => {
    if (currentSlotIndex === index) setCurrentSlotIndex(null);
    updateSlots((prev) => {
      const next = prev.slice();
      next[index] = null;
      return next;
    });
  };

  const handleExport = () => {
    if (isEmpty(board.cells)) return;
    const PIXEL = 24;
    const GRID_W = board.gridSize * PIXEL;

    // 统计每种颜色的颗粒数（按调色板原顺序，方便对照实物色卡）
    const counts = new Map<string, number>();
    for (const code of board.cells) {
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const entries = getPaletteBySize(48).filter((c) => counts.has(c.code)).map((c) => ({
      code: c.code,
      hex: c.hex,
      count: counts.get(c.code)!,
    }));
    const total = entries.reduce((s, e) => s + e.count, 0);

    // 色卡区布局
    const SWATCH = 28;
    const ENTRY_GAP_X = 18;
    const ROW_GAP = 12;
    const ROW_H = SWATCH + ROW_GAP;
    const TEXT_PAD = 8;
    const ENTRY_W = SWATCH + TEXT_PAD + 84; // 色块 + 间距 + 文字预留
    const SIDE_PAD = 24;
    const TOP_PAD = 24;
    const usableW = GRID_W - SIDE_PAD * 2;
    const ENTRIES_PER_ROW = Math.max(
      1,
      Math.floor((usableW + ENTRY_GAP_X) / (ENTRY_W + ENTRY_GAP_X)),
    );
    const ROWS = Math.ceil(entries.length / ENTRIES_PER_ROW);
    const PALETTE_H = TOP_PAD + ROWS * ROW_H + 36; // +36 给底部"总计"留空间

    const canvas = document.createElement("canvas");
    canvas.width = GRID_W;
    canvas.height = GRID_W + PALETTE_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. 整张底色
    ctx.fillStyle = "#faf3e7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. 拼豆图区域
    ctx.fillStyle = "#e6dccb";
    ctx.fillRect(0, 0, GRID_W, GRID_W);
    for (let i = 0; i < board.cells.length; i++) {
      const code = board.cells[i];
      const cx = i % board.gridSize;
      const cy = Math.floor(i / board.gridSize);
      const hex = code ? COLOR_BY_CODE.get(code)?.hex : "#faf3e7";
      if (!hex) continue;
      ctx.fillStyle = hex;
      ctx.fillRect(cx * PIXEL + 1, cy * PIXEL + 1, PIXEL - 1, PIXEL - 1);
    }

    // 3. 色卡 + 颗粒数
    ctx.textBaseline = "middle";
    const sectionY = GRID_W + TOP_PAD;
    ctx.font = "14px -apple-system, system-ui, 'PingFang SC', sans-serif";
    for (let i = 0; i < entries.length; i++) {
      const row = Math.floor(i / ENTRIES_PER_ROW);
      const col = i % ENTRIES_PER_ROW;
      const x = SIDE_PAD + col * (ENTRY_W + ENTRY_GAP_X);
      const y = sectionY + row * ROW_H;

      ctx.fillStyle = entries[i].hex;
      ctx.fillRect(x, y, SWATCH, SWATCH);
      ctx.strokeStyle = "#d8cdb8";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, SWATCH - 1, SWATCH - 1);

      ctx.fillStyle = "#333";
      ctx.fillText(
        `${entries[i].code}  ×${entries[i].count}`,
        x + SWATCH + TEXT_PAD,
        y + SWATCH / 2,
      );
    }

    // 4. 总计
    ctx.font = "bold 14px -apple-system, system-ui, 'PingFang SC', sans-serif";
    ctx.fillStyle = "#555";
    ctx.textAlign = "right";
    ctx.fillText(
      `总计 ${total} 颗 · ${entries.length} 色`,
      GRID_W - SIDE_PAD,
      sectionY + ROWS * ROW_H + 16,
    );
    ctx.textAlign = "start";

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pindou-${board.gridSize}x${board.gridSize}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const handleSaveClick = () => {
    if (isEmpty(board.cells)) return;
    // 已关联当前 slot（从某 slot load 进来过）→ 直接覆盖那个 slot
    if (currentSlotIndex !== null && slots[currentSlotIndex]) {
      saveToSlot(currentSlotIndex);
      return;
    }
    // 没关联 → 重复检测：内容跟某个已存 slot 完全一样就不重复创建，并把它认作当前 slot
    const dupIdx = slots.findIndex(
      (s) =>
        s !== null &&
        s.gridSize === board.gridSize &&
        s.cells.length === board.cells.length &&
        s.cells.every((c, i) => c === board.cells[i]),
    );
    if (dupIdx !== -1) {
      setCurrentSlotIndex(dupIdx);
      return;
    }
    const empty = slots.findIndex((s) => s === null);
    if (empty === -1) {
      alert("3 个位置都满啦，先删一个再存吧 ~");
      return;
    }
    saveToSlot(empty);
    setCurrentSlotIndex(empty);
  };

  return (
    <div className="editor">
      <div className="canvas">
        <div className="canvas-frame">
          <Grid
            cells={board.cells}
            gridSize={board.gridSize}
            onStrokeStart={startStroke}
            onPaint={paint}
          />
          {busy && <div className="busy-overlay">转换中…</div>}
        </div>
        <div className="toolbar">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="上传照片"
            disabled={busy}
          >
            📷
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isEmpty(board.cells)}
            aria-label="保存"
          >
            💾
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isEmpty(board.cells)}
            aria-label="导出图片"
          >
            ⬇️
          </button>
          <button
            type="button"
            onClick={() => setCustomSizeEnabled((v) => !v)}
            aria-label={customSizeEnabled ? "关闭自定义尺寸（恢复自适应）" : "开启自定义尺寸"}
            style={customSizeEnabled ? { background: "#ffd54a" } : undefined}
          >
            📐
          </button>
          <div className="toolbar-break" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setTool(tool === "bucket" ? "paint" : "bucket")}
            disabled={isEmpty(board.cells)}
            aria-label={tool === "bucket" ? "画笔" : "颜料桶（整体换色）"}
            style={tool === "bucket" ? { background: "#ffd54a" } : undefined}
          >
            🪣
          </button>
          <button
            type="button"
            onClick={() => setSelectedCode(null)}
            aria-label="橡皮"
            style={selectedCode === null ? { background: "#ffd54a" } : undefined}
          >
            ✕
          </button>
          <button type="button" onClick={undo} disabled={past.length === 0} aria-label="撤销">
            ↶
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={futureStack.length === 0}
            aria-label="重做"
          >
            ↷
          </button>
          <button type="button" onClick={clear} aria-label="清空">
            🗑
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            style={{ display: "none" }}
          />
        </div>
        {customSizeEnabled && (
          <div className="size-slider">
            <span className="size-label">下次上传尺寸</span>
            <input
              type="range"
              min={16}
              max={64}
              step={1}
              value={customGridSize}
              onChange={(e) => {
                setHasCustomSized(true);
                setCustomGridSize(Number(e.target.value));
              }}
            />
            <input
              type="number"
              min={16}
              max={64}
              step={1}
              value={customGridSize}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                const v = Math.max(16, Math.min(64, Math.round(raw)));
                setHasCustomSized(true);
                setCustomGridSize(v);
              }}
              className="size-number"
              aria-label="精确画板尺寸"
            />
            <span className="size-suffix">×{customGridSize}</span>
          </div>
        )}
      </div>
      <Palette
        palette={getPaletteBySize(paletteSize)}
        selectedCode={selectedCode}
        onSelect={setSelectedCode}
        header={
          <div className="palette-size-toggle" role="radiogroup" aria-label="色板规模">
            <button
              type="button"
              role="radio"
              aria-checked={paletteSize === 24}
              className={paletteSize === 24 ? "active" : ""}
              onClick={() => {
                setPaletteSize(24);
                setHasCustomPalette(true);
                if (selectedCode && !PALETTE_24.some((c) => c.code === selectedCode)) {
                  setSelectedCode(PALETTE_24[0].code);
                }
              }}
            >
              24 色
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={paletteSize === 48}
              className={paletteSize === 48 ? "active" : ""}
              onClick={() => {
                setPaletteSize(48);
                setHasCustomPalette(true);
              }}
            >
              48 色
            </button>
          </div>
        }
      >
        <Slots slots={slots} onLoad={loadFromSlot} onDelete={deleteSlot} />
      </Palette>
    </div>
  );
}
