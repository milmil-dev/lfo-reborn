import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { BAG_SIZE, type Owned } from "@/game/inventory";
import type { ItemRow } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Icon } from "./equip-box";
import { Ui } from "./ui";

/*
  The backpack on the client's red chest (chest/chestbox, 218 × 427): 5 × 10 cells of 39 px from
  (6.5, 30.5), scrolled a row at a time, the close tab in its top-right corner. The bank, the
  iron smith and the compose table open it beside their own box; a click hands the copy over.
*/

export const COLS = 5;
export const ROWS = 10;
const GX = 6.5;
const GY = 30.5;
export const CELL = 39;

/** An item grid cell with the hover ring every box shares. */
export function ItemCell({
  copy,
  item,
  left,
  top,
  size,
  faded,
  onHover,
  onPick,
}: {
  copy: Owned | undefined;
  item: ItemRow | undefined;
  left: number;
  top: number;
  size: number;
  faded?: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      disabled={!copy}
      className={cn("group absolute grid place-items-center", faded && "opacity-35")}
      style={{ left, top, width: size, height: size }}
      onPointerEnter={() => copy && onHover()}
      onClick={onPick}
      aria-label={item?.name ?? t`空`}
    >
      {copy && (
        <span className="absolute inset-[2px] rounded-[2px] transition group-hover:bg-white/20 group-hover:ring-2 group-hover:ring-white/80" />
      )}
      <Icon item={item} broken={copy?.dur === 0} w={size - 6} h={size - 6} />
    </button>
  );
}

/** The hovered item's name and durability, over its cell. */
export function ItemTip({
  copy,
  item,
  x,
  y,
}: {
  copy: Owned;
  item: ItemRow;
  /** the cell's top centre */
  x: number;
  y: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[4px] bg-black/85 px-2 py-[2px] text-[11px] text-white ring-1 ring-white/30"
      style={{ left: x, top: y - 2 }}
    >
      <span className="font-bold">{item.name}</span>
      {item.durability > 0 && (
        <span
          className={cn(
            "ml-1.5 font-lfo text-[9px]",
            copy.dur === 0 ? "text-[#ff9b9b]" : "text-white/70",
          )}
        >
          {copy.dur}/{item.durability}
        </span>
      )}
    </div>
  );
}

export function ChestBag({
  bag,
  items,
  x,
  y,
  onPick,
  onClose,
  faded,
  children,
}: {
  bag: Owned[];
  items: Map<number, ItemRow>;
  x: number;
  y: number;
  onPick: (copy: Owned) => void;
  onClose: () => void;
  /** copies shown dimmed (already placed in the other box) */
  faded?: (copy: Owned) => boolean;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const [top, setTop] = useState(0);
  const [hover, setHover] = useState<{ copy: Owned; k: number } | null>(null);
  const maxTop = Math.max(0, Math.ceil(BAG_SIZE / COLS) - ROWS);
  const shown = hover && items.get(hover.copy.id);

  return (
    <div
      className="absolute h-[427px] w-[218px]"
      style={{ left: x, top: y }}
      onPointerLeave={() => setHover(null)}
      onWheel={(e) => setTop((r) => Math.max(0, Math.min(maxTop, r + Math.sign(e.deltaY))))}
    >
      <Ui name="chest/chestbox" w={218} h={427} className="absolute inset-0" />
      <p className="absolute top-[8px] left-[20px] font-bold text-[12px] text-white [text-shadow:0_1px_1px_#000]">
        {t`背包`}
        <span className="ml-2 font-lfo text-[9px] text-white/70">
          {bag.length}/{BAG_SIZE}
        </span>
      </p>
      {Array.from({ length: COLS * ROWS }, (_, k) => {
        const copy = bag[top * COLS + k];
        return (
          <ItemCell
            key={k}
            copy={copy}
            item={copy && items.get(copy.id)}
            left={GX + (k % COLS) * CELL}
            top={GY + Math.floor(k / COLS) * CELL}
            size={CELL}
            faded={!!copy && faded?.(copy)}
            onHover={() => copy && setHover({ copy, k })}
            onPick={() => {
              setHover(null);
              if (copy) onPick(copy);
            }}
          />
        );
      })}
      {bag.length > COLS * ROWS && (
        <p className="absolute top-[424px] left-[10px] font-lfo text-[9px] text-white/70">
          {top + 1}/{maxTop + 1}
        </p>
      )}
      {hover && shown && (
        <ItemTip
          copy={hover.copy}
          item={shown}
          x={GX + ((hover.k % COLS) + 0.5) * CELL}
          y={GY + Math.floor(hover.k / COLS) * CELL}
        />
      )}
      <button
        type="button"
        onClick={onClose}
        className="group absolute top-[7px] left-[171px] h-[16px] w-[31px]"
        aria-label={t`關閉`}
      >
        <Ui
          name="chest/chestclosebut1"
          w={31}
          h={16}
          className="absolute inset-0 hidden group-hover:block"
        />
      </button>
      {children}
    </div>
  );
}
