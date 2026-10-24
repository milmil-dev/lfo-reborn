import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Fragment, type ReactNode, useEffect, useEffectEvent, useState } from "react";
import type { CharData, Move } from "@/game/core/types";
import { expToNext, freePoints, statsAt, statTable, withFusionBonus } from "@/game/leveling";
import { RANKS, rankOf } from "@/game/vs";
import {
  allocatePoint,
  fusionOf,
  hasToken,
  playId,
  playKey,
  type Profile,
  useActiveProfile,
  useSkillExp,
} from "@/game/profiles";
import { audio } from "@/game/audio";
import { formId, unlocked } from "@/game/transform";
import { spriteIndex } from "@/game/ui";
import { Screen } from "@/game/screen";
import { q } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { SkillTable } from "./skill-table";
import { Ui } from "./ui";

/*
  The chara block's panels, shared by the lobby and the stages: 角色資料 (the data card), 出招表
  (the skill table), and the smiley box with the smiley shown over the player.
*/

export const SMILEYS = Array.from({ length: 20 }, (_, i) => {
  const id = String(i + 1).padStart(2, "0");
  return { id, frames: id === "02" || id === "18" ? 2 : id === "06" ? 3 : 4 };
});
export type SmileyDef = (typeof SMILEYS)[number];

export function Popup({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  // Esc closes the window (the tab that opened it toggles it too)
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);
  return (
    <Screen key="popup" className="z-30">
      {/* a window over the game, not a dimmed screen: the HUD around it stays usable */}
      <motion.div
        className="pointer-events-none absolute inset-0 grid place-items-center pb-[120px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="pointer-events-auto"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </Screen>
  );
}

/*
  角色資料 on the client's chara table (gameinterface/default/chartable, 413 × 392): the window,
  the photo frame and the AP box stay the client's art; the labels and values are laid out as
  elements (the label sheet chartabletext had them printed, which kept the values from lining
  up) — LV / EXP / MONEY, the six stats with their 能力點 arrows, HONOR, then the five elements
  and seven weapons in the red box.
*/
type StatKey = keyof NonNullable<Profile["points"]>;
const label = "font-lfo text-white/80 leading-none";
const num = "font-lfo tabular-nums text-white leading-none";
const ELEMENTS = ["FIRE", "ICE", "WIND", "POISON", "THUNDER"] as const;
const WEAPONS: [string, string][][] = [
  [
    ["SWORD", "sword"],
    ["SPEAR", "spear"],
    ["THROW", "throw"],
    ["HEAVY", "heavy"],
  ],
  [
    ["BOW", "bow"],
    ["WHIP", "whip"],
    ["WAND", "wand"],
  ],
];

/** A label and its value on one line, the value pushed to the right. */
function Pair({ k, v, className }: { k: string; v: ReactNode; className?: string }) {
  return (
    <div className={`flex h-[18px] items-center justify-between ${className ?? ""}`}>
      <span className={`${label} text-[11px] tracking-[0.04em]`}>{k}</span>
      <span className={`${num} text-[13px]`}>{v}</span>
    </div>
  );
}

