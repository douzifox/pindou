import { converter, differenceCiede2000, parse } from "culori";
import {
  DEFAULT_GRID_SIZE,
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  PALETTE_24,
  PALETTE_48,
  type BeadColor,
} from "../data/palette";

// culori 的 Lab 转换（D50 + Bradford）+ deltaE2000（人眼感知距离），用于最终 palette 选色
const toLabCulori = converter("lab");
const deltaE2000 = differenceCiede2000();

// 饱和度偏好：只对"边界区间"input chroma 25-30 启用，让卡在饱和/不饱和边界的色
// （如腮红 chroma≈27）被推往饱和 palette。其他区间不动
const CHROMA_LO = 25;
const CHROMA_HI = 35;
const CHROMA_PREFERENCE = 0.3;

// 给一个 palette 生成 nearestCode 闭包（含 Lab 转换 + RGB→code 缓存）。
// 切 24/48 时调用方传不同 palette 进来，闭包里的缓存是独立的
type NearestCodeFn = (r: number, g: number, b: number) => string;
function makeNearestCode(palette: BeadColor[]): NearestCodeFn {
  // 仅算法可自动选的色（auto !== false）。透明豆 H1 不参与算法，UI 仍可手动选
  const paletteLab = palette
    .filter((c) => c.auto !== false)
    .map((c) => {
      const lab = toLabCulori(parse(c.hex)!);
      if (!lab) throw new Error(`bad palette: ${c.code}`);
      return { code: c.code, lab };
    });
  const cache = new Map<number, string>();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const lab = toLabCulori({ mode: "rgb", r: r / 255, g: g / 255, b: b / 255 });
    let best = paletteLab[0].code;
    if (lab) {
      const inputChroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
      const useChromaPref = inputChroma > CHROMA_LO && inputChroma < CHROMA_HI;
      let bestD = Infinity;
      for (const p of paletteLab) {
        const d = deltaE2000(lab, p.lab);
        let total = d;
        if (useChromaPref) {
          const palChroma = Math.sqrt(p.lab.a * p.lab.a + p.lab.b * p.lab.b);
          total += Math.max(0, inputChroma - palChroma) * CHROMA_PREFERENCE;
        }
        if (total < bestD) {
          bestD = total;
          best = p.code;
        }
      }
    }
    cache.set(key, best);
    return best;
  };
}

