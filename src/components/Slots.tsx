import type { Slot } from "../lib/storage";

type Props = {
  slots: (Slot | null)[];
  onLoad: (index: number) => void;
  onDelete: (index: number) => void;
};

export function Slots({ slots, onLoad, onDelete }: Props) {
  return (
    <div className="slots-row">
      {slots.map((slot, i) => {
        if (!slot) {
          return (
            <div
              key={i}
              className="slot empty"
              aria-label={`位置 ${i + 1} 空`}
            />
          );
        }
        return (
          <div key={i} className="slot filled">
            <button
              type="button"
              className="slot-load"
              onClick={() => onLoad(i)}
              aria-label={`打开位置 ${i + 1}`}
            >
              <img src={slot.preview} alt="" />
            </button>
            <button
              type="button"
              className="slot-delete"
              onClick={() => onDelete(i)}
              aria-label={`删除位置 ${i + 1}`}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
