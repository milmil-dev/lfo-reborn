import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { BAG_SIZE, cannotWear, type Inventory, type Owned, takeOff, wear } from "@/game/inventory";
import { asset, type ItemRow, type Stats } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  背包 / 裝備 on the client's equipment box (chest/equipbox, 418 × 427), laid out as LFO.exe
  draws it: the backpack as 2 × 10 cells of 39 px from (7, 8), scrolled a row at a time; the nine
  equipment slots centred on the positions below (slot = the item's part); the hovered cell under
  chest/equiphighlight; the name bar along the bottom. Worn-out items are tinted red.
*/

/** slot centre and the box an icon is fitted into */
const SLOT: { x: number; y: number; w: number; h: number; label: string }[] = [
  { x: 160, y: 102, w: 62, h: 44, label: "飾品" },
  { x: 262, y: 104, w: 62, h: 62, label: "頭盔" },
  { x: 362, y: 102, w: 62, h: 44, label: "" },
  { x: 160, y: 200, w: 62, h: 118, label: "武器" },
  { x: 262, y: 200, w: 62, h: 96, label: "衣甲" },
  { x: 362, y: 200, w: 62, h: 118, label: "盾牌" },
  { x: 160, y: 320, w: 62, h: 44, label: "手部" },
  { x: 262, y: 320, w: 80, h: 70, label: "鞋子" },
  { x: 362, y: 320, w: 62, h: 44, label: "戒指" },
];
const CELL = 39;
const ROWS = 10;
const STAT: [keyof Stats, string][] = [
  ["hp", "HP"],
  ["mp", "MP"],
  ["sp", "SP"],
  ["str", "力"],
  ["def", "防"],
  ["agi", "敏"],
];

export function Icon({
  item,
  broken,
  w,
  h,
}: {
  item?: ItemRow;
  broken?: boolean;
  w: number;
  h: number;
}) {
  if (!item?.icon) return null;
  return (
    <img
      src={asset(item.icon)}
      alt={item.name}
      className={cn(
        "pointer-events-none max-w-none object-contain",
        broken && "sepia saturate-[4] hue-rotate-[-40deg]",
      )}
      style={{ maxWidth: w, maxHeight: h }}
      draggable={false}
    />
  );
}

export function EquipBox({
  inv,
  items,
  lv,
  charId,
  stats,
  onChange,
  onClose,
}: {
  inv: Inventory;
  items: Map<number, ItemRow>;
  lv: number;
  charId: number;
  /** the wearer's stats, checked against each item's requirements */
  stats?: Parameters<typeof cannotWear>[3];
  onChange: (inv: Inventory) => void;
  onClose?: () => void;
}) {
  const { t } = useLingui();
  const [top, setTop] = useState(0); // first visible backpack row
  const [hover, setHover] = useState<{ copy: Owned; note?: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const maxTop = Math.max(0, Math.ceil(BAG_SIZE / 2) - ROWS);

  const shown = hover ? items.get(hover.copy.id) : undefined;
  const mods = shown ? STAT.filter(([k]) => shown.mods[k]) : [];

  const tryWear = (copy: Owned) => {
    const item = items.get(copy.id);
    if (!item) return;
    const why =
      copy.dur === 0 ? t`你不能裝備耐久度 0 的物品。` : cannotWear(item, lv, charId, stats);
    if (why) return setNote(why);
    setNote(null);
    onChange(wear(inv, copy.uid, items));
  };

  return (
    <div className="relative h-[427px] w-[418px] select-none" onPointerLeave={() => setHover(null)}>
      <Ui name="chest/equipbox" w={418} h={427} className="absolute inset-0" />

      {/* the backpack */}
      <div
        className="absolute top-[8px] left-[7px] h-[390px] w-[78px] overflow-hidden"
        onWheel={(e) => setTop((r) => Math.max(0, Math.min(maxTop, r + Math.sign(e.deltaY))))}
      >
        {Array.from({ length: ROWS * 2 }, (_, i) => {
          const index = top * 2 + i;
          const copy = inv.bag[index];
          const item = copy && items.get(copy.id);
          return (
            <button
              key={index}
              type="button"
              className="absolute grid place-items-center"
              style={{
                left: (i % 2) * CELL,
                top: Math.floor(i / 2) * CELL,
                width: CELL,
                height: CELL,
              }}
              onPointerEnter={() => copy && setHover({ copy })}
              onClick={() => copy && tryWear(copy)}
              aria-label={item?.name ?? t`空`}
            >
              {copy && hover?.copy.uid === copy.uid && (
                <Ui name="chest/equiphighlight" w={38} h={38} className="absolute inset-0" />
              )}
              <Icon item={item} broken={copy?.dur === 0} w={33} h={33} />
            </button>
          );
        })}
      </div>
      {inv.bag.length > ROWS * 2 && (
        <p className="absolute top-[400px] left-[10px] font-lfo text-[9px] text-white/70">
          {top + 1}/{maxTop + 1}
        </p>
      )}

      {/* the equipment slots */}
      {SLOT.map((s, slot) => {
        const copy = inv.equip[slot];
        const item = copy ? items.get(copy.id) : undefined;
        return (
          <button
            key={slot}
            type="button"
            className="absolute grid place-items-center"
            style={{ left: s.x - s.w / 2, top: s.y - s.h / 2, width: s.w, height: s.h }}
            onPointerEnter={() => copy && setHover({ copy })}
            onClick={() => {
              setNote(null);
              if (copy) onChange(takeOff(inv, slot));
            }}
            aria-label={item?.name ?? s.label}
          >
            <Icon item={item} broken={copy?.dur === 0} w={s.w} h={s.h} />
          </button>
        );
      })}

      {/* the name bar */}
      <div className="absolute top-[380px] left-[116px] flex h-[30px] w-[286px] items-center gap-2 overflow-hidden px-2 text-white">
        {shown ? (
          <>
            <span className="truncate font-bold text-[13px] [text-shadow:0_1px_1px_#000]">
              {shown.name}
            </span>
            <span className="flex shrink-0 gap-1.5 font-lfo text-[9px] text-[#ffe08a]">
              {mods.map(([k, label]) => (
                <span key={k}>
                  {label}
                  {shown.mods[k] > 0 ? "+" : ""}
                  {shown.mods[k]}
                </span>
              ))}
            </span>
            {shown.req_lv > 0 && (
              <span
                className={cn(
                  "ml-auto shrink-0 text-[10px]",
                  shown.req_lv > lv ? "text-[#ffb0b0]" : "text-white/70",
                )}
              >
                LV {shown.req_lv}
              </span>
            )}
          </>
        ) : (
          <span className={cn("text-[12px]", note ? "text-[#ffb0b0]" : "text-white/60")}>
            {note ?? t`點擊背包物品裝備，點擊裝備卸下`}
          </span>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="group absolute top-[6px] left-[378px] h-[13px] w-[33px]"
          aria-label={t`關閉`}
        >
          <Ui
            name="chest/equipclosebut0"
            w={33}
            h={13}
            className="absolute inset-0 group-hover:hidden"
          />
          <Ui
            name="chest/equipclosebut1"
            w={33}
            h={13}
            className="absolute inset-0 hidden group-hover:block"
          />
        </button>
      )}
    </div>
  );
}
