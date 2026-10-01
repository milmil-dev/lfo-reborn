import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AnimatePresence,
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { audio } from "@/game/audio";
import { GlassPanel } from "@/game/kit/frames";
import { Ui } from "@/game/kit/ui";
import { DataPanel, type PanelData, ProfileFrame } from "@/game/hd";
import {
  getActiveSlot,
  freeSlot,
  getSlots,
  newProfile,
  type Profile,
  saveSlot,
  setActiveSlot,
  useOwnedChars,
  useFreeplay,
  setFreeplay,
  useSlots,
  useTokens,
} from "@/game/profiles";
import type { CardChar, Relic } from "@/game/cards";
import { MetalButton } from "@/game/kit/buttons";
import { StorageRoom } from "@/game/kit/storage-room";
import { nameProblem } from "@/game/names";
import { BASE } from "@/game/render";
import { Screen } from "@/game/screen";
import { StartGate } from "@/game/ui";
import { statsAt, statTable } from "@/game/leveling";
import { q } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { usePageTitle } from "@/lib/title";

export const Route = createFileRoute("/play/profile")({ component: ProfileSelect });

/*
  Profile select, as the newer client draws it: a red screen with the account's characters on a
  vertical carousel — as many as the account has, then an empty card for a new one. The chosen
  card enters the lobby, the empty one opens 選擇角色; a character from a 人物卡 is taken out of
  the 儲物室 into the empty card. Panels are the client's profile art (game/hd).
*/

const P = `${ASSETS}/ui-hd/profile`;
// the carousel's middle and the step between slots (measured from the newer client's screen)
// (LFO.exe: the frame at y 194, cards a card height + 24 apart, a move slides for 500 ms)
const CENTER = 297;
const GAP = 200;
const SLIDE = 0.5;
const EASE = [0.22, 1, 0.36, 1] as const;

/** The LFO mark tiled faintly over the red, staggered row by row. */
function Watermark() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden>
      {Array.from({ length: 16 }, (_, n) => {
        const r = Math.floor(n / 4);
        const c = n % 4;
        return (
          <img
            key={n}
            src={`${P}/lfo.webp`}
            alt=""
            draggable={false}
            className="absolute h-[175px] w-[258px] max-w-none"
            style={{ left: c * 258 - (r % 2 ? 129 : 0) - 40, top: r * 160 - 40 }}
          />
        );
      })}
    </div>
  );
}

/** One of the client's 40 × 44 profile buttons. */
function SideButton({
  name,
  label,
  left,
  top,
  onClick,
  disabled,
}: {
  name: string;
  label: string;
  left: number;
  top: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="group absolute h-[44px] w-[40px] transition hover:brightness-110 active:translate-y-px disabled:opacity-40"
      style={{ left, top }}
    >
      <Ui name={name} w={40} h={44} />
    </button>
  );
}

/** A slot's panel, with the character's stats at the profile's level. */
function SlotPanel({ p, bright }: { p: Profile | null; bright: boolean }) {
  const { data } = useQuery({ ...q.character(p?.charId ?? 0), enabled: !!p });
  const st = data && p ? statsAt(statTable(data), p.lv, p.points) : undefined;
  const panel: PanelData | null = p && {
    name: p.name,
    lv: p.lv,
    hp: st?.hp ?? 0,
    mp: st?.mp ?? 0,
    sp: st?.sp ?? 0,
    str: st?.str ?? 0,
    def: st?.def ?? 0,
    agi: st?.agi ?? 0,
    exp: p.exp,
    money: p.money,
    honor: p.honor,
    head: `${P}/${p.key}_head.webp`,
    created: p.created,
  };
  return <DataPanel data={panel} bright={bright} />;
}

const mod = (v: number, n: number) => ((v % n) + n) % n;

// the drum: a card one row off sits at ~170 below the middle, tilted 36°; further rows close up
const RADIUS = 290;
const TURN = 0.63; // radians per row

/** One card on the wheel, placed by how far (in rows, fractional) it is from the middle. */
function WheelCard({
  v,
  wheel,
  onClick,
  label,
  current,
  children,
}: {
  v: number;
  wheel: MotionValue<number>;
  onClick: () => void;
  label: string;
  current: boolean;
  children: React.ReactNode;
}) {
  const d = useTransform(wheel, (w) => v - w);
  const theta = useTransform(d, (x) => Math.max(-2.4, Math.min(2.4, x)) * TURN);
  const y = useTransform(theta, (a) => Math.sin(a) * RADIUS);
  const rotateX = useTransform(theta, (a) => (-a * 180) / Math.PI);
  const scale = useTransform(d, (x) => 1 - 0.07 * Math.min(2.5, Math.abs(x)));
  const opacity = useTransform(d, (x) => Math.max(0, 1 - 0.42 * Math.abs(x) ** 1.15));
  const zIndex = useTransform(d, (x) => 10 - Math.round(Math.abs(x) * 3));
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="absolute left-[97px] h-[176px] w-[605px] origin-center"
      style={{ top: CENTER - 88, y, rotateX, scale, opacity, zIndex }}
      aria-label={label}
      aria-current={current}
    >
      {children}
    </motion.button>
  );
}

