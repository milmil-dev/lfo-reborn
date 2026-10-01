import { motion } from "motion/react";
import { asset } from "@/lib/api";
import { PlateButton } from "./chat";
import { Ui, uiUrl } from "./ui";

/*
  Game lettering and HUD art from the client's pieces (HD, kit/ui): the HIT counter
  (combo/combo0–10), GO!! (misc/gogogo*), the bottom dial + item bar (gameinterface/default/exp1
  with lv and digit*), the chapter cards (intro/title*, stage*_b5) and the prologue (intro/text*).
*/

/** Combo digits (combo/combo0–9, red with a green rim). */
export function ComboNumber({ value, size = 37 }: { value: number; size?: number }) {
  const k = size / 37;
  return (
    <span className="inline-flex items-end" aria-label={String(value)}>
      {String(value)
        .split("")
        .map((d, i) => (
          <Ui key={`${i}-${d}`} name={`combo/combo${d}`} h={37 * k} className="w-auto" />
        ))}
    </span>
  );
}

export function HitBadge() {
  return <Ui name="combo/combo10" w={99} h={99} alt="Hit" />;
}

export function GoArrowArt({ flip }: { flip?: boolean }) {
  return <Ui name={`misc/gogogo${flip ? "left" : "right"}`} w={215} h={99} alt="GO" />;
}

/** HUD digits (gameinterface/default/digit0–9, digit10 = ":"). */
function HudDigits({ text, h = 20 }: { text: string; h?: number }) {
  return (
    <span className="inline-flex" aria-label={text}>
      {text.split("").map((c, i) => (
        <Ui
          key={`${i}-${c}`}
          name={`gameinterface/default/digit${c === ":" ? 10 : c}`}
          // the digit art is 17 × 20: a fixed width keeps the line centred before it loads
          w={(h * 17) / 20}
          h={h}
        />
      ))}
    </span>
  );
}

/** An item bar slot's contents: its icon and how many are carried. */
export type BarSlot = { icon: string | null; count: number; name: string };

/**
 * The bottom HUD (exp1, 800 × 150) with the clock on the lens and LV / EXP / MONEY in the dial.
 * Its item bar is printed in the art: the fist slot at x 220 and ten more 35 px apart, y 121,
 * each 32 × 26 (gameinterface/default/emptyslot / activeslot).
 */
