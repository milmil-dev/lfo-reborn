import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { type Card, cardName, serial } from "@/game/cards";
import { asset } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  卡片店: the card list on the shop box (shop/itembox, 384 × 280, a 5 × 3 grid of ~69 px cells
  from (8, 12), 離開 printed in the art) above the client's card box (itemcard/itemcardbody,
  400 × 200: 序號 and 密碼 fields at (31, 62) and (31, 123), each 341 × 21). Picking a card
  fills its serial and password in; 輸入 enters it.
*/

const COLS = 5;
const ROWS = 3;
const CW = 69.4;
const CH = 69.3;

export type CardTab = "item" | "char" | "relic";

function CardIcon({ card, w, h }: { card: Card; w: number; h: number }) {
  if (card.kind === "item")
    return card.item.icon ? (
      <img
        src={asset(card.item.icon)}
        alt=""
        draggable={false}
        className="pointer-events-none object-contain"
        style={{ maxWidth: w, maxHeight: h }}
      />
    ) : null;
  if (card.kind === "char")
    return (
      <img
        src={`${ASSETS}/ui-hd/waitplayer/waitsprite${card.char.id}.webp`}
        alt=""
        draggable={false}
        className="pointer-events-none h-[30px] w-[40px]"
      />
    );
  const src = (id: number) => `${ASSETS}/ui-hd/interface/tranformicon/tranicon${id}.webp`;
  return (
    <img
      src={src(card.relic.id)}
      alt=""
      draggable={false}
      className="pointer-events-none"
      style={{ width: Math.min(w, h), height: Math.min(w, h) }}
      onError={(e) => {
        if (!e.currentTarget.src.endsWith("tranicon1.webp")) e.currentTarget.src = src(1);
      }}
    />
  );
}