function ProfileSelect() {
  const { t } = useLingui();
  usePageTitle(t`人物檔案`);
  const navigate = useNavigate();
  const slots = useSlots();
  // the carousel: every character the account has, then an empty card for a new one
  const rows = [...slots.flatMap((p, i) => (p ? [i] : [])), freeSlot(slots)];
  const [pos, setPos] = useState(() => {
    const all = getSlots();
    const list = [...all.flatMap((p, i) => (p ? [i] : [])), freeSlot(all)];
    return Math.max(0, list.indexOf(getActiveSlot() ?? -1));
  });
  const at = Math.min(pos, rows.length - 1);
  // the wheel: one motion value, in rows, running along an endless strip (card v shows
  // rows[v mod n]); `base` is the row nearest the middle, the cards drawn sit around it
  const wheel = useMotionValue(at);
  const [base, setBase] = useState(at);
  useMotionValueEvent(wheel, "change", (v) => {
    const b = Math.round(v);
    if (b === base) return;
    setBase(b);
    setPos(mod(b, rows.length));
  });
  /** the slot the carousel stops on */
  const sel = rows[at];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [storage, setStorage] = useState(false);
  const cur = slots[sel];
  // a move is under way for SLIDE seconds: the plugs are out
  const [moving, setMoving] = useState(false);
  const firstSel = useRef(true);
  useEffect(() => {
    if (firstSel.current) {
      firstSel.current = false;
      return;
    }
    setMoving(true);
    const id = setTimeout(() => setMoving(false), SLIDE * 1000);
    return () => clearTimeout(id);
  }, [sel]);

  // 儲物室: the characters and 異轉信物 the account holds from cards
  const owned = useOwnedChars();
  const freeplay = useFreeplay();
  const tokens = useTokens();
  const { data: sprites } = useQuery({
    queryKey: ["game", "index"],
    queryFn: () =>
      fetch(`${BASE}/chars/index.json`).then(
        (r) => r.json() as Promise<{ key: string; id: number; name: string }[]>,
      ),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { data: relics } = useQuery({
    queryKey: ["game", "relics"],
    queryFn: () =>
      fetch(`${BASE}/relics.json`).then((r) => (r.ok ? (r.json() as Promise<Relic[]>) : [])),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const ownedChars: CardChar[] = owned
    .map((key) => sprites?.find((c) => c.key === key))
    .filter((c): c is CardChar => !!c);
  const extract = (c: CardChar, name: string) => {
    if (slots[sel]) return { ok: false, text: t`請先選擇一個空的角色欄。` };
    if (slots.some((p) => p?.key === c.key))
      return { ok: false, text: t`「${c.name}」人物已存在，不能重複啟動。` };
    const why = nameProblem(
      name,
      slots.map((p) => p?.name),
    );
    if (why) return { ok: false, text: why };
    saveSlot(sel, newProfile(c.key, c.id, name.trim()));
    audio.sfx("johnnyallright.wav");
    return { ok: true, text: t`「${c.name}」人物啟動成功。` };
  };

  // 新建 only makes sense on an empty slot (it would overwrite a character otherwise)
  const create = useCallback(() => {
    if (slots[sel]) return audio.sfx("guard.wav");
    audio.sfx("johnnyconfirm.wav");
    void navigate({ to: "/play", search: { slot: sel } });
  }, [sel, slots, navigate]);
  const enter = useCallback(() => {
    if (!cur) return create();
    audio.sfx("johnnychoose.wav");
    setActiveSlot(sel);
    void navigate({ to: "/play/lobby" });
  }, [cur, sel, create, navigate]);
  const remove = useCallback(() => {
    saveSlot(sel, null);
    setConfirmDelete(false);
    audio.sfx("guard.wav");
  }, [sel]);
  const back = useCallback(() => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    void navigate({ to: "/play/server" });
  }, [navigate]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (storage) {
      if (e.key === "Escape") setStorage(false);
      return;
    }
    if (confirmDelete) {
      if (e.key === "Enter" || e.code === "KeyJ") remove();
      else if (e.key === "Escape") setConfirmDelete(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      spin(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" || e.code === "KeyJ") enter();
    else if (e.code === "KeyN") create();
    else if ((e.key === "Delete" || e.key === "Backspace") && cur) setConfirmDelete(true);
    else if (e.key === "Escape") back();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  // the client plays the lobby theme here (LFO.exe 0x4d01ba, scene 11); lfo_character is 選擇角色's
  const onStart = useCallback(() => audio.music("lfo_lobby.ogg", 0.35), []);

  // settle the wheel on a row with a spring, like a picker clicking into place
  const settle = (target: number, velocity = 0) => {
    void animate(wheel, target, { type: "spring", stiffness: 300, damping: 32, velocity });
  };
  /** turn by whole cards (buttons, keys, a click on a neighbour) */
  const spin = (d: number) => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    settle(Math.round(wheel.get()) + d);
  };
  // the mouse wheel turns it freely; once it rests, it clicks onto the nearest card
  const wheelRest = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    wheel.stop();
    wheel.set(wheel.get() + e.deltaY / 240);
    clearTimeout(wheelRest.current);
    wheelRest.current = window.setTimeout(() => settle(Math.round(wheel.get())), 120);
  };
  // dragging turns it under the pointer and flings it on release
  const drag = useRef<{ y: number; from: number; t: number; v: number; moved: boolean } | null>(
    null,
  );
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    wheel.stop();
    drag.current = { y: e.clientY, from: wheel.get(), t: performance.now(), v: 0, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const scale = e.currentTarget.getBoundingClientRect().height / 600;
    const dy = (e.clientY - g.y) / scale;
    if (!g.moved && Math.abs(dy) < 6) return;
    if (!g.moved) e.currentTarget.setPointerCapture(e.pointerId);
    g.moved = true;
    const now = performance.now();
    const next = g.from - dy / GAP;
    g.v = ((next - wheel.get()) / Math.max(1, now - g.t)) * 1000;
    g.t = now;
    wheel.set(next);
  };
  const onPointerUp = () => {
    const g = drag.current;
    drag.current = null;
    if (!g?.moved) return;
    // fling: carry on for a moment at the release speed, then click into place
    settle(Math.round(wheel.get() + g.v * 0.18), g.v);
    audio.sfx("johnnymove.wav", { volume: 0.5 });
  };
  /** a click (not the end of a drag) on card v: enter the middle one, turn to the others */
  const pick = (v: number) => {
    if (dragged.current) return;
    if (v === base) enter();
    else spin(v - base);
  };
  const dragged = useRef(false);

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#d81200] text-foreground select-none"
      onWheel={onWheel}
    >
      <StartGate onStart={onStart} />
      <Screen className="overflow-hidden bg-[#d81200]">
        {/* the newer client's screen: red, the LFO mark tiled faintly over it */}
        <Watermark />

        {/*
          the wheel picker: cards on a turning drum, the one in the middle upright and full, the
          others tilting away, shrinking and fading towards the top and bottom; it loops for ever
        */}
        <div
          className="absolute inset-0 touch-none [perspective:1100px]"
          onPointerDown={(e) => {
            dragged.current = false;
            onPointerDown(e);
          }}
          onPointerMove={(e) => {
            onPointerMove(e);
            if (drag.current?.moved) dragged.current = true;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {Array.from({ length: 7 }, (_, j) => base - 3 + j).map((v) => {
            const i = rows[mod(v, rows.length)];
            const p = slots[i] ?? null;
            return (
              <WheelCard
                key={v}
                v={v}
                wheel={wheel}
                onClick={() => pick(v)}
                label={p?.name ?? t`新建角色`}
                current={v === base}
              >
                <SlotPanel p={p} bright={v === base} />
              </WheelCard>
            );
          })}
        </div>

        {/* the chosen card's PROFILE tabs, carrying its number */}
        <div className="pointer-events-none absolute left-[97px]" style={{ top: CENTER - 103 }}>
          <ProfileFrame n={at + 1} />
        </div>

        {/*
          the line through the card to the buttons. As in the client, a move pulls both plugs out
          (unplug, 50 right / 40 left) and they slide back in with the card, then click home;
          an empty slot stays unplugged.
        */}
        {(
          [
            [686, 50, ""],
            [-31, -40, "-scale-x-100"],
          ] as const
        ).map(([left, out, flip]) => (
          <motion.div
            key={left}
            className={cn("pointer-events-none absolute", flip)}
            style={{ left, top: CENTER - 20 }}
            initial={false}
            animate={{ x: moving ? [out * (flip ? -1 : 1), 0] : 0 }}
            transition={{ duration: SLIDE, ease: EASE }}
          >
            <Ui name={cur && !moving ? "profile/plug" : "profile/unplug"} w={144} h={41} />
          </motion.div>
        ))}

        {/* an empty slot asks to be filled: the card itself is the button */}
        <AnimatePresence>
          {!cur && (
            <motion.p
              key="create"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-bold text-[13px] text-white tracking-[0.08em] [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]"
              style={{ top: CENTER + 34 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            >
              {t`點擊或按 Enter 新建角色`}
            </motion.p>
          )}
        </AnimatePresence>

        {/* left: delete; right: up, enter / create, down (profile/bu_up, profileok, bu_down …) */}
        <SideButton
          name="profile/profiledelete"
          label={t`刪除`}
          left={25}
          top={CENTER - 22}
          disabled={!cur}
          onClick={() => setConfirmDelete(true)}
        />
        <SideButton
          name="profile/bu_up"
          label={t`上一個`}
          left={737}
          top={CENTER - 74}
          onClick={() => spin(-1)}
        />
        <SideButton
          name={cur ? "profile/profileok" : "profile/profilecreate"}
          label={cur ? t`進入` : t`新建`}
          left={737}
          top={CENTER - 22}
          onClick={enter}
        />
        <SideButton
          name="profile/bu_down"
          label={t`下一個`}
          left={737}
          top={CENTER + 30}
          onClick={() => spin(1)}
        />

        {/* one bottom row on a shared baseline: storage left, the keys in the middle, back right */}
        <div className="absolute inset-x-[24px] bottom-[16px] flex h-[30px] items-center justify-between">
          <div className="flex gap-2">
            <MetalButton
              onClick={() => setStorage(true)}
              className="h-[30px] w-[128px] text-[13px]"
            >
              {t`儲物室`}
              {owned.length > 0 && (
                <span className="ml-1.5 font-lfo text-[10px] opacity-80">{owned.length}</span>
              )}
            </MetalButton>
            {/* 自由模式: new characters at LV 150, 異轉 without its 信物, every character open */}
            <MetalButton
              onClick={() => {
                setFreeplay(!freeplay);
                audio.sfx("johnnyconfirm.wav", { volume: 0.6 });
              }}
              active={freeplay}
              aria-pressed={freeplay}
              title={t`新角色由 LV 150 開始，不需異轉信物，全部角色開放`}
              className="h-[30px] w-[128px] text-[13px]"
            >
              {freeplay ? t`自由模式 開` : t`自由模式 關`}
            </MetalButton>
          </div>
          <p className="whitespace-nowrap text-[12px] text-white/80 [text-shadow:0_1px_1px_rgb(0_0_0/0.35)]">
            {t`↑↓ 或滾輪選擇　Enter 進入／新建　Delete 刪除　Esc 返回`}
          </p>
          <MetalButton onClick={back} className="h-[30px] w-[128px] text-[13px]">
            {t`返回`}
          </MetalButton>
        </div>

        <AnimatePresence>
          {confirmDelete && cur && (
            <motion.div
              className="absolute inset-0 z-10 grid place-items-center bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <GlassPanel className="flex flex-col items-center gap-4 px-10 py-7 text-center">
                <p className="font-bold text-lg text-white">{t`你要刪除「${cur.name}」嗎？`}</p>
                <p className="text-sm text-white/60">{t`此角色的資料會永久移除。`}</p>
                {/* interface/gamemenu9: 是 over 否 */}
                <div className="relative h-[80px] w-[182px]">
                  <Ui name="interface/gamemenu9" w={182} h={80} />
                  <button
                    type="button"
                    onClick={remove}
                    className="absolute top-0 left-0 h-1/2 w-full rounded-[5px] hover:bg-white/20"
                    aria-label={t`是`}
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="absolute bottom-0 left-0 h-1/2 w-full rounded-[5px] ring-2 ring-[#ffd447]"
                    aria-label={t`否`}
                  />
                </div>
              </GlassPanel>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {storage && (
            <motion.div
              key="storage"
              className="absolute inset-0 z-10 grid place-items-center bg-black/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStorage(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="origin-center scale-[1.5] -translate-y-[40px]"
              >
                <StorageRoom
                  chars={ownedChars}
                  relics={(relics ?? []).filter((r) => tokens.includes(r.id))}
                  onExtract={extract}
                  onClose={() => setStorage(false)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Screen>
    </div>
  );
}
