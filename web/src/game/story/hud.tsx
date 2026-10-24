import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  type BarSlot,
  ChapterCardArt,
  ComboNumber,
  DialBar,
  GoArrowArt,
  HitBadge,
} from "../kit/art";
import { StatusPanel } from "../kit/frames";
import { Ui } from "../kit/ui";
import { ASSETS } from "@/lib/assets";
import { rankOf } from "@/game/vs";
import { BOX_H, layoutMap } from "@/game/minimap";
import type { StoryData } from "@/game/story/types";

export { DialogFrame } from "../kit/frames";

/*
  The in-game HUD, laid out like the original client (status box top-left, dial + item bar at
  the bottom, HIT counter, GO!!, chapter cards) in its 800 × 600 pixels and scaled with the
  viewport. All chrome is the SVG/CSS kit in game/kit; only the portraits are art.
*/

export function useHudScale() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const fit = () => setS(Math.min(innerHeight / 600, innerWidth / 800));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return s;
}

/** A block positioned in 800×600 space and scaled from one of the viewport's corners. */
function Anchor({
  corner,
  scale,
  children,
  className,
}: {
  corner: "tl" | "tr" | "bl" | "br";
  scale: number;
  children: ReactNode;
  className?: string;
}) {
  const [v, h] = [corner[0] === "t" ? "top" : "bottom", corner[1] === "l" ? "left" : "right"];
  return (
    <div
      className={cn("pointer-events-none absolute", className)}
      style={{ [v]: 0, [h]: 0, transform: `scale(${scale})`, transformOrigin: `${v} ${h}` }}
    >
      {children}
    </div>
  );
}

/** The screen's width in HUD units (the HUD is drawn at `scale`). */
function useViewWidth(scale: number) {
  // clientWidth: the visible width, without a scrollbar the strip would otherwise run under
  const read = () => (typeof document === "undefined" ? 800 : document.documentElement.clientWidth);
  const [w, setW] = useState(read);
  useEffect(() => {
    const on = () => setW(read());
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return w / Math.max(0.01, scale);
}

/* ───────── top-left status box ───────── */

export type Vitals = {
  name: string;
  charId: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  sp: number;
  maxSp: number;
  /** elements on the character that the client marks with an icon (core/status.ts) */
  status?: string[];
  /** 勳銜 honor: the rank's medal sits beside the name (a player only) */
  honor?: number;
};

const STATUS_ICON: Record<string, string> = {
  poison: "effect_poison",
  confuse: "effect_confusion",
  stone: "effect_stone",
};

/**
 * One bar of the original statusbar (63 × 24), as LFO.exe draws it: statusbarwhite (63 × 3)
 * tinted and stretched to the ratio, rows 9 px apart from y 1 (HP red, MP blue, SP white),
 * the frame drawn over the top.
 */
function Fill({
  value,
  max,
  row,
  color,
}: {
  value: number;
  max: number;
  row: number;
  color: string;
}) {
  const ratio = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div
      className="absolute left-0 h-[3px] transition-[width] duration-100"
      style={{ top: 1 + row * 9, width: 63 * ratio, background: color }}
    />
  );
}

/**
 * 異轉能量計: the character's tranformicon, dark and filling from the bottom as hits land,
 * pulsing when full; while transformed it drains. Clicking it transforms / cancels.
 *
 * The icon is there as soon as the account holds the 信物 (tran.mdx), and stays empty and dim
 * until LV 150 arms it — so a player who has the relic can see the marker and read why it does
 * nothing yet, instead of the gauge appearing out of nowhere one day.
 */
export type TranGaugeState = {
  gauge: number;
  active: boolean;
  ready: boolean;
  /** the base character id whose tranicon is shown */
  icon: number;
  /** the key that presses it, shown on the icon */
  keyHint: string;
  /** why it can't be used yet: the level, or the missing 信物 (undefined when it is armed) */
  locked?: "level" | "relic";
  onPress: () => void;
};

function TranGauge({ t }: { t: TranGaugeState }) {
  const src = (id: number) => `${ASSETS}/ui-hd/interface/tranformicon/tranicon${id}.webp`;
  const fill = Math.max(0, Math.min(100, t.gauge));
  const locked = t.locked;
  const img = (className: string, style?: CSSProperties) => (
    <img
      src={src(t.icon)}
      srcSet={`${src(t.icon)} 4x`}
      alt=""
      draggable={false}
      className={cn("absolute inset-0 size-[30px] max-w-none", className)}
      style={style}
      onError={(e) => {
        // only the first forty characters have their own icon in the client
        if (!e.currentTarget.src.endsWith("tranicon1.webp")) e.currentTarget.src = src(1);
      }}
    />
  );
  return (
    <button
      type="button"
      onClick={t.onPress}
      className={cn(
        "group pointer-events-auto absolute top-[61px] left-[122px] size-[30px] rounded-full",
        locked && "cursor-help",
      )}
      aria-label={locked ? `異轉（未開放）` : `異轉 ${Math.floor(fill)}%`}
    >
      {img("opacity-70 grayscale brightness-50")}
      {img("", { clipPath: `inset(${100 - fill}% 0 0 0)` })}
      {locked && <span className="absolute inset-0 rounded-full bg-black/55" />}
      {(t.ready || t.active) && (
        <motion.span
          className={cn(
            "absolute -inset-[3px] rounded-full ring-2",
            t.active ? "ring-[#ffd24a]" : "ring-[#7fe3ff]",
          )}
          animate={{ opacity: [0.35, 1, 0.35], scale: [0.96, 1.06, 0.96] }}
          transition={{ duration: t.active ? 0.6 : 1.1, repeat: Number.POSITIVE_INFINITY }}
        />
      )}
      {t.ready && (
        <span className="absolute -right-[4px] -bottom-[4px] rounded-[3px] bg-black/80 px-[3px] font-lfo text-[8px] text-[#7fe3ff]">
          {t.keyHint}
        </span>
      )}
      {locked && (
        <span className="absolute -right-[4px] -bottom-[4px] rounded-[3px] bg-black/85 px-[3px] font-lfo text-[8px] text-[#ffd27a]">
          LV150
        </span>
      )}
      {locked && (
        <span className="pointer-events-none absolute top-[34px] left-0 z-10 w-[150px] -translate-x-[58px] rounded-[4px] bg-black/90 px-2 py-1 text-[10px] text-white leading-[14px] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {locked === "level"
            ? `異轉需要 LV150；達到後能量計才會儲存能量。`
            : `異轉需要角色的異轉信物（卡片店）。`}
        </span>
      )}
    </button>
  );
}

