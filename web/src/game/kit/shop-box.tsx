import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { Owned } from "@/game/inventory";
import { type Shelf, sellPrice } from "@/game/shop";
import { asset, type ItemRow, type Stats } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  商店 on the client's shop box (shop/itembox, 384 × 280): a 5 × 3 grid of ~69 px cells from
  (8, 12) with its scrollbar on the right, a text strip along the bottom and the 離開 button
  printed in the art. 買 lists the shelf, 賣 the backpack at the shop's buying price; a click
  buys or sells one.
*/

const COLS = 5;
const ROWS = 3;
const CW = 69.4;
const CH = 69.3;
const STAT: [keyof Stats, string][] = [
  ["hp", "HP"],
  ["mp", "MP"],
  ["sp", "SP"],
  ["str", "力"],
  ["def", "防"],
  ["agi", "敏"],
];

type Row = { id: number; price: number; count: number; key: number };

export function ShopBox({
  title,
  shelf,
  items,
  money,
  bag,
  onBuy,
  onSell,
  onClose,
}: {
  title: string;
  shelf: Shelf;
  items: Map<number, ItemRow>;
  money: number;
  /** the backpack, for the 賣 tab */
  bag: Owned[];
  /** buy one of shelf row i; returns why it failed, or null */
  onBuy: (i: number) => string | null;
  /** sell one backpack item (by its uid); returns why it failed, or null */
  onSell: (uid: number) => string | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [top, setTop] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const list: Row[] =
    mode === "buy"
      ? shelf.map((r) => ({ id: r.id, price: r.price, count: r.left, key: r.id }))
      : bag.map((o) => {
          const it = items.get(o.id);
          return { id: o.id, price: it ? sellPrice(it) : 0, count: 1, key: o.uid };
        });
  const rows = Math.ceil(list.length / COLS);
  const maxTop = Math.max(0, rows - ROWS);
  const shown = hover !== null ? list[hover] : undefined;
  const item = shown && items.get(shown.id);

  const pick = (i: number) => {
    const row = list[i];
    if (!row) return;
    const name = items.get(row.id)?.name ?? "";
    const why = mode === "buy" ? onBuy(i) : onSell(row.key);
    if (why) setNote({ text: why, bad: true });
    else setNote({ text: mode === "buy" ? t`已購買 ${name}` : t`已出售 ${name}`, bad: false });
    setHover(null);
  };

  return (
    <div className="relative h-[280px] w-[384px] select-none">
      <Ui name="shop/itembox" w={384} h={280} className="absolute inset-0" />
      <p className="absolute -top-[22px] left-[6px] font-bold text-[14px] text-white [text-shadow:0_1px_2px_#000]">
        {title}
      </p>
      <div className="absolute -top-[26px] right-[4px] flex gap-1">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setTop(0);
              setNote(null);
            }}
            className={cn(
              "rounded-t-[6px] border-2 border-b-0 px-3 py-[1px] font-bold text-[12px]",
              mode === m
                ? "border-[#2d4bd8] bg-[#1f35b8] text-white"
                : "border-[#2d4bd8]/60 bg-[#0c1a66]/80 text-white/60 hover:text-white",
            )}
          >
            {m === "buy" ? t`買` : t`賣`}
          </button>
        ))}
      </div>

      <div
        className="absolute top-[12px] left-[8px] h-[208px] w-[347px] overflow-hidden"
        onWheel={(e) => setTop((r) => Math.max(0, Math.min(maxTop, r + Math.sign(e.deltaY))))}
        onPointerLeave={() => setHover(null)}
      >
        {Array.from({ length: COLS * ROWS }, (_, k) => {
          const i = top * COLS + k;
          const row = list[i];
          const it = row && items.get(row.id);
          return (
            <button
              key={row ? `${mode}-${row.key}` : `empty-${k}`}
              type="button"
              disabled={!row}
              className="group absolute grid place-items-center"
              style={{
                left: (k % COLS) * CW,
                top: Math.floor(k / COLS) * CH,
                width: CW,
                height: CH,
              }}
              onPointerEnter={() => row && setHover(i)}
              onClick={() => pick(i)}
              aria-label={it ? `${it.name} $${row.price}` : t`空`}
            >
              {row && (
                <>
                  <span className="absolute inset-[3px] rounded-[3px] transition group-hover:bg-white/15 group-hover:ring-2 group-hover:ring-white/70" />
                  {it?.icon && (
                    <img
                      src={asset(it.icon)}
                      alt=""
                      className="pointer-events-none max-h-[44px] max-w-[58px] object-contain"
                      draggable={false}
                    />
                  )}
                  <span
                    className={cn(
                      "absolute bottom-[3px] left-[4px] font-lfo text-[9px] [text-shadow:0_1px_0_#000]",
                      mode === "sell"
                        ? row.price > 0
                          ? "text-[#c8ff9a]"
                          : "text-white/40"
                        : money >= row.price
                          ? "text-[#ffe08a]"
                          : "text-[#ff9b9b]",
                    )}
                  >
                    {mode === "sell" && row.price <= 0 ? "—" : `$${row.price.toLocaleString()}`}
                  </span>
                  {mode === "buy" && (
                    <span className="absolute top-[3px] right-[5px] font-lfo text-[9px] text-white/85 [text-shadow:0_1px_0_#000]">
                      ×{row.count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      {maxTop > 0 && (
        <div
          className="absolute left-[362px] w-[10px] rounded-full bg-white/70"
          style={{ top: 16 + (top / maxTop) * 170, height: 30 }}
        />
      )}

      {/* the text strip */}
      <div className="absolute top-[242px] left-[12px] flex h-[20px] w-[284px] items-center gap-2 overflow-hidden text-[12px] text-white">
        {item && shown ? (
          <>
            <span className="truncate font-bold">{item.name}</span>
            <span className="flex shrink-0 gap-1.5 font-lfo text-[9px] text-[#ffe08a]">
              {STAT.filter(([k]) => item.mods[k]).map(([k, label]) => (
                <span key={k}>
                  {label}
                  {item.mods[k] > 0 ? "+" : ""}
                  {item.mods[k]}
                </span>
              ))}
            </span>
            {item.req_lv > 0 && (
              <span className="shrink-0 text-[10px] text-white/70">LV {item.req_lv}</span>
            )}
          </>
        ) : note ? (
          <span className={note.bad ? "text-[#ffb0b0]" : "text-[#c8ff9a]"}>{note.text}</span>
        ) : (
          <span className="text-white/75">
            {mode === "buy" ? t`點擊物品購買` : bag.length ? t`點擊背包物品出售` : t`背包是空的`}
          </span>
        )}
        <span className="ml-auto shrink-0 font-lfo text-[10px] text-[#ffe08a]">
          ${money.toLocaleString()}
        </span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute top-[239px] left-[302px] h-[25px] w-[58px] rounded-[4px] hover:bg-white/15"
        aria-label={t`離開`}
      />
    </div>
  );
}