export function DialBar({
  clock,
  level,
  exp,
  money,
  slots = [],
  selected = 0,
  onSelect,
  onLogo,
  onItem,
  width = 800,
}: {
  clock: string;
  level: number;
  exp: number;
  money: number;
  /** the ten item slots after the fist */
  slots?: (BarSlot | null)[];
  /** 0 = the fist, 1–10 = an item slot */
  selected?: number;
  onSelect?: (slot: number) => void;
  /** the LFO plate at the strip's right end (the lobby opens its system menu there) */
  onLogo?: () => void;
  /** the Item plate that closes the strip on the right */
  onItem?: () => void;
  /** the screen's width in HUD units: the strip stretches to it, its LFO end and Item plate
   * at the right edge */
  width?: number;
}) {
  const W = Math.max(800, width);
  const fill = W - 800;
  const src = uiUrl("gameinterface/default/exp1");
  // exp1 (800 × 150): the dial and slots up to the divider at 612, the LFO panel 612 – 710,
  // the strip itself y 115 – 150; a plain 5-unit piece of the panel (613 – 618) fills the gap
  const piece = (left: number, from: number, w: number) => (
    <div
      className="absolute top-0 h-[150px] overflow-hidden"
      style={{ left, width: w }}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute top-0 h-[150px] w-[800px] max-w-none"
        style={{ left: -from }}
      />
    </div>
  );
  return (
    <div className="relative h-[150px]" style={{ width: W }}>
      {piece(0, 0, 612)}
      {fill > 0 && (
        <div
          className="absolute top-[115px] h-[35px] overflow-hidden"
          style={{ left: 612, width: fill + 1 }}
          aria-hidden
        >
          <img
            src={src}
            alt=""
            draggable={false}
            className="absolute h-[150px] max-w-none"
            style={{ top: -115, width: 800 * ((fill + 1) / 5), left: -613 * ((fill + 1) / 5) }}
          />
        </div>
      )}
      {piece(612 + fill, 612, 188)}
      {onLogo && (
        <button
          type="button"
          onClick={onLogo}
          aria-label="LFO"
          className="pointer-events-auto absolute top-[118px] h-[30px] w-[94px] rounded-[4px] hover:bg-white/15"
          style={{ left: 613 + fill }}
        />
      )}
      <div className="pointer-events-auto absolute top-[115px]" style={{ left: W - 99 }}>
        <PlateButton plate="item" onClick={onItem} aria-label="Item" />
      </div>
      {Array.from({ length: 11 }, (_, i) => {
        const slot = i === 0 ? null : slots[i - 1];
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect?.(i)}
            className="pointer-events-auto absolute grid h-[26px] w-[32px] place-items-center"
            style={{ left: 219 + i * 35, top: 121 }}
            aria-label={i === 0 ? "拳頭" : (slot?.name ?? `slot ${i}`)}
          >
            {i === selected && (
              <Ui
                name="gameinterface/default/activeslot"
                w={32}
                h={26}
                className="absolute inset-0"
              />
            )}
            {slot?.icon && (
              <img
                src={asset(slot.icon)}
                alt=""
                className="pointer-events-none relative max-h-[20px] max-w-[26px] object-contain"
                draggable={false}
              />
            )}
            {slot && slot.count > 1 && (
              <span className="absolute right-[2px] bottom-0 font-lfo text-[8px] text-white [text-shadow:0_1px_0_#000]">
                {slot.count}
              </span>
            )}
          </button>
        );
      })}
      {/* centred in the green lens, measured from exp1: x 72.75 – 156.25, y 26 – 57 */}
      <div className="absolute top-[26px] left-[72.75px] flex h-[31px] w-[83.5px] items-center justify-center">
        <HudDigits text={clock} h={11} />
      </div>
      <Ui
        name="gameinterface/default/lv"
        w={68}
        h={47}
        className="absolute top-[68px] left-[46px]"
      />
      <div className="absolute top-[70px] left-[118px]">
        <HudDigits text={String(level)} h={19} />
      </div>
      {/* white figures right after the art's EXP: / MONEY: labels, grouped with commas */}
      <p className="absolute top-[91px] left-[76px] text-[12px] text-white tabular-nums leading-none [text-shadow:1px_1px_0_#000]">
        {exp.toLocaleString()}
      </p>
      <p className="absolute top-[102px] left-[92px] text-[12px] text-white tabular-nums leading-none [text-shadow:1px_1px_0_#000]">
        {money.toLocaleString()}
      </p>
    </div>
  );
}

const TITLE_ART: Record<string, number> = { school: 1, coliseum: 2, lantau: 3, icefire: 4 };

/** Chapter card: the original 800 × 600 title (intro/title1–4) or the stageN + area banners. */
export function ChapterCardArt({ stage, area }: { stage: number; area: string }) {
  const n = TITLE_ART[area];
  if (n)
    return (
      <motion.div
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <Ui name={`intro/title${n}`} w={800} h={600} />
      </motion.div>
    );
  return (
    <div className="relative h-[600px] w-[800px]">
      <motion.div
        className="absolute top-[180px] left-[80px]"
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <Ui name={`intro/stage${stage}_b5`} w={512} h={128} />
      </motion.div>
      <motion.div
        className="absolute top-[290px] left-[210px]"
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Ui name={`intro/${area}_b5`} w={512} h={128} />
      </motion.div>
    </div>
  );
}

/** The prologue's lines (intro/text1–5), text kept for screen readers. */
export const PROLOGUE = [
  [
    "時空無涯，宇宙無量。",
    "在那超越時空，比洪荒更遠古的時代，",
    "神賜給祂的後裔 —— 人類，",
    "一種源自宇宙深處的無邊力量 —— 元力。",
  ],
  [
    "憑著這股偉大的力量，人類能抵擋暴獸的圍攻，",
    "渡過酷寒的冰河時代，並熬過隕石墜落所造成的赤煉日子，",
    "最終變成大地的真正主宰。",
  ],
  [
    "隨著年月的過去，安穩的生活，使人們開始倚重智慧。",
    "曾經賴以為生的偉大元力，變得無用武之地，",
    "從而逐漸被遺忘掉，也逐漸被掩藏埋沒。",
  ],
  ["但每當世界出現真的災難之時，", "元力始終會再次成為救世的最後力量。"],
  ["新的故事、新的神話、新的英雄，在這刻又再誕生了……"],
];

export function PrologueLines({ shot }: { shot: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
    >
      <Ui name={`intro/text${shot + 1}`} w={786} h={205} alt={PROLOGUE[shot].join("")} />
    </motion.div>
  );
}