// ============================================================================
// 颜色：sRGB → CIE Lab (D65)，inline 实现，比 culori 在大循环里快约 10 倍
// ============================================================================

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB → linear
  let rl = r / 255;
  let gl = g / 255;
  let bl = b / 255;
  rl = rl > 0.04045 ? Math.pow((rl + 0.055) / 1.055, 2.4) : rl / 12.92;
  gl = gl > 0.04045 ? Math.pow((gl + 0.055) / 1.055, 2.4) : gl / 12.92;
  bl = bl > 0.04045 ? Math.pow((bl + 0.055) / 1.055, 2.4) : bl / 12.92;
  // sRGB linear → XYZ (Bradford-adapted to D50, 跟 culori 默认一致；
  // 比直接 D65 在 Lab 邻接颜色判断上更准，避免暖色被推往邻近的暗调色板 code)
  const X = rl * 0.4360747 + gl * 0.3850649 + bl * 0.1430804;
  const Y = rl * 0.2225045 + gl * 0.7168786 + bl * 0.0606169;
  const Z = rl * 0.0139322 + gl * 0.0971045 + bl * 0.7141733;
  // XYZ → Lab (D50 reference white)
  const Xn = 0.96422;
  const Yn = 1.0;
  const Zn = 0.82521;
  const fx = labF(X / Xn);
  const fy = labF(Y / Yn);
  const fz = labF(Z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function parseHex(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

// 用 PALETTE_48 让 mergeIsolatedBlocks 能查到任何 code 的 Lab（24 或 48 模式都可用）
const PALETTE_LAB = PALETTE_48.map((c) => {
  const [r, g, b] = parseHex(c.hex);
  const [L, a, bv] = rgbToLab(r, g, b);
  return { code: c.code, L, a, b: bv };
});

// ============================================================================
// 主流程
// ============================================================================

const MAX_WORK_SIZE = 1024;

export type BeadResult = {
  cells: (string | null)[];
  gridSize: number;
};

export async function imageToBeads(
  file: File,
  forcedGridSize?: number,
  paletteSize: 24 | 48 = 24,
): Promise<BeadResult> {
  const bitmap = await createImageBitmap(file);
  const imgW = bitmap.width;
  const imgH = bitmap.height;

  const longSide = Math.max(imgW, imgH);
  const scale = longSide > MAX_WORK_SIZE ? MAX_WORK_SIZE / longSide : 1;
  const workW = Math.max(1, Math.round(imgW * scale));
  const workH = Math.max(1, Math.round(imgH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");

  ctx.imageSmoothingEnabled = scale < 1;
  if (scale < 1) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, workW, workH);
  bitmap.close();

  const data = ctx.getImageData(0, 0, workW, workH).data;
  // 用当前选定的色板生成 nearestCode 闭包（含独立缓存）；切 24/48 时缓存自动隔离
  const palette = paletteSize === 48 ? PALETTE_48 : PALETTE_24;
  const nearestCode = makeNearestCode(palette);

  // 选 grid：用户指定（forcedGridSize）→ 直接用；否则自适应
  // 自适应：先尝试反推规整像素艺术（GCD），失败再用对齐分挑
  let gridSize: number;
  if (forcedGridSize !== undefined && forcedGridSize > 0) {
    gridSize = Math.max(8, Math.min(96, Math.round(forcedGridSize)));
  } else {
    const detected = runsBasedDetect(data, workW, workH);
    if (detected > 1) {
      const candidate = Math.round(Math.max(workW, workH) / detected);
      gridSize = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, candidate));
    } else {
      gridSize = pickGridSize(data, workW, workH);
    }
  }

  const cells = slicRender(data, workW, workH, gridSize, nearestCode);
  // 调试：统计输出 cells 里每个 code 的数量
  const counts = new Map<string, number>();
  for (const c of cells) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log("[Pindou] 输出 cells 颜色分布:", Object.fromEntries(summary));
  if (counts.has("H1")) {
    console.warn(
      "[Pindou] ⚠️ H1 出现在输出里！数量 =",
      counts.get("H1"),
      "—— 这不应该发生（H1 已标 auto:false）",
    );
  }
  return { cells, gridSize };
}

// ============================================================================
// SLIC: Simple Linear Iterative Clustering（Gerstner 2012 简化版）
// 思路：把原图划成 Nx*Ny 个 superpixel，每个 superpixel 是一个聚类，
// 在 5D 空间（Lab + xy）反复"分配像素 → 更新中心"直到收敛。
// 比 voting 强的地方：cell 中心可以稍微偏移去抓住小特征（眼睛、嘴），
// 而不是被 cell 内多数像素的"背景色"淹没。mass-constraint 防止漂太远。
// ============================================================================

function slicRender(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  gridSize: number,
  nearestCode: NearestCodeFn,
): (string | null)[] {
  // 1. letterbox 几何
  const cellPx = Math.max(w, h) / gridSize;
  const contentW = w / cellPx;
  const contentH = h / cellPx;
  const Nx = Math.round(contentW);
  const Ny = Math.round(contentH);
  const offsetX = (gridSize - contentW) / 2;
  const offsetY = (gridSize - contentH) / 2;
  // 把内容的 (nx, ny) 放到 grid 的哪个位置：取浮点 offset 的 floor，让边贴齐
  const gridOffsetX = Math.round(offsetX);
  const gridOffsetY = Math.round(offsetY);

  const stepX = w / Nx;
  const stepY = h / Ny;
  const S = Math.sqrt(stepX * stepY);

  // 2. 一次性预计算所有像素的 Lab + 不透明 mask
  const N = w * h;
  const labL = new Float32Array(N);
  const labA = new Float32Array(N);
  const labB = new Float32Array(N);
  const opaque = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (data[i + 3] >= 220) {
      opaque[p] = 1;
      const [L, a, b] = rgbToLab(data[i], data[i + 1], data[i + 2]);
      labL[p] = L;
      labA[p] = a;
      labB[p] = b;
    }
  }

  // 3. 初始化 superpixel 中心：每个 cell 中心点的颜色 + 位置
  const NC = Nx * Ny;
  const cX = new Float32Array(NC);
  const cY = new Float32Array(NC);
  const cL = new Float32Array(NC);
  const cA = new Float32Array(NC);
  const cB = new Float32Array(NC);
  for (let ny = 0; ny < Ny; ny++) {
    for (let nx = 0; nx < Nx; nx++) {
      const ci = ny * Nx + nx;
      const px = Math.max(0, Math.min(w - 1, Math.round((nx + 0.5) * stepX)));
      const py = Math.max(0, Math.min(h - 1, Math.round((ny + 0.5) * stepY)));
      const p = py * w + px;
      cX[ci] = px;
      cY[ci] = py;
      cL[ci] = labL[p];
      cA[ci] = labA[p];
      cB[ci] = labB[p];
    }
  }

  // 4. 迭代 SLIC
  const labels = new Int32Array(N).fill(-1);
  const ITER: number = 3;
  // SLIC 的 m 参数（compactness），值越大 → cell 越方正、不跟随颜色边缘
  const M = 20;
  const mOverS = M / S;

  // 累加 buffers，迭代外面分配避免每次重新建
  const sumX = new Float64Array(NC);
  const sumY = new Float64Array(NC);
  const sumL = new Float64Array(NC);
  const sumA = new Float64Array(NC);
  const sumB = new Float64Array(NC);
  const mass = new Int32Array(NC);

  // ITER=0 → 跳过 SLIC，每像素直接归到 floor(x/stepX, y/stepY) 的初始 grid cell
  // 用于和 SLIC 对比：看 SLIC 的"形状自适应"到底带来多大改进
  if (ITER === 0) {
    for (let y = 0; y < h; y++) {
      const ny = Math.min(Ny - 1, Math.floor(y / stepY));
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!opaque[p]) {
          labels[p] = -1;
          continue;
        }
        const nx = Math.min(Nx - 1, Math.floor(x / stepX));
        const ci = ny * Nx + nx;
        labels[p] = ci;
        mass[ci]++;
      }
    }
  }

  for (let iter = 0; iter < ITER; iter++) {
    // 4a. 像素分配 → 找最近 superpixel（仅检查初始网格 ±1 邻居共 9 个）
    for (let y = 0; y < h; y++) {
      const ny0 = Math.min(Ny - 1, Math.floor(y / stepY));
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!opaque[p]) {
          labels[p] = -1;
          continue;
        }
        const nx0 = Math.min(Nx - 1, Math.floor(x / stepX));
        const L = labL[p];
        const a = labA[p];
        const b = labB[p];
        let bestI = ny0 * Nx + nx0;
        let bestD = Infinity;
        const ny0_lo = Math.max(0, ny0 - 1);
        const ny0_hi = Math.min(Ny - 1, ny0 + 1);
        const nx0_lo = Math.max(0, nx0 - 1);
        const nx0_hi = Math.min(Nx - 1, nx0 + 1);
        for (let cny = ny0_lo; cny <= ny0_hi; cny++) {
          for (let cnx = nx0_lo; cnx <= nx0_hi; cnx++) {
            const ci = cny * Nx + cnx;
            const dL = L - cL[ci];
            const da = a - cA[ci];
            const db = b - cB[ci];
            const dxs = x - cX[ci];
            const dys = y - cY[ci];
            const dColor = Math.sqrt(dL * dL + da * da + db * db);
            const dSpace = Math.sqrt(dxs * dxs + dys * dys);
            const d = dColor + dSpace * mOverS;
            if (d < bestD) {
              bestD = d;
              bestI = ci;
            }
          }
        }
        labels[p] = bestI;
      }
    }

    // 4b. 重新计算 superpixel 中心 = 该 superpixel 像素的均值
    sumX.fill(0);
    sumY.fill(0);
    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    mass.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const ci = labels[p];
        if (ci < 0) continue;
        sumX[ci] += x;
        sumY[ci] += y;
        sumL[ci] += labL[p];
        sumA[ci] += labA[p];
        sumB[ci] += labB[p];
        mass[ci]++;
      }
    }
    for (let ci = 0; ci < NC; ci++) {
      if (mass[ci] === 0) continue;
      const m = mass[ci];
      const ny = (ci / Nx) | 0;
      const nx = ci - ny * Nx;
      // mass constraint：让中心不要漂出原 grid cell（限制在 ±0.35 cell，比 0.5 更严，避免出格）
      const origX = (nx + 0.5) * stepX;
      const origY = (ny + 0.5) * stepY;
      const rX = stepX * 0.35;
      const rY = stepY * 0.35;
      const newX = sumX[ci] / m;
      const newY = sumY[ci] / m;
      cX[ci] = Math.max(origX - rX, Math.min(origX + rX, newX));
      cY[ci] = Math.max(origY - rY, Math.min(origY + rY, newY));
      cL[ci] = sumL[ci] / m;
      cA[ci] = sumA[ci] / m;
      cB[ci] = sumB[ci] / m;
    }
  }

  // 5. RGB Mode：每个 superpixel 在原始 RGB 上分桶（4 buckets/通道 = 64 桶），
  //    找最频繁桶（dominant 色），取桶内 mean RGB 作代表色，再映射到 24 色调色板。
  //    比 voting（先 quantize 后投票）准——后者会让一片邻近 RGB 都坍缩到同一 palette code，
  //    让"覆盖面广的 palette code"虚假胜出，常常选到偏暗的中间色
  const cells: (string | null)[] = new Array(gridSize * gridSize).fill(null);
  const BUCKETS = 64; // 4³，每通道高 2 bit 当桶 id
  const bucketHist = new Int32Array(NC * BUCKETS);
  const bucketR = new Int32Array(NC * BUCKETS);
  const bucketG = new Int32Array(NC * BUCKETS);
  const bucketB = new Int32Array(NC * BUCKETS);
  for (let p = 0; p < N; p++) {
    if (!opaque[p]) continue;
    const ci = labels[p];
    if (ci < 0) continue;
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const bk = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
    const idx = ci * BUCKETS + bk;
    bucketHist[idx]++;
    bucketR[idx] += r;
    bucketG[idx] += g;
    bucketB[idx] += b;
  }
  // 判断一个桶的代表色是不是"抗锯齿过渡的中性灰"——
  // 抗锯齿在物体边缘把橙色 + 米色平均成 RGB(220, 200, 180) 这种偏灰的色，
  // 它不应该是整个 cell 的代表色，应该让位给真彩色桶
  const isAntialiasGray = (r: number, g: number, b: number): boolean => {
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC; // 饱和度近似（0 = 完全灰，越大越鲜艳）
    const lum = (maxC + minC) / 2;
    return sat < 25 && lum > 60 && lum < 215; // 纯白 / 纯黑保留
  };

  for (let ny = 0; ny < Ny; ny++) {
    for (let nx = 0; nx < Nx; nx++) {
      const ci = ny * Nx + nx;
      if (mass[ci] === 0) continue;
      const base = ci * BUCKETS;

      // pass 1: 只看"非中性灰"桶（避开抗锯齿过渡色）
      let bestBk = -1;
      let bestN = 0;
      for (let bk = 0; bk < BUCKETS; bk++) {
        const n = bucketHist[base + bk];
        if (n === 0) continue;
        const r = bucketR[base + bk] / n;
        const g = bucketG[base + bk] / n;
        const b = bucketB[base + bk] / n;
        if (isAntialiasGray(r, g, b)) continue;
        if (n > bestN) {
          bestN = n;
          bestBk = bk;
        }
      }

      // pass 2 fallback: superpixel 全是灰，再算上灰桶
      if (bestBk < 0) {
        for (let bk = 0; bk < BUCKETS; bk++) {
          const n = bucketHist[base + bk];
          if (n > bestN) {
            bestN = n;
            bestBk = bk;
          }
        }
      }
      if (bestBk < 0 || bestN <= 0) continue;

      const bIdx = base + bestBk;
      const cnt = bucketHist[bIdx];
      const meanR = bucketR[bIdx] / cnt;
      const meanG = bucketG[bIdx] / cnt;
      const meanB = bucketB[bIdx] / cnt;
      const code = nearestCode(meanR, meanG, meanB);
      const gx = nx + gridOffsetX;
      const gy = ny + gridOffsetY;
      if (gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize) {
        cells[gy * gridSize + gx] = code;
      }
    }
  }

  // 6. 后处理：合并 < 2 cells 的孤立色块到最大相邻色块（去噪点）
  mergeIsolatedBlocks(cells, gridSize, 2);

  return cells;
}

