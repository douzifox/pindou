export type ColorFamily = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type BeadColor = {
  code: string;
  hex: string;
  family: ColorFamily;
  // 算法是否自动选这个色。默认 true。false = 透明豆等特殊色，UI 还能手动选
  auto?: boolean;
};

// MARD 24 色拼豆色卡，4 行 × 6 列。
// hex 是临时值（来自 Zippland custom palette 24 色精选），等官方色值到了再校准
export const PALETTE: BeadColor[] = [
  // 第 1 行：浅色
  { code: "B3", hex: "#7CEE9D", family: "B" },
  { code: "C3", hex: "#A0E2FB", family: "C" },
  { code: "D9", hex: "#D5B9F8", family: "D" },
  { code: "E2", hex: "#FDC7DE", family: "E" },
  { code: "G1", hex: "#FFE2CE", family: "G" },
  { code: "A4", hex: "#FFE952", family: "A" },
  // 第 2 行：中等
  { code: "B5", hex: "#00BD35", family: "B" },
  { code: "C5", hex: "#01ACEB", family: "C" },
  { code: "D6", hex: "#AC7BDE", family: "D" },
  { code: "E4", hex: "#E8649E", family: "E" },
  { code: "G5", hex: "#E99C62", family: "G" },
  { code: "A6", hex: "#FDAD49", family: "A" },
  // 第 3 行：深色
  { code: "B8", hex: "#039D25", family: "B" },
  { code: "C8", hex: "#0F54C0", family: "C" },
  { code: "D7", hex: "#6E399A", family: "D" },
  { code: "F5", hex: "#D63838", family: "F" },
  { code: "G7", hex: "#9D5B3E", family: "G" },
  { code: "A7", hex: "#E87425", family: "A" },
  // 第 4 行：中性
  { code: "H1", hex: "#E2E2E2", family: "H", auto: false }, // 透明豆，算法不自动选
  { code: "H2", hex: "#FFFFFF", family: "H" },
  { code: "H3", hex: "#BFBFBF", family: "H" },
  { code: "H4", hex: "#9C9C9C", family: "H" },
  { code: "H5", hex: "#474747", family: "H" },
  { code: "H7", hex: "#000000", family: "H" },
];

// 第二套 24 色（来自 Mard色卡.png 扫描），跟当前 24 拼成 48 色完整版
export const PALETTE_EXT: BeadColor[] = [
  // 第 1 行
  { code: "C2", hex: "#BBF9F6", family: "C" },
  { code: "C13", hex: "#CDE8FF", family: "C" },
  { code: "D19", hex: "#D8C3D7", family: "D" },
  { code: "E8", hex: "#FFDBE9", family: "E" },
  { code: "A13", hex: "#FFBB59", family: "A" },
  { code: "A11", hex: "#FFDD99", family: "A" },
  // 第 2 行
  { code: "C10", hex: "#3EBCE2", family: "C" },
  { code: "C6", hex: "#50AAF0", family: "C" },
  { code: "D18", hex: "#A45EC7", family: "D" },
  { code: "E3", hex: "#FF97C3", family: "E" },
  { code: "A10", hex: "#FF9D55", family: "A" },
  { code: "G9", hex: "#E6B483", family: "G" },
  // 第 3 行
  { code: "C11", hex: "#04B9B9", family: "C" },
  { code: "C7", hex: "#0088D3", family: "C" },
  { code: "D21", hex: "#9A009B", family: "D" },
  { code: "D13", hex: "#B90095", family: "D" },
  { code: "F13", hex: "#DD422F", family: "F" },
  { code: "G13", hex: "#B7714A", family: "G" },
  // 第 4 行
  { code: "B12", hex: "#166F41", family: "B" },
  { code: "D3", hex: "#2F54AF", family: "D" },
  { code: "D15", hex: "#2F1F90", family: "D" },
  { code: "E7", hex: "#C63478", family: "E" },
  { code: "F8", hex: "#BC0028", family: "F" },
  { code: "G8", hex: "#592A21", family: "G" },
];

// 24 色 = 当前 PALETTE；48 色 = 24 + 第二套 24
export const PALETTE_24 = PALETTE;
export const PALETTE_48 = [...PALETTE, ...PALETTE_EXT];

// 选择当前色板规模时返回对应数组
export function getPaletteBySize(size: 24 | 48): BeadColor[] {
  return size === 48 ? PALETTE_48 : PALETTE_24;
}

// COLOR_BY_CODE 包含 48 个全部，方便任何 code 都能查到 hex
export const COLOR_BY_CODE = new Map(PALETTE_48.map((c) => [c.code, c]));

export const DEFAULT_GRID_SIZE = 29;
// 自适应范围：默认 29，规整像素艺术可在 [26, 32] 之间浮动
export const MIN_GRID_SIZE = 26;
export const MAX_GRID_SIZE = 32;
