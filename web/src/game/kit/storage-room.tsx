import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { CardChar, Relic } from "@/game/cards";
import { ASSETS } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  儲物室 (storageroom/store_rm, 239 × 263): what the account holds from cards, under the tabs the
  art prints — 人物 招式 道具 異轉信物 (the store_rm_word1–4 highlights light the open one) — in a
  5 × 4 grid of 39.6 px cells from (20.4, 80.1). A character is taken out (提取) into an empty
  profile slot under a new name; skills and items from cards go straight into the game here, so
  those tabs stay empty; 異轉信物 shows the relics held.
*/

const COLS = 5;
const ROWS = 4;
const CELL = 39.6;
const GX = 20.4;
const GY = 80.1;
type Tab = "char" | "skill" | "item" | "relic";
// tab words as the art prints them, and the highlight drawn over the open one
const TABS: { id: Tab; x: number; w: number; word: number }[] = [
  { id: "char", x: 14, w: 27, word: 1 },
  { id: "skill", x: 50.5, w: 27, word: 3 },
  { id: "item", x: 87.8, w: 27, word: 2 },
  { id: "relic", x: 124.5, w: 52, word: 4 },
];

export function StorageRoom({
  chars,
  relics,
  onExtract,
  onClose,
}: {
  /** characters the account owns, not yet in a slot */
  chars: CardChar[];
  relics: Relic[];
  /** take a character out into the selected slot under `name`: what the room says back */
  onExtract: (c: CardChar, name: string) => { ok: boolean; text: string };
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [tab, setTab] = useState<Tab>("char");
  const [picked, setPicked] = useState<CardChar | null>(null);
  const [name, setName] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const cells: { key: string; icon: string; label: string; onPick?: () => void }[] =
    tab === "char"
      ? chars.map((c) => ({
          key: c.key,
          icon: `${ASSETS}/ui-hd/waitplayer/waitsprite${c.id}.webp`,
          label: c.name,
          onPick: () => {
            setPicked(c);
            setName(c.name);
            setSaid(null);
          },
        }))
      : tab === "relic"
        ? relics.map((r) => ({
            key: String(r.id),
            icon: `${ASSETS}/ui-hd/interface/tranformicon/tranicon${r.id}.webp`,
            label: `${r.name}：${r.relic}`,
          }))
        : [];

  return (
    <div className="relative h-[263px] w-[239px] select-none">
      <Ui name="storageroom/store_rm" w={239} h={263} className="absolute inset-0" />
      {TABS.map((tb) => (
        <button
          key={tb.id}
          type="button"
          onClick={() => {
            setTab(tb.id);
            setPicked(null);
            setSaid(null);
          }}
          className="absolute h-[16px]"
          style={{ left: tb.x, top: 48, width: tb.w }}
          aria-label={tb.id}
        >
          {tab === tb.id && (
            <Ui
              name={`storageroom/store_rm_word${tb.word}`}
              w={tb.w}
              h={13}
              className="absolute top-[2px] left-0"
            />
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-[17px] left-[205px] h-[14px] w-[24px] rounded-[2px] hover:bg-white/30"
        aria-label={t`關閉`}
      />

      {cells.slice(0, COLS * ROWS).map((c, i) => (
        <button
          key={c.key}
          type="button"
          title={c.label}
          onClick={c.onPick}
          disabled={!c.onPick}
          className={cn(
            "group absolute grid place-items-center",
            picked?.key === c.key && "ring-2 ring-[#ffe08a]",
          )}
          style={{
            left: GX + (i % COLS) * CELL,
            top: GY + Math.floor(i / COLS) * CELL,
            width: CELL,
            height: CELL,
          }}
        >
          <img
            src={c.icon}
            alt={c.label}
            draggable={false}
            className="max-h-[30px] max-w-[36px] object-contain"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
          {c.onPick && (
            <span className="absolute inset-[2px] rounded-[2px] group-hover:bg-white/20" />
          )}
        </button>
      ))}
      {!cells.length && (
        <p className="absolute top-[150px] w-full text-center text-[11px] text-white/70">
          {tab === "char"
            ? t`沒有可提取的人物（所有人物都可在建立角色時直接選擇）`
            : t`沒有可提取的項目`}
        </p>
      )}

      {/* below the room: the extraction */}
      <div className="absolute top-[270px] left-0 w-[239px] text-[11px]">
        {picked && (
          <div className="flex flex-col gap-1.5 rounded-[6px] bg-black/70 p-2">
            <p className="font-bold text-white">{t`確定提取人物「${picked.name}」嗎？`}</p>
            <div className="flex items-center gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 12))}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label={t`角色名字`}
                className="h-[22px] min-w-0 flex-1 rounded-[3px] border border-white/30 bg-white px-1.5 text-[12px] text-[#23272f] outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const r = onExtract(picked, name);
                  setSaid(r);
                  if (r.ok) setPicked(null);
                }}
                className="h-[22px] shrink-0 rounded-[3px] bg-[#1f35b8] px-2 font-bold text-white hover:brightness-125"
              >
                {t`提取`}
              </button>
            </div>
          </div>
        )}
        {said && (
          <p className={cn("mt-1.5 font-bold", said.ok ? "text-[#c8ff9a]" : "text-[#ffb0b0]")}>
            {said.text}
          </p>
        )}
      </div>
    </div>
  );
}