/** 角色資料: the active profile's data, as the save is now. */
export function CharaCard({ onClose }: { onClose?: () => void }) {
  const { t } = useLingui();
  const profile = useActiveProfile();
  const { data } = useQuery({ ...q.character(profile?.charId ?? 0), enabled: !!profile });
  if (!profile) return null;
  // a 合體戰神 shows its own character's stats plus the fusion's (he-ti.mdx 9)
  const st = data
    ? withFusionBonus(statsAt(statTable(data), profile.lv, profile.points), !!fusionOf(profile))
    : undefined;
  const free = freePoints(profile.lv, profile.points);
  const ws = (data?.weapon_skill ?? {}) as Record<string, number>;
  const rank = rankOf(profile.honor ?? 0);
  // a stat with its up-arrow (shown while there are 能力點 to spend)
  const stat = (k: string, v: number | undefined, key: StatKey) => (
    <Fragment key={key}>
      <span className={`${label} text-[12px]`}>{k}</span>
      <span className={`${num} text-right text-[14px]`}>{v ?? ""}</span>
      {free > 0 ? (
        <button
          type="button"
          aria-label={`${k} +1`}
          title={`${k} +1`}
          onClick={() => {
            if (allocatePoint(key)) audio.sfx("johnnymove.wav", { volume: 0.5 });
          }}
          className="size-[15px] justify-self-center hover:brightness-125 active:translate-y-px"
        >
          <Ui name="gameinterface/default/uparrowbutton" w={15} h={15} />
        </button>
      ) : (
        <span />
      )}
    </Fragment>
  );
  return (
    <div className="relative h-[392px] w-[413px] select-none">
      <Ui name="gameinterface/default/chartable" w={413} h={392} className="absolute inset-0" />

      {/* the photo in its frame, the name under it */}
      <Ui
        name="gameinterface/default/chartablephotoframe"
        w={128}
        h={159}
        className="absolute top-[9px] left-[28px]"
      />
      <img
        src={`${ASSETS}/ui-hd/gameinterface/default/chartablephoto${playId(profile)}.webp`}
        srcSet={`${ASSETS}/ui-hd/gameinterface/default/chartablephoto${playId(profile)}.webp 4x`}
        alt=""
        className="absolute top-[14px] left-[33px] h-[148px] w-[118px] max-w-none"
        draggable={false}
      />
      <p className="absolute top-[176px] left-[28px] w-[128px] truncate text-center font-bold text-[13px] text-white leading-none [text-shadow:0_1px_1px_#000]">
        {profile.name}
      </p>

      {/* LV, EXP, MONEY — left of the AP box */}
      <div className="absolute top-[22px] left-[172px] w-[164px]">
        <div className="flex h-[26px] items-baseline gap-[10px]">
          <span className={`${label} text-[15px] italic`}>LV</span>
          <span className={`${num} text-[24px]`}>{profile.lv}</span>
        </div>
        <Pair k="EXP" v={`${profile.exp} / ${expToNext(profile.lv)}`} className="mt-[6px]" />
        <Pair k="MONEY" v={(profile.money ?? 0).toLocaleString()} className="mt-[4px]" />
      </div>

      {/* the AP box (the red slot top-right) with the 能力點 left to spend */}
      <Ui
        name="gameinterface/default/chartableapbox"
        w={42}
        h={42}
        className="absolute top-[26px] left-[349px]"
      />
      <p className="absolute top-[47px] left-[370px] -translate-x-1/2 -translate-y-1/2 font-bold font-lfo text-[16px] text-[#1d2a44] tabular-nums">
        {free}
      </p>
      <p className="absolute top-[72px] left-[370px] -translate-x-1/2 whitespace-nowrap font-bold text-[10px] text-white/75">
        {t`能力點`}
      </p>

      {/* the six stats: two columns, each value beside its label, its arrow after it */}
      <div className="absolute top-[100px] left-[172px] grid w-[222px] grid-cols-[30px_42px_22px_34px_40px_22px] items-center gap-y-[8px]">
        {stat("HP", st?.hp, "hp")}
        {stat("STR", st?.str, "str")}
        {stat("MP", st?.mp, "mp")}
        {stat("DEF", st?.def, "def")}
        {stat("SP", st?.sp, "sp")}
        {stat("AGI", st?.agi, "agi")}
      </div>

      {/* HONOR and the 勳銜 it has reached */}
      <div className="absolute top-[178px] left-[172px] flex w-[222px] items-center gap-[8px]">
        <span className={`${label} text-[12px]`}>HONOR</span>
        <span className={`${num} text-[14px]`}>{profile.honor ?? 0}</span>
        <span className="ml-[6px] flex items-center">
          <Ui name={`medal/medal0${rank + 1}`} w={34} h={34} className="-my-[10px] -mx-[8px]" />
          <span className="ml-[6px] font-bold text-[#ffe08a] text-[12px]">{RANKS[rank]}</span>
        </span>
      </div>

      {/* the red box: ELEMENT, then WEAPON in two columns */}
      <div className="absolute top-[222px] left-[36px] grid w-[344px] grid-cols-[112px_1fr_1fr] gap-x-[18px]">
        <div>
          <p className="mb-[8px] font-bold font-lfo text-[15px] text-white italic leading-none">
            ELEMENT
          </p>
          {/* resistance from equipment: none worn into the card yet */}
          {ELEMENTS.map((k) => (
            <Pair key={k} k={k} v={0} className="mb-[6px]" />
          ))}
        </div>
        {WEAPONS.map((col, c) => (
          <div key={c}>
            <p className="mb-[8px] h-[15px] font-bold font-lfo text-[15px] text-white italic leading-none">
              {c === 0 ? "WEAPON" : ""}
            </p>
            {col.map(([k, key]) => (
              <Pair key={key} k={k} v={ws[key] ?? ""} className="mb-[6px]" />
            ))}
          </div>
        ))}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="absolute top-[6px] left-[383px] h-[17px] w-[24px] rounded-[2px] hover:bg-white/20"
        />
      )}
    </div>
  );
}

