import { useLingui } from "@lingui/react/macro";
import { skillLevel, skillToNext } from "@/game/core/skills";
import { cells as tableCells } from "@/game/core/table";
import { useEffect, useState } from "react";
import type { CharData, Move } from "@/game/core/types";
import type { Skill } from "@/lib/api";
import { asset } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  出招表 on the client's skill table (gameinterface/default/skilltable, 342 × 336), laid out as
  LFO.exe draws it: one row per skill tier, tier 1 at the bottom (y = 155 − (tier − 1) · 68),
  slots 69 px apart from x = 20, a 55 px hit area each; usable skills glow with skilllight0–3
  cycling every 200 ms; the chosen one is framed by skilltableselect and described in the box
  below the grid. Which moves fill the nine cells is core/table.ts's business.

  The right-hand column of the frame is the client's skill detail: 學習要求 / 使用要求 / 出招按鍵.
  The remake has no 學習點數 economy, so a move is known from the start; what the column says is
  the MP cost, the command, and — for a move the client's own table has no row for — that its
  command comes straight from the sprite.
*/

const G = "gameinterface/default";
const KEY: Record<string, string> = { G: "防", A: "攻", J: "跳", F: "→", B: "←", U: "↑", D: "↓" };

function keyGlyphs(seq: string) {
  return seq.split("").map((k, i) => (
    <span
      key={`${i}-${k}`}
      className="grid h-[18px] min-w-[18px] place-items-center rounded-[4px] bg-[linear-gradient(#f4f4f4,#b9bcc2)] px-[3px] font-bold text-[#23262c] text-[11px] shadow-[inset_0_-2px_0_rgb(0_0_0/0.25)]"
    >
      {KEY[k] ?? k}
    </span>
  ));
}

/** Chain moves that can follow a special: their source frame lies on its frame chain. */
function followUps(data: CharData, move: Move, moves: Move[]) {
  const seen = new Set<number>();
  let id = move.to;
  while (id !== -1 && !seen.has(id) && data.frames[String(id)]) {
    seen.add(id);
    id = data.frames[String(id)].nx;
  }
  return moves.filter((m) => m.from && seen.has(m.from));
}