export function StatusBox({
  v,
  scale,
  corner = "tl",
  tran,
}: {
  v: Vitals;
  scale: number;
  corner?: "tl" | "tr";
  tran?: TranGaugeState;
}) {
  return (
    <Anchor corner={corner} scale={scale}>
      <StatusPanel className={corner === "tl" ? "mt-px ml-[12px]" : "mt-px mr-[12px]"}>
        {/*
          laid out as the client draws it, measured against a screenshot of the original (box at
          12, 1 on the 800 × 600 HUD): the head top-left (chartablephoto at 35 × 44), the
          statusbar at its own size from x 61.5, the 勳銜 medal tucked under the head's right
          edge, the name along the bottom (baseline ~99) and the 異 orb centred at 137, 76 — no
          frame round the photo, no numbers, no rank text
        */}
        <img
          src={`${ASSETS}/ui-hd/gameinterface/default/chartablephoto${v.charId}.webp`}
          srcSet={`${ASSETS}/ui-hd/gameinterface/default/chartablephoto${v.charId}.webp 4x`}
          alt=""
          className="absolute top-[18px] left-[12px] h-[44px] w-[35px] max-w-none"
          onError={(e) => {
            // monsters have no portrait in the client's table
            e.currentTarget.style.display = "none";
          }}
          draggable={false}
        />
        <div className="absolute top-[14.5px] left-[61.5px] h-[24px] w-[63px]">
          <Fill value={v.hp} max={v.maxHp} row={0} color="#ff0000" />
          <Fill value={v.mp} max={v.maxMp} row={1} color="#0000ff" />
          <Fill value={v.sp} max={v.maxSp} row={2} color="#ffffff" />
          <Ui name="gameinterface/default/statusbar" w={63} h={24} className="absolute inset-0" />
        </div>
        {v.honor !== undefined && (
          <Ui
            name={`medal/medal0${rankOf(v.honor) + 1}`}
            // 40 × 40 art (the medal ~15 × 22 in the middle) drawn at 30: a small ribbon by the head
            w={30}
            h={30}
            className="absolute top-[44.5px] left-[35.5px]"
            alt=""
          />
        )}
        <div className="absolute top-[40px] left-[67px] flex gap-[2px]">
          {(v.status ?? [])
            .filter((k) => STATUS_ICON[k])
            .map((k) => (
              <Ui key={k} name={`gameinterface/default/${STATUS_ICON[k]}`} w={16} h={16} />
            ))}
        </div>
        <p className="absolute top-[87px] left-[5.5px] max-w-[112px] truncate text-[14px] text-white leading-none [text-shadow:1px_1px_0_#000,0_0_2px_#000]">
          {v.name}
        </p>
        {tran && <TranGauge t={tran} />}
      </StatusPanel>
    </Anchor>
  );
}

