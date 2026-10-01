import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { Owned } from "@/game/inventory";
import { cannotRepair, isMaterial, MATERIAL_BASE, repairFee } from "@/game/smith";
import type { ItemRow } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChestBag } from "./chest-bag";
import { Icon } from "./equip-box";
import { Ui } from "./ui";

/*
  鐵匠 (ironsmith/ironsmith_interface) and the 合成 table (compose/composebox), both 350 × 300 with
  two item plates side by side — the thing to work on at (50, 51) and what to use on it at
  (201, 51), ~100 px square — beside the backpack chest. 維修 puts the item left and its
  material right, the text strip below shows the 修理費; 合成 puts the 魔劍 left and the 魔精石
  right. Picking from the backpack fills the matching plate; clicking a plate empties it.
*/

const PLATE = 99;
const PLATES = [
  { x: 50, y: 51 },
  { x: 201, y: 51 },
];
const BOX_X = 226;
const BOX_Y = 64;

export type SmithMode = "repair" | "compose";

export function SmithBox({
  mode,
  bag,
  items,
  money,
  onRun,
  onClose,
}: {
  mode: SmithMode;
  bag: Owned[];
  items: Map<number, ItemRow>;
  money: number;
  /** repair / compose the pair (backpack uids); returns what the smith says and whether it worked */
  onRun: (left: number, right: number) => { ok: boolean; text: string };
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [slots, setSlots] = useState<[number | null, number | null]>([null, null]);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const pair = slots.map((uid) => {
    const copy = uid === null ? undefined : bag.find((o) => o.uid === uid);
    const item = copy && items.get(copy.id);
    return copy && item ? { copy, item } : null;
  });
  const [target, tool] = pair;

  const put = (copy: Owned) => {
    const item = items.get(copy.id);
    if (!item) return;
    // materials (and 魔精石) go on the right plate, everything else on the left
    const right = mode === "repair" ? isMaterial(item) : item.part === 11;
    setSlots((s) => (right ? [s[0], copy.uid] : [copy.uid, s[1]]));
    setSaid(null);
  };

  const run = () => {
    if (slots[0] === null || slots[1] === null) {
      setSaid({
        ok: false,
        text: mode === "repair" ? (cannotRepair(target, tool) ?? "") : t`把魔劍和魔精石交給我吧……`,
      });
      return;
    }
    const r = onRun(slots[0], slots[1]);
    setSaid(r);
    if (r.ok) setSlots([null, null]);
  };

  // the strip: what was said, else the fee (or the smith's objection) for what is on the plates
  let strip: { ok: boolean; text: string };
  if (said) strip = said;
  else if (mode === "compose")
    strip = { ok: true, text: t`帶來魔劍和魔精石，我幫你把兇獸的力量鑲進劍裡。` };
  else if (!target) strip = { ok: true, text: t`先讓老子看看要修理的東西吧！` };
  else {
    const why = cannotRepair(target, tool ?? null);
    const fee = repairFee(target.copy, target.item);
    const need = items.get(MATERIAL_BASE + target.item.material);
    strip =
      why && (tool || target.item.material < 0 || fee === 0)
        ? { ok: false, text: why }
        : {
            ok: money >= fee,
            text: `${t`修理費：`}$${fee.toLocaleString()}${!tool && need ? t`（需要「${need.name}」）` : ""}`,
          };
  }

  return (
    <div className="relative h-[427px] w-[576px] select-none">
      <ChestBag
        bag={bag}
        items={items}
        x={0}
        y={0}
        onPick={put}
        onClose={onClose}
        faded={(c) => slots.includes(c.uid)}
      />
      <div className="absolute h-[300px] w-[350px]" style={{ left: BOX_X, top: BOX_Y }}>
        <Ui
          name={mode === "repair" ? "ironsmith/ironsmith_interface" : "compose/composebox"}
          w={350}
          h={300}
          className="absolute inset-0"
        />
        {PLATES.map((p, i) => {
          const it = pair[i];
          return (
            <button
              key={p.x}
              type="button"
              className="group absolute grid place-items-center"
              style={{ left: p.x, top: p.y, width: PLATE, height: PLATE }}
              onClick={() => {
                setSlots((s) => (i === 0 ? [null, s[1]] : [s[0], null]));
                setSaid(null);
              }}
              aria-label={it?.item.name ?? (i === 0 ? t`物品` : t`材料`)}
            >
              {it && (
                <>
                  <span className="absolute inset-[4px] rounded-[3px] transition group-hover:bg-white/15" />
                  <Icon item={it.item} broken={it.copy.dur === 0} w={78} h={78} />
                  <span className="absolute bottom-[4px] left-1/2 max-w-[92px] -translate-x-1/2 truncate rounded-[3px] bg-black/70 px-1 text-[10px] text-white">
                    {it.item.name}
                  </span>
                </>
              )}
            </button>
          );
        })}

        {mode === "repair" && (
          <div className="absolute top-[189px] left-[51px] flex h-[27px] w-[248px] items-center overflow-hidden px-2">
            <p
              className={cn(
                "whitespace-pre-line text-[11px] leading-[1.15] font-bold",
                strip.ok ? "text-[#2a2a2a]" : "text-[#a01010]",
              )}
            >
              {strip.text}
            </p>
          </div>
        )}
        {mode === "compose" && (
          <p
            className={cn(
              "absolute top-[156px] left-1/2 w-max max-w-[300px] -translate-x-1/2 rounded-[6px] bg-black/75 px-2.5 py-1 text-center text-[12px] leading-[1.25] font-bold ring-1 ring-[#5fd8ff]/40",
              strip.ok ? "text-[#bff5ff]" : "text-[#ffb0b0]",
            )}
          >
            {strip.text}
          </p>
        )}

        {mode === "repair" ? (
          <button
            type="button"
            onClick={run}
            className="absolute top-[241px] left-[176px] h-[43px] w-[73px] transition hover:brightness-110 active:translate-y-[1px]"
            aria-label={t`維修`}
          >
            <Ui name="ironsmith/ironsmith_button" w={73} h={43} className="absolute inset-0" />
          </button>
        ) : (
          <button
            type="button"
            onClick={run}
            className="group absolute top-[242px] left-[23px] h-[38px] w-[62px]"
            aria-label={t`合成`}
          >
            <Ui
              name="compose/composebox_button_02_b"
              w={62}
              h={38}
              className="absolute inset-0 hidden group-hover:block"
            />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="group absolute top-[243px] left-[262px] h-[38px] w-[63px] rounded-[8px]"
          aria-label={t`離開`}
        >
          {mode === "compose" ? (
            <Ui
              name="compose/composebox_button_01_b"
              w={62}
              h={38}
              className="absolute inset-0 hidden group-hover:block"
            />
          ) : (
            <span className="absolute inset-0 rounded-[10px] group-hover:bg-white/20" />
          )}
        </button>
      </div>
    </div>
  );
}