export function CardBox({
  cards,
  owned,
  ownedChars,
  onEnter,
  onClose,
}: {
  cards: Record<CardTab, Card[]>;
  /** 信物 the account already holds (their cards show as used) */
  owned: Set<number>;
  /** characters the account already owns (their cards show as used) */
  ownedChars?: Set<string>;
  onEnter: (card: Card) => { ok: boolean; text: string };
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [tab, setTab] = useState<CardTab>("item");
  const [query, setQuery] = useState("");
  const [top, setTop] = useState(0);
  const [picked, setPicked] = useState<Card | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const q = query.trim();
  const list = q ? cards[tab].filter((c) => cardName(c).includes(q)) : cards[tab];
  const maxTop = Math.max(0, Math.ceil(list.length / COLS) - ROWS);
  const used = (c: Card) =>
    (c.kind === "relic" && owned.has(c.relic.id)) ||
    (c.kind === "char" && !!ownedChars?.has(c.char.key));

  return (
    <div className="relative h-[492px] w-[400px] select-none">
      {/* the list */}
      <div className="absolute top-[30px] left-[8px] h-[280px] w-[384px]">
        <Ui name="shop/itembox" w={384} h={280} className="absolute inset-0" />
        <div className="absolute -top-[28px] left-0 flex w-full items-end gap-1">
          {(["item", "char", "relic"] as const)
            .filter((k) => cards[k].length > 0)
            .map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k);
                  setTop(0);
                }}
                className={cn(
                  "rounded-t-[6px] border-2 border-b-0 px-3 py-[1px] font-bold text-[12px]",
                  tab === k
                    ? "border-[#2d4bd8] bg-[#1f35b8] text-white"
                    : "border-[#2d4bd8]/60 bg-[#0c1a66]/80 text-white/60 hover:text-white",
                )}
              >
                {k === "item" ? t`道具` : k === "char" ? t`人物` : t`異轉信物`}
                <span className="ml-1 font-lfo text-[9px] opacity-70">{cards[k].length}</span>
              </button>
            ))}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTop(0);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={t`搜尋卡片`}
            className="mb-[3px] ml-auto h-[20px] w-[120px] rounded-[4px] border border-white/30 bg-black/60 px-2 text-[11px] text-white outline-none placeholder:text-white/40 focus:border-[#7fb0ff]"
          />
        </div>
        <div
          className="absolute top-[12px] left-[8px] h-[208px] w-[347px] overflow-hidden"
          onWheel={(e) => setTop((r) => Math.max(0, Math.min(maxTop, r + Math.sign(e.deltaY))))}
        >
          {Array.from({ length: COLS * ROWS }, (_, k) => {
            const card = list[top * COLS + k];
            const on = !!card && !!picked && serial(card) === serial(picked);
            return (
              <button
                key={card ? serial(card) : `empty-${k}`}
                type="button"
                disabled={!card}
                title={card ? cardName(card) : undefined}
                className="group absolute grid place-items-center"
                style={{
                  left: (k % COLS) * CW,
                  top: Math.floor(k / COLS) * CH,
                  width: CW,
                  height: CH,
                }}
                onClick={() => {
                  if (!card) return;
                  setPicked(card);
                  setSaid(null);
                }}
                aria-label={card ? cardName(card) : t`空`}
              >
                {card && (
                  <>
                    <span
                      className={cn(
                        "absolute inset-[3px] rounded-[3px] transition",
                        on
                          ? "bg-white/25 ring-2 ring-[#ffe08a]"
                          : "group-hover:bg-white/15 group-hover:ring-2 group-hover:ring-white/70",
                      )}
                    />
                    <span
                      className={cn(
                        "grid place-items-center",
                        used(card) && "opacity-35 grayscale",
                      )}
                    >
                      <CardIcon card={card} w={52} h={40} />
                    </span>
                    <span className="absolute inset-x-[4px] bottom-[3px] truncate text-center text-[9px] text-white [text-shadow:0_1px_0_#000]">
                      {cardName(card)}
                    </span>
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
        <div className="absolute top-[242px] left-[12px] flex h-[20px] w-[284px] items-center overflow-hidden text-[12px] text-white/80">
          {picked
            ? picked.kind === "relic"
              ? t`${picked.relic.name}的異轉信物`
              : picked.kind === "char"
                ? t`人物卡：之後到儲物室提取到角色欄`
                : `${picked.item.category}${picked.item.req_lv ? ` · LV ${picked.item.req_lv}` : ""}`
            : list.length
              ? t`選擇一張卡片，再按「輸入」`
              : t`沒有符合的卡片`}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-[239px] left-[302px] h-[25px] w-[58px] rounded-[4px] hover:bg-white/15"
          aria-label={t`離開`}
        />
      </div>

      {/* the card box */}
      <div className="absolute top-[292px] left-0 h-[200px] w-[400px]">
        <Ui name="itemcard/itemcardbody" w={400} h={200} className="absolute inset-0" />
        {picked && (
          <p className="absolute top-[40px] left-[110px] max-w-[260px] truncate font-bold text-[12px] text-[#ffe08a]">
            {cardName(picked)}
          </p>
        )}
        <p className="absolute top-[62px] left-[40px] flex h-[21px] items-center font-lfo text-[13px] tracking-[0.12em] text-[#2a2a2a]">
          {picked ? serial(picked) : ""}
        </p>
        <p className="absolute top-[123px] left-[40px] flex h-[21px] items-center font-lfo text-[13px] tracking-[0.3em] text-[#2a2a2a]">
          {picked ? "●●●●-●●●●-●●●●-●●●●" : ""}
        </p>
        {said && (
          <p
            className={cn(
              "absolute top-[158px] left-[168px] max-w-[224px] rounded-[5px] bg-black/75 px-2 py-1 text-[11px] leading-tight font-bold",
              said.ok ? "text-[#c8ff9a]" : "text-[#ffb0b0]",
            )}
          >
            {said.text}
          </p>
        )}
        <button
          type="button"
          disabled={!picked}
          onClick={() => {
            if (!picked) return;
            setSaid(onEnter(picked));
          }}
          className="group absolute top-[160px] left-[56px] h-[22px] w-[56px] disabled:opacity-50"
          aria-label={t`輸入`}
        >
          <Ui
            name="itemcard/itemcardenter1"
            w={56}
            h={22}
            className="absolute inset-0 group-hover:hidden"
          />
          <Ui
            name="itemcard/itemcardenter2"
            w={56}
            h={22}
            className="absolute inset-0 hidden group-hover:block"
          />
        </button>
      </div>
    </div>
  );
}