// 把面积 < minSize 的连通块合并到相邻最大的同色块。letterbox（null）保持不变。
// 只合并"和邻居色差小"的小块（真噪点），保留色差大的（眼睛、装饰这种有意小元素）。
const MERGE_LAB_THRESHOLD = 25; // Lab 距离 < 这个值 = 视觉接近，可合并
function mergeIsolatedBlocks(
  cells: (string | null)[],
  gridSize: number,
  minSize: number,
): void {
  const visited = new Uint8Array(gridSize * gridSize);
  const blocks: number[][] = [];
  const blockOf = new Int32Array(gridSize * gridSize).fill(-1);

  // 调色板 code → Lab 查表
  const codeLab = new Map<string, { L: number; a: number; b: number }>();
  for (const p of PALETTE_LAB) codeLab.set(p.code, { L: p.L, a: p.a, b: p.b });

  // 4-连通 flood fill
  for (let i = 0; i < cells.length; i++) {
    if (visited[i] || cells[i] === null) continue;
    const color = cells[i];
    const stack = [i];
    const cellsInBlock: number[] = [];
    while (stack.length > 0) {
      const idx = stack.pop()!;
      if (visited[idx] || cells[idx] !== color) continue;
      visited[idx] = 1;
      blockOf[idx] = blocks.length;
      cellsInBlock.push(idx);
      const cy = (idx / gridSize) | 0;
      const cx = idx - cy * gridSize;
      if (cx > 0) stack.push(idx - 1);
      if (cx < gridSize - 1) stack.push(idx + 1);
      if (cy > 0) stack.push(idx - gridSize);
      if (cy < gridSize - 1) stack.push(idx + gridSize);
    }
    blocks.push(cellsInBlock);
  }

  for (const block of blocks) {
    if (block.length >= minSize) continue;
    const myColor = cells[block[0]];
    if (!myColor) continue;
    const myLab = codeLab.get(myColor);
    if (!myLab) continue;

    const neighborSize = new Map<string, number>();
    for (const idx of block) {
      const cy = (idx / gridSize) | 0;
      const cx = idx - cy * gridSize;
      const neighbors = [
        cy > 0 ? idx - gridSize : -1,
        cy < gridSize - 1 ? idx + gridSize : -1,
        cx > 0 ? idx - 1 : -1,
        cx < gridSize - 1 ? idx + 1 : -1,
      ];
      for (const n of neighbors) {
        if (n < 0) continue;
        const nc = cells[n];
        if (nc === null || nc === myColor) continue;
        const nb = blocks[blockOf[n]];
        const prev = neighborSize.get(nc) ?? 0;
        if (nb.length > prev) neighborSize.set(nc, nb.length);
      }
    }
    if (neighborSize.size === 0) continue;

    let bestColor: string | null = null;
    let bestSize = 0;
    for (const [c, sz] of neighborSize) {
      if (sz > bestSize) {
        bestSize = sz;
        bestColor = c;
      }
    }
    if (!bestColor) continue;

    // 关键：算这个小块和最大邻居色的 Lab 距离。距离大 = 是有意的小元素（眼睛、装饰），不合并
    const targetLab = codeLab.get(bestColor);
    if (!targetLab) continue;
    const dL = myLab.L - targetLab.L;
    const da = myLab.a - targetLab.a;
    const db = myLab.b - targetLab.b;
    const dist = Math.sqrt(dL * dL + da * da + db * db);
    if (dist > MERGE_LAB_THRESHOLD) continue; // 高对比小块，保留

    for (const idx of block) cells[idx] = bestColor;
  }
}

