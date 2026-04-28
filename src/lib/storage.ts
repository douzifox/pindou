import { DEFAULT_GRID_SIZE } from "../data/palette";

export type Slot = {
  cells: (string | null)[];
  gridSize: number;
  preview: string; // dataURL
  savedAt: number;
};

export const SLOT_COUNT = 3;

const KEY = "pindou:slots:v1";

export function loadSlots(): (Slot | null)[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Array(SLOT_COUNT).fill(null);
    const parsed = JSON.parse(raw) as (Slot | null)[];
    const out: (Slot | null)[] = new Array(SLOT_COUNT).fill(null);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = parsed[i];
      if (!s) {
        out[i] = null;
        continue;
      }
      out[i] = { ...s, gridSize: s.gridSize ?? DEFAULT_GRID_SIZE };
    }
    return out;
  } catch {
    return new Array(SLOT_COUNT).fill(null);
  }
}

export function saveSlots(slots: (Slot | null)[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(slots));
  } catch (err) {
    console.error("保存失败", err);
  }
}
