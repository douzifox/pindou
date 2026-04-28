import type { ReactNode } from "react";
import type { BeadColor } from "../data/palette";

type Props = {
  palette: BeadColor[];
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
  header?: ReactNode; // 调色板顶部（如 24/48 切换器）
  children?: ReactNode; // 调色板底部（如存档槽位）
};

export function Palette({
  palette,
  selectedCode,
  onSelect,
  header,
  children,
}: Props) {
  return (
    <div className="palette" data-size={palette.length > 24 ? 48 : 24}>
      {header}
      {palette.map((color) => {
        const selected = color.code === selectedCode;
        const isLight = color.family === "H" && ["H1", "H2", "H3"].includes(color.code);
        return (
          <button
            key={color.code}
            type="button"
            className={`swatch${selected ? " selected" : ""}`}
            style={{ background: color.hex, color: isLight ? "#333" : "#fff" }}
            onClick={() => onSelect(color.code)}
            aria-label={color.code}
            aria-pressed={selected}
          >
            {color.code}
          </button>
        );
      })}
      {children}
    </div>
  );
}
