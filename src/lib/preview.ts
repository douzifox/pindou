import { COLOR_BY_CODE } from "../data/palette";

const TARGET_THUMB = 116; // 缩略图目标边长

export function cellsToPreview(cells: (string | null)[], gridSize: number): string {
  const pixel = Math.max(2, Math.floor(TARGET_THUMB / gridSize));
  const canvas = document.createElement("canvas");
  canvas.width = gridSize * pixel;
  canvas.height = gridSize * pixel;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#faf3e7"; // 和画布底色一致
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < cells.length; i++) {
    const code = cells[i];
    if (!code) continue;
    const hex = COLOR_BY_CODE.get(code)?.hex;
    if (!hex) continue;
    const x = (i % gridSize) * pixel;
    const y = Math.floor(i / gridSize) * pixel;
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, pixel, pixel);
  }

  return canvas.toDataURL("image/png");
}