export function SkillTable({
  data,
  skills,
  mp,
  lit,
  exp,
  onCast,
  onClose,
  className,
}: {
  data: CharData;
  skills: Map<number, Skill>;
  mp: number;
  /** 招式等級: each special's experience by slot (omitted where levels don't apply) */
  exp?: Record<number, number>;
  /** the move just performed, flashed in the grid */
  lit?: Move | null;
  /** clicking a skill performs it (in a fight); without it a click only selects */
  onCast?: (move: Move) => void;
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useLingui();
  // the nine cells, the client's own rows first (core/table.ts), laid out as LFO.exe draws them
  const tiers = new Map<number, number>();
  for (const [slot, s] of skills) tiers.set(slot, s.tier);
  const cells = tableCells(data, tiers).cells.map((c) => ({
    ...c,
    x: 20 + c.col * 69,
    y: 155 - (c.tier - 1) * 68,
  }));

  const [sel, setSel] = useState(0);
  const chosen = cells[Math.min(sel, cells.length - 1)];
  const skill = chosen && skills.get(chosen.move.slot);
  const chains = chosen ? followUps(data, chosen.move, data.moves) : [];

  // the glow cycles through its four frames every 200 ms, like the client
  const [light, setLight] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLight((l) => (l + 1) % 4), 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={cn("relative h-[336px] w-[342px] select-none", className)}>
      <Ui name={`${G}/skilltable`} w={342} h={336} className="absolute inset-0" />
      {cells.map(({ move, x, y, tier }, i) => {
        const s = skills.get(move.slot);
        const usable = mp >= move.mp;
        const flash = lit && lit.to === move.to;
        return (
          <button
            key={`${move.slot}-${move.to}`}
            type="button"
            onMouseEnter={() => setSel(i)}
            onFocus={() => setSel(i)}
            onClick={() => {
              setSel(i);
              if (onCast && usable) onCast(move);
            }}
            className={cn("absolute size-[55px]", onCast && usable && "cursor-pointer")}
            style={{ left: x, top: y }}
            aria-label={s?.name ?? move.keys.join(" / ")}
          >
            <Ui
              name={`${G}/skilltablebox${Math.min(3, Math.max(1, tier))}`}
              w={51}
              h={51}
              className="absolute top-[7px] left-[8px]"
            />
            <span className="absolute top-[13px] left-[14px] size-[39px] overflow-hidden rounded-[4px] bg-black/50">
              {s?.icon && (
                <img
                  src={asset(s.icon)}
                  alt=""
                  className={cn("size-full object-cover", !usable && "opacity-40 grayscale")}
                  draggable={false}
                />
              )}
            </span>
            {usable && (
              <Ui
                name={`${G}/skilllight${light}`}
                w={65}
                h={65}
                className="absolute top-0 left-px"
              />
            )}
            {exp && (
              <span className="absolute right-[3px] bottom-[1px] rounded-[3px] bg-black/75 px-[3px] font-lfo text-[8px] text-[#ffe08a] leading-[11px]">
                LV{skillLevel(exp[move.slot] ?? 0)}
              </span>
            )}
            {(i === sel || flash) && (
              <Ui
                name={`${G}/skilltableselect`}
                w={58}
                h={58}
                className={cn("absolute top-[4px] left-[5px]", flash && "animate-pulse")}
              />
            )}
          </button>
        );
      })}

      {/* the description box */}
      {chosen && (
        <div className="absolute top-[236px] left-[36px] flex h-[68px] w-[228px] flex-col gap-[5px] text-white">
          <p className="flex items-baseline gap-2">
            <span className="truncate font-bold text-[15px] [text-shadow:0_1px_1px_#000]">
              {skill?.name ?? t`招式 ${chosen.move.slot}`}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 font-lfo text-[11px] tabular-nums",
                mp >= chosen.move.mp ? "text-[#9fd3ff]" : "text-[#ff9b9b]",
              )}
            >
              MP {chosen.move.mp}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-[3px]">
            {chosen.move.keys.map((k, i) => (
              <span key={k} className="flex items-center gap-[3px]">
                {i > 0 && <span className="px-[2px] text-[10px] text-white/70">{t`或`}</span>}
                {keyGlyphs(k)}
              </span>
            ))}
          </p>
          {exp && (
            <p className="font-lfo text-[9px] text-[#ffe08a]/90">
              LV {skillLevel(exp[chosen.move.slot] ?? 0)}
              {skillToNext(exp[chosen.move.slot] ?? 0) > 0
                ? t`　再使用 ${skillToNext(exp[chosen.move.slot] ?? 0)} 次升級`
                : t`　已達最高等級`}
            </p>
          )}
          {chains.length > 0 && (
            <p className="flex flex-wrap items-center gap-[3px] text-[10px] text-white/80">
              {t`接續`}
              {chains.map((c) => (
                <span key={`${c.from}-${c.to}`} className="flex gap-[2px]">
                  {keyGlyphs(c.keys[0])}
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {/*
        the frame's right-hand column, as the client's skill detail reads it: 使用要求 (the MP),
        出招按鍵 (the command). Every move is known from the start — the remake has no 學習點數 —
        so there is no 學習要求 to print.
      */}
      {chosen && (
        <div className="absolute top-[30px] left-[220px] flex w-[92px] flex-col gap-[4px] text-white">
          <p className="font-bold text-[10px] text-white/85 leading-none">{t`使用要求`}</p>
          <p
            className={cn(
              "font-lfo text-[11px] tabular-nums leading-none",
              mp >= chosen.move.mp ? "text-[#9fd3ff]" : "text-[#ff9b9b]",
            )}
          >
            {t`元力 ${chosen.move.mp}`}
          </p>
          <p className="mt-[8px] font-bold text-[10px] text-white/85 leading-none">{t`出招按鍵`}</p>
          <p className="flex flex-wrap items-center gap-[2px]">{keyGlyphs(chosen.move.keys[0])}</p>
          {!chosen.listed && (
            <p className="mt-[8px] text-[9px] text-[#ffe08a] leading-[12px]">{t`指令取自招式表`}</p>
          )}
        </div>
      )}
      {onClose && (
        <>
          {/* the client's closetablebutton (24 × 23) sits in the frame's top-right notch */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-[3px] left-[313.5px] h-[23px] w-[24px] transition hover:brightness-125 active:scale-95"
            aria-label={t`關閉`}
          >
            <Ui name={`${G}/closetablebutton`} w={24} h={23} />
          </button>
          {/* the round button under the description closes it too */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-[283px] left-[280px] size-[26px] rounded-full"
            aria-label={t`關閉`}
          />
        </>
      )}
    </div>
  );
}