/* ───────── bottom dial + item bar ───────── */

export function BottomBar({
  scale,
  seconds,
  level,
  exp,
  money,
  slots,
  selected,
  onSelect,
  onLogo,
  onItem,
}: {
  scale: number;
  seconds: number;
  level: number;
  exp: number;
  money: number;
  slots?: (BarSlot | null)[];
  selected?: number;
  onSelect?: (slot: number) => void;
  onLogo?: () => void;
  onItem?: () => void;
}) {
  const width = useViewWidth(scale);
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return (
    <Anchor corner="bl" scale={scale}>
      <DialBar
        clock={clock}
        level={level}
        exp={exp}
        money={money}
        slots={slots}
        selected={selected}
        onSelect={onSelect}
        onLogo={onLogo}
        onItem={onItem}
        width={width}
      />
    </Anchor>
  );
}

/* ───────── HIT counter ───────── */

export function HitCounter({
  hits,
  id,
  scale,
  top = 90,
}: {
  hits: number;
  id: number;
  scale: number;
  top?: number;
}) {
  return (
    <Anchor corner="tr" scale={scale}>
      <AnimatePresence>
        {hits >= 2 && (
          <motion.div
            key={id}
            className="relative mr-[40px] flex items-start"
            style={{ marginTop: top }}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ type: "spring", stiffness: 600, damping: 20 }}
          >
            <HitBadge />
            <motion.div
              key={hits}
              className="-ml-[10px]"
              initial={{ scale: 1.5, y: -6 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 700, damping: 18 }}
            >
              <ComboNumber value={hits} size={42} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Anchor>
  );
}

/* ───────── GO!! ───────── */