/** 出招表 on the client's skill table, for the character this profile plays. */
export function SkillList({
  mp,
  onCast,
  onClose,
  form = false,
}: {
  /** the fighter's MP right now (the table's glow); the character's base MP without it */
  mp?: number;
  onCast?: (move: Move) => void;
  onClose: () => void;
  /** 異轉: show the transformed form's own table, as the character is in it right now */
  form?: boolean;
}) {
  const { t } = useLingui();
  const profile = useActiveProfile();
  const exp = useSkillExp();
  // the moves of whoever the profile plays as: its 合體戰神 while that lasts
  const key = profile ? playKey(profile) : undefined;
  const id = profile ? playId(profile) : 0;
  // 異轉: the transformed form (base id + 7000) has its own character data and its own rows
  const tranId = formId(id);
  const { data: detail } = useQuery({ ...q.character(id), enabled: !!profile });
  const { data: formDetail } = useQuery({
    ...q.character(tranId ?? 0),
    enabled: !!tranId && !!profile,
  });
  // the form's sprite key lives in the sprite index (the API's character row has no key)
  const { data: index } = useQuery(spriteIndex);
  const formKey = index?.find((c) => c.id === tranId)?.key;
  const { data: char } = useQuery({
    queryKey: ["game", "char", key],
    queryFn: () =>
      fetch(`${ASSETS}/game/chars/${key}.json`).then((r) => r.json() as Promise<CharData>),
    enabled: !!profile,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { data: formChar } = useQuery({
    queryKey: ["game", "char", formKey],
    queryFn: () =>
      fetch(`${ASSETS}/game/chars/${formKey}.json`).then((r) => r.json() as Promise<CharData>),
    enabled: !!formKey,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const tranOpen = !!profile && unlocked(profile.lv, hasToken(profile.charId));
  const hasRelic = !!profile && hasToken(profile.charId);
  // transformed: the form's data and rows replace the character's, once its sprite has loaded
  const inForm = form && !!formChar;
  const shown = inForm ? formChar : char;
  if (!shown) return null;
  const rows = inForm ? formDetail : detail;
  const skills = new Map((rows?.skills ?? []).map((s) => [s.slot, s]));
  return (
    <div className="relative">
      <SkillTable
        data={shown}
        skills={skills}
        mp={mp ?? shown.attrs.mp}
        exp={exp}
        onCast={onCast}
        onClose={onClose}
      />
      {/* the form's table replaces the character's while transformed; otherwise say how to reach it */}
      {formDetail && (
        <p className="absolute top-[136px] left-[220px] w-[100px] text-[9px] text-white/75 leading-[12px]">
          {inForm
            ? t`異轉形態「${formDetail.name}」的招式；再按 Y 變回`
            : tranOpen
              ? t`另有異轉形態「${formDetail.name}」的 ${formDetail.skills.length} 招，按 Y 變身後使出`
              : hasRelic
                ? t`另有異轉形態「${formDetail.name}」的 ${formDetail.skills.length} 招，達到 LV150 後變身使出`
                : t`另有異轉形態「${formDetail.name}」的 ${formDetail.skills.length} 招，需異轉信物及 LV150`}
        </p>
      )}
    </div>
  );
}

export function SmileyBox({ onPick }: { onPick: (s: SmileyDef) => void }) {
  return (
    <div className="relative h-[224px] w-[384px]">
      <Ui name="smiley/smileybox" w={384} h={224} className="absolute inset-0" />
      {/* the art is a 5 × 3 grid of 70 px cells with a scrollbar on the right */}
      <div className="absolute top-[5px] left-[5px] grid h-[210px] w-[350px] auto-rows-[70px] grid-cols-5 overflow-y-auto [scrollbar-width:none]">
        {SMILEYS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className="grid h-[70px] place-items-center hover:bg-white/20"
            aria-label={`smiley ${s.id}`}
          >
            <img
              src={`${ASSETS}/ui-hd/smiley/${s.id}/${s.id}_01.webp`}
              srcSet={`${ASSETS}/ui-hd/smiley/${s.id}/${s.id}_01.webp 4x`}
              alt=""
              className="h-[48px]"
              draggable={false}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/** A smiley playing over the player's head. */
export function Smiley({ s }: { s: SmileyDef }) {
  const [f, setF] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setF((n) => (n % s.frames) + 1), 160);
    return () => clearInterval(id);
  }, [s.frames]);
  return (
    <motion.img
      src={`${ASSETS}/ui-hd/smiley/${s.id}/${s.id}_0${f}.webp`}
      srcSet={`${ASSETS}/ui-hd/smiley/${s.id}/${s.id}_0${f}.webp 4x`}
      alt=""
      className="h-[70px]"
      initial={{ opacity: 0, y: 10, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      draggable={false}
    />
  );
}