// ============================================================================
// gridSize 选择：GCD detect（unfake.js 思路） + alignment picker fallback
// ============================================================================

function runsBasedDetect(data: Uint8ClampedArray, w: number, h: number): number {
  const runs: number[] = [];
  const samePixel = (i1: number, i2: number) =>
    data[i1] === data[i2] &&
    data[i1 + 1] === data[i2 + 1] &&
    data[i1 + 2] === data[i2 + 2] &&
    data[i1 + 3] === data[i2 + 3];

  for (let y = 0; y < h; y++) {
    let len = 1;
    for (let x = 1; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (samePixel(idx, idx - 4)) len++;
      else {
        if (len > 1) runs.push(len);
        len = 1;
      }
    }
    if (len > 1) runs.push(len);
  }

  for (let x = 0; x < w; x++) {
    let len = 1;
    for (let y = 1; y < h; y++) {
      const idx = (y * w + x) * 4;
      if (samePixel(idx, idx - w * 4)) len++;
      else {
        if (len > 1) runs.push(len);
        len = 1;
      }
    }
    if (len > 1) runs.push(len);
  }

  if (runs.length < 10) return 1;
  let g = runs[0];
  for (let i = 1; i < runs.length; i++) {
    g = gcd(g, runs[i]);
    if (g === 1) return 1;
  }
  return g;
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function pickGridSize(data: Uint8ClampedArray, w: number, h: number): number {
  let bestGrid = DEFAULT_GRID_SIZE;
  let bestScore = -1;
  for (let g = MIN_GRID_SIZE; g <= MAX_GRID_SIZE; g++) {
    const s = gridAlignmentScore(data, w, h, g);
    if (s > bestScore) {
      bestScore = s;
      bestGrid = g;
    }
  }
  return bestGrid;
}

function gridAlignmentScore(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  gridSize: number,
): number {
  const cellPx = Math.max(w, h) / gridSize;
  const contentW = w / cellPx;
  const contentH = h / cellPx;
  const offsetX = (gridSize - contentW) / 2;
  const offsetY = (gridSize - contentH) / 2;
  let sum = 0;
  let n = 0;

  for (let cx = 1; cx < gridSize; cx++) {
    const xf = (cx - offsetX) * cellPx;
    if (xf < 1 || xf > w - 1) continue;
    const x = Math.round(xf);
    for (let y = 0; y < h; y += 2) {
      const i1 = (y * w + x - 1) * 4;
      const i2 = (y * w + x) * 4;
      if (data[i1 + 3] < 128 || data[i2 + 3] < 128) continue;
      sum +=
        Math.abs(data[i1] - data[i2]) +
        Math.abs(data[i1 + 1] - data[i2 + 1]) +
        Math.abs(data[i1 + 2] - data[i2 + 2]);
      n++;
    }
  }

  for (let cy = 1; cy < gridSize; cy++) {
    const yf = (cy - offsetY) * cellPx;
    if (yf < 1 || yf > h - 1) continue;
    const y = Math.round(yf);
    const above = (y - 1) * w * 4;
    const row = y * w * 4;
    for (let x = 0; x < w; x += 2) {
      const i1 = above + x * 4;
      const i2 = row + x * 4;
      if (data[i1 + 3] < 128 || data[i2 + 3] < 128) continue;
      sum +=
        Math.abs(data[i1] - data[i2]) +
        Math.abs(data[i1 + 1] - data[i2 + 1]) +
        Math.abs(data[i1 + 2] - data[i2 + 2]);
      n++;
    }
  }

  return n === 0 ? 0 : sum / n;
}