export function GoArrow({ show, scale }: { show: boolean; scale: number }) {
  return (
    <div
      className="pointer-events-none absolute top-1/2 right-0"
      style={{ transform: `translateY(-50%) scale(${scale})`, transformOrigin: "right center" }}
    >
      <AnimatePresence>
        {show && (
          <motion.div
            key="go"
            className="mr-[20px]"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: [0, 1, 1, 0], x: [-40, 0, 12, 12] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, repeatDelay: 0.2 }}
          >
            <GoArrowArt />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────── chapter card ───────── */

/** show_titlepic "stageN" "<area>" → 第N話 / area name. */
export function ChapterCard({
  title,
  scale,
}: {
  title: { top: string; bottom: string } | null;
  scale: number;
}) {
  const n = Number(title?.top.match(/\d+/)?.[0] ?? 0);
  return (
    <AnimatePresence>
      {title && (
        <motion.div
          key="card"
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1 } }}
        >
          <div style={{ transform: `scale(${scale})` }}>
            <ChapterCardArt stage={n} area={title.bottom} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────── 小地圖 ───────── */

/**
 * The newer client's map (game/minimap.ts): room outlines, doors green, you white, everyone
 * else in the room blue — just left of the chara block, above the bottom strip.
 */
export function MiniMap({
  story,
  bg,
  me,
  others = [],
  scale,
  right = 124,
}: {
  story: StoryData;
  /** the room you are in */
  bg: number;
  /** your x in that room's own coordinates */
  me: number | null;
  /** the other fighters' x in the same room */
  others?: number[];
  scale: number;
  /** room left for what sits in the corner (the chara block) */
  right?: number;
}) {
  const boxes = layoutMap(story, bg);
  if (!boxes.length) return null;
  const width = Math.max(...boxes.map((b) => b.x + b.w));
  const height = Math.max(...boxes.map((b) => b.y)) + BOX_H;
  const here = boxes.find((b) => b.bg === bg);
  const roomW = Number(story.rooms[String(bg)]?.width) || 1;
  const along = (x: number) => Math.min(1, Math.max(0, x / roomW));
  return (
    <Anchor corner="br" scale={scale}>
      <svg
        width={width + 2}
        height={height + 2}
        viewBox={`-1 -1 ${width + 2} ${height + 2}`}
        className="mb-[58px] overflow-visible"
        style={{ marginRight: right }}
        aria-hidden
      >
        {boxes.map((b) => (
          <g key={b.bg}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={BOX_H}
              fill="none"
              stroke="#e8ecef"
              strokeOpacity={0.85}
              strokeWidth={0.75}
            />
            {b.doors.map((d, i) => (
              <rect
                key={i}
                x={b.x + d * b.w - 1.5}
                y={b.y + BOX_H / 2 - 0.75}
                width={3}
                height={1.5}
                fill="#3ddc5b"
              />
            ))}
          </g>
        ))}
        {here &&
          others.map((x, i) => (
            <rect
              key={i}
              x={here.x + along(x) * here.w - 1.5}
              y={here.y + BOX_H / 2 - 1}
              width={3}
              height={2}
              fill="#7d8cff"
            />
          ))}
        {here && me !== null && (
          <rect
            x={here.x + along(me) * here.w - 2}
            y={here.y + BOX_H / 2 - 1.5}
            width={4}
            height={3}
            fill="#ffffff"
          />
        )}
      </svg>
    </Anchor>
  );
}

/* ───────── top-right key box ───────── */

/** 金 / 藍 / 橙 / 綠 / 紫鑰匙 (itemname.tzw, 「(不可收藏)」 stage-only keys 701 ~ 705) */
export const KEY_NAME: Record<number, string> = {
  701: "金鑰匙",
  702: "藍鑰匙",
  703: "橙鑰匙",
  704: "綠鑰匙",
  705: "紫鑰匙",
};

const keySizes = new Map<number, Promise<[number, number] | null>>();
/** A key sprite's one picture sits at (0, 0) of its page: its size from the sprite's rects. */
function keySize(id: number) {
  let p = keySizes.get(id);
  if (!p) {
    p = fetch(`${ASSETS}/game/sprites/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rects: Record<string, number[]> }>) : null))
      .then((d) => {
        const r = d && Object.values(d.rects)[0];
        return r ? ([r[3], r[4]] as [number, number]) : null;
      })
      .catch(() => null);
    keySizes.set(id, p);
  }
  return p;
}

function KeyIcon({ id }: { id: number }) {
  const [size, setSize] = useState<[number, number] | null>(null);
  useEffect(() => {
    let on = true;
    void keySize(id).then((s) => on && setSize(s));
    return () => {
      on = false;
    };
  }, [id]);
  if (!size) return <span className="size-[24px]" />;
  const [w, h] = size;
  // fit the key into a 30 × 30 cell, at most its own size
  const k = Math.min(1, 30 / Math.max(w, h));
  return (
    <span
      className="relative grid size-[30px] place-items-center"
      title={KEY_NAME[id] ?? undefined}
    >
      <span className="relative overflow-hidden" style={{ width: w * k, height: h * k }}>
        <img
          src={`${ASSETS}/game/sprites/${id}-0.png`}
          alt={KEY_NAME[id] ?? ""}
          draggable={false}
          className="absolute top-0 left-0 max-w-none"
          style={{ height: h * k, width: "auto", imageRendering: "auto" }}
        />
      </span>
    </span>
  );
}

/**
 * 鑰匙: the keys held, in the client's key box (keybox over keyboxback, 184 × 85) at the top
 * right, the status box's mirror; shown only while there is a key.
 */
export function KeyBox({ keys, scale }: { keys: number[]; scale: number }) {
  return (
    <Anchor corner="tr" scale={scale}>
      <AnimatePresence>
        {keys.length > 0 && (
          <motion.div
            className="relative m-[6px] h-[85px] w-[184px]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <Ui
              name="gameinterface/default/keyboxback"
              w={175}
              h={65}
              className="absolute top-[4px] left-[6px] opacity-80"
            />
            <Ui name="gameinterface/default/keybox" w={184} h={85} className="absolute inset-0" />
            <div className="absolute top-[10px] right-[14px] left-[16px] flex flex-wrap gap-[4px]">
              <AnimatePresence>
                {keys.map((k) => (
                  <motion.span
                    key={k}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                  >
                    <KeyIcon id={k} />
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Anchor>
  );
}
