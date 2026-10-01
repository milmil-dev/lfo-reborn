import { useLingui } from "@lingui/react/macro";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";
import { audio } from "@/game/audio";
import { Ui, UiTint, uiUrl } from "@/game/kit/ui";
import { getSlots, newProfile, saveSlot, setActiveSlot } from "@/game/profiles";
import { NAME_MAX, nameProblem } from "@/game/names";
import { BASE } from "@/game/render";
import { Screen } from "@/game/screen";
import { rosterQueries, StartGate, useRoster } from "@/game/ui";
import { usePageTitle } from "@/lib/title";

/*
  選擇角色 — the original create-character screen, laid out from the client itself:
  positions, colours and timings come from LFO.exe's profile screen code, the roster, bar values
  and ring anchors from profile.tzw (exported to game/profile.json by pipeline/profile.ts).

  Two states, like the original: browsing (black column, staggered head list) and naming (grey
  column, name box, O / X). Behind them: a breathing orange field, the full-body art in a
  sliding carousel between the brackets, three rings and two "LV.A" labels orbiting the
  character's scan points, and the six stat bars.
*/

export const Route = createFileRoute("/play/")({
  validateSearch: z.object({
    pick: z.string().optional().catch(undefined),
    // creating a profile in this slot (from the profile screen) instead of entering training
    slot: z.number().int().min(0).optional().catch(undefined),
  }),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(rosterQueries[0]),
      queryClient.ensureQueryData(rosterQueries[1]),
      queryClient.ensureQueryData(profileQuery),
    ]),
  component: SelectScreen,
});

type ProfileEntry = {
  id: number;
  key: string;
  head: string;
  big: string;
  bars: number[];
  points: [number, number][];
};
const profileQuery = queryOptions({
  queryKey: ["game", "profile"],
  queryFn: () => fetch(`${BASE}/profile.json`).then((r) => r.json() as Promise<ProfileEntry[]>),
  staleTime: Number.POSITIVE_INFINITY,
});

const P = "profile";

/** Fetch and decode a ui-hd picture ahead of showing it (each once). */
const preloaded = new Set<string>();
function preloadArt(name: string) {
  if (preloaded.has(name)) return;
  preloaded.add(name);
  const img = new Image();
  img.src = uiUrl(name);
  void img.decode().catch(() => preloaded.delete(name));
}

// ── values read from LFO.exe ──
const BAR = {
  // label art position, bar_outline position, tick colour (ARGB in the client)
  top: [
    { label: "hp", lx: 90, bx: 128, color: "#ff0000" },
    { label: "mp", lx: 248, bx: 287, color: "#0000ff" },
    { label: "sp", lx: 415, bx: 450, color: "#ff8400" },
  ],
  bottom: [
    { label: "str", lx: 76, bx: 128, color: "#d762ff" },
    { label: "vit", lx: 246, bx: 287, color: "#f5ff20" },
    { label: "dex", lx: 406, bx: 450, color: "#01debb" },
  ],
};
const TICKS = 16;
const COL = { x: 625, w: 159 }; // the right column's fill
// the column's two edges (the client's middle line, between the head columns, ran over the heads)
const LINES = [617, 784];
const ROW_H = 92;
const slot = (i: number, scroll: number) =>
  ((i % 2) + 2) % 2 === 0
    ? { x: 625, y: Math.floor(i / 2) * ROW_H - 86 + scroll }
    : { x: 709, y: Math.floor(i / 2) * ROW_H - 51 + scroll };
/** Heads fade out over the top 86 / 46 px and the bottom of the column, as in the client. */
function headAlpha(i: number, y: number) {
  const [top, bottom] = ((i % 2) + 2) % 2 === 0 ? [86, 518] : [46, 560];
  if (y < 0) return Math.max(0, 1 + y / top);
  if (y > bottom) return Math.max(0, 1 - (y - bottom) / top);
  return 1;
}

/**
 * The name box's default, as the client fills it whenever the selection changes (LFO.exe
 * 0x4d11e5): the character's name and rand() % 10000, sprintf'd with "%s%d".
 */
function defaultName(name: string) {
  const n = String(Math.floor(Math.random() * 10000));
  // kept within the naming rules: letters and digits only, NAME_MAX at most
  return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, NAME_MAX - n.length) + n;
}

/**
 * Milliseconds since mount, re-rendering every animation frame. Only the small animated layers
 * below use it, so the screen itself re-renders on input alone.
 */
function useClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setT(now - t0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

/** The client's per-frame easing, (1 - k)·old + k·target with k = dt / 100 · 0.8. */
function useEase(clock: number) {
  "use no memo"; // eased through refs every frame
  const last = useRef(clock);
  const dt = Math.min(50, Math.max(0, clock - last.current));
  last.current = clock;
  return Math.min(1, (dt / 100) * 0.8);
}

/** Breathing orange field and the right column's fill. */
function Backdrop({ naming }: { naming: boolean }) {
  const clock = useClock();
  // G swings 140 → 99 with |sin|, period 1.44 s
  const s = Math.abs(Math.sin((clock / 1440) * Math.PI));
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: `rgb(234 ${Math.round(140 * (1 - s) + 99 * s)} 0)` }}
      />
      <div
        className="absolute top-0 h-[600px]"
        style={{ left: COL.x, width: COL.w, background: naming ? "#837e84" : "#000" }}
      />
    </>
  );
}

const wrap = (v: number, min: number, span: number) => ((((v - min) % span) + span) % span) + min;

/**
 * The LFO watermark: a staggered 4 × 4 grid drifting down-left at 0.1 px/ms, wrapping every
 * 5 tiles, drawn over the column but under the heads. The client asks for
 * profile/lfo_watermark2, which the shipped pak lacks; profile/lfo is the same faint mark.
 */
function Watermark() {
  const clock = useClock();
  const [W, H] = [258, 175];
  return (
    <>
      {Array.from({ length: 16 }, (_, n) => {
        const i = Math.floor(n / 4);
        const j = n % 4;
        const x = W * (i % 2 === 0 ? 0.25 : 0.75) + 1.25 * W * j - clock / 10;
        const y = 0.25 * H + 1.25 * H * i + clock / 10;
        return (
          <Ui
            key={n}
            name={`${P}/lfo`}
            w={W}
            h={H}
            className="absolute"
            style={{ left: wrap(x, -W, 5 * W), top: wrap(y, 600 - 5 * H, 5 * H) }}
          />
        );
      })}
    </>
  );
}

const mod = (v: number, n: number) => ((v % n) + n) % n;

/**
 * The staggered head list, scrolling (eased) to keep the selection in view. It wraps around: the
 * list is laid out on an endless strip of virtual slots, slot v showing list[v mod n], and the
 * selection moves along the strip by the shortest step, so ▲ / ▼ never hit an end.
 */
function HeadColumn({
  list,
  index,
  onPick,
}: {
  list: ProfileEntry[];
  index: number;
  onPick: (i: number) => void;
}) {
  "use no memo"; // eased through refs every frame
  const k = useEase(useClock());
  const n = list.length;
  // the selection's virtual slot, following `index` by the shortest way round
  const virt = useRef(index);
  const step = mod(index - virt.current, n);
  if (step) virt.current += step > n / 2 ? step - n : step;
  const v0 = virt.current;
  const target = 300 - (Math.floor(v0 / 2) * ROW_H + 46);
  const scroll = useRef(target);
  scroll.current += (target - scroll.current) * k;
  const sel = slot(v0, scroll.current);
  // the virtual slots near the view (about seven rows show)
  const first = (Math.floor(v0 / 2) - 7) * 2;
  const slots = Array.from({ length: 30 }, (_, j) => first + j).flatMap((v) => {
    const { x, y } = slot(v, scroll.current);
    const alpha = headAlpha(v, y);
    return alpha > 0 ? [{ v, i: mod(v, n), x, y, alpha }] : [];
  });
  return (
    <>
      {/* grey cards behind the heads (63 × 80, inset 7 px) */}
      {slots.map(({ v, x, y, alpha }) => (
        <div
          key={v}
          className="absolute h-[80px] w-[63px] bg-[#837e84]"
          style={{ left: x + 7, top: y + 7, opacity: alpha }}
        />
      ))}
      <Watermark />
      {slots.map(({ v, i, x, y, alpha }) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(i)}
          className="absolute h-[93px] w-[77px]"
          style={{ left: x, top: y, opacity: alpha }}
          aria-label={list[i].key}
        >
          <Ui name={`${P}/${list[i].head}`} w={77} h={93} />
        </button>
      ))}
      <Ui
        name={`${P}/select`}
        w={85}
        h={101}
        className="absolute"
        style={{ left: sel.x - 4, top: sel.y - 4, opacity: headAlpha(v0, sel.y) }}
      />
    </>
  );
}

/** A piece cycling through numbered frames (arrow1–3, threearrow2–4). */
function Cycle({
  name,
  from,
  count,
  ms,
  offset = 0,
  ...rest
}: {
  name: string;
  from: number;
  count: number;
  ms: number;
  offset?: number;
} & Omit<Parameters<typeof Ui>[0], "name">) {
  const clock = useClock();
  return <Ui name={`${name}${from + ((Math.floor(clock / ms) + offset) % count)}`} {...rest} />;
}

/** The character's scan points, eased towards the selected character's. */
function useScanPoints(points: [number, number][], clock: number) {
  "use no memo"; // eased through refs every frame
  const k = useEase(clock);
  const eased = useRef(points.map((p) => [...p] as [number, number]));
  eased.current = eased.current.map(([x, y], i) => [
    x + (points[i][0] - x) * k,
    y + (points[i][1] - y) * k,
  ]);
  return eased.current;
}

/** Three rings orbiting the scan points: +0.5°/ms, radius = ring width / 5 (or / 6, reversed). */
function Rings({ points }: { points: [number, number][] }) {
  "use no memo"; // eased through refs every frame
  const clock = useClock();
  const [c1, c2, t1] = useScanPoints(points, clock);
  const a = (clock / 2) * (Math.PI / 180);
  const ring = (n: number, [x, y]: [number, number], size: number, div: number, sign = 1) => (
    <Ui
      name={`${P}/moving_circle${n}`}
      w={size}
      h={size}
      className="absolute"
      style={{
        left: x + Math.cos(sign * a) * (size / div) - size / 2,
        top: y + Math.sin(sign * a) * (size / div) - size / 2,
      }}
    />
  );
  return (
    <>
      {ring(1, c1, 95, 5)}
      {ring(2, c2, 62, 6, -1)}
      {ring(3, [(c1[0] + t1[0]) / 2, (c1[1] + t1[1]) / 2], 57, 5)}
    </>
  );
}

/** The two "LV.A" scan labels pinned to the last two scan points. */
function ScanLabels({ points }: { points: [number, number][] }) {
  "use no memo"; // eased through refs every frame
  const [, , t1, t2] = useScanPoints(points, useClock());
  return (
    <>
      <Ui
        name={`${P}/moving_text1`}
        w={168}
        h={147}
        className="absolute"
        style={{ left: t1[0] - 74, top: t1[1] - 72 }}
      />
      <Ui
        name={`${P}/moving_text2`}
        w={165}
        h={98}
        className="absolute"
        style={{ left: t2[0] - 48, top: t2[1] - 48 }}
      />
    </>
  );
}

function SelectScreen() {
  const { t } = useLingui();
  usePageTitle(t`選擇角色`);
  const navigate = useNavigate();
  const { pick, slot: profileSlot } = Route.useSearch();
  const { data: profile } = useSuspenseQuery(profileQuery);
  const roster = useRoster();
  // the original's roster, limited to characters the game can play
  const list = profile.filter((p) => roster.some((r) => r.key === p.key));
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      list.findIndex((p) => p.key === (pick ?? "stinky")),
    ),
  );
  const [dir, setDir] = useState(1);
  const [state, setState] = useState<"browse" | "name">("browse");
  const [focus, setFocus] = useState<"yes" | "no">("yes");
  const nameOf = (key: string) => roster.find((r) => r.key === key)?.name ?? key;
  const [name, setName] = useState(() => defaultName(nameOf(list[index].key)));
  const [nameError, setNameError] = useState<string | null>(null);
  const current = list[index];

  // the stand art is a large 4× picture: decode the neighbours ahead so a switch never waits on
  // a decode mid-slide, and the whole roster once the screen is idle
  useEffect(() => {
    for (const d of [1, -1, 2, -2]) {
      const p = list[(index + d + list.length) % list.length];
      if (p) preloadArt(`${P}/${p.big}`);
    }
  }, [index, list]);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
    const id = idle(() => {
      for (const p of list) preloadArt(`${P}/${p.big}`);
    });
    return () => (window.cancelIdleCallback ?? clearTimeout)(id as number);
  }, [list]);
  const entry = roster.find((r) => r.key === current.key)!;

  const select = (i: number) => {
    const next = (i + list.length) % list.length;
    if (next === index) return;
    audio.sfx("johnnymove.wav", { volume: 0.7 });
    // the shortest way round, so wrapping past the end still slides forward
    setDir(mod(next - index, list.length) <= list.length / 2 ? 1 : -1);
    setIndex(next);
    setName(defaultName(nameOf(list[next].key)));
    setNameError(null);
  };
  const toName = () => {
    audio.sfx("johnnychoose.wav");
    setFocus("yes");
    setState("name");
  };
  const confirm = () => {
    if (profileSlot !== undefined) {
      // the client's naming rules: not empty, no symbols, not a name another character has
      const why = nameProblem(
        name,
        getSlots().map((p, i) => (i === profileSlot ? null : p?.name)),
      );
      if (why) {
        setNameError(why);
        return audio.sfx("johnnymove.wav", { volume: 0.4 });
      }
    }
    audio.sfx("johnnyallright.wav");
    if (profileSlot !== undefined) {
      saveSlot(profileSlot, newProfile(entry.key, entry.id, name.trim() || entry.name));
      setActiveSlot(profileSlot);
      // as the client does (LFO.exe 0x4d1378 → scene 11): back to the profile slots, the new
      // character now in its slot, entered from there with 進入
      void navigate({ to: "/play/profile" });
    } else void navigate({ to: "/play/$key", params: { key: entry.key } });
  };
  const back = () => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    if (state === "name") setState("browse");
    else void navigate({ to: profileSlot !== undefined ? "/play/profile" : "/" });
  };

  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (state === "browse") {
      if (ev.key === "ArrowDown" || ev.key === "ArrowRight") select(index + 1);
      else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") select(index - 1);
      else if (ev.key === "Enter" || ev.code === "KeyJ") toName();
      else if (ev.key === "Escape") back();
      else return;
    } else {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        if (ev.target instanceof HTMLInputElement && ev.target.value) return;
        setFocus((f) => (f === "yes" ? "no" : "yes"));
      } else if (ev.key === "Enter") (focus === "yes" ? confirm : back)();
      else if (ev.key === "Escape") back();
      else return;
    }
    ev.preventDefault();
  });
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => onKey(ev);
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, []);

  const onStart = useCallback(() => audio.music("lfo_character.ogg", 0.35), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={onStart} />
      <Screen>
        <Backdrop naming={state === "name"} />

        {/* right column */}
        {state === "browse" ? (
          <>
            <HeadColumn
              list={list}
              index={index}
              onPick={(i) => (i === index ? toName() : select(i))}
            />
            <button
              type="button"
              onClick={() => select(index - 2)}
              className="group absolute top-[6px] left-[732px] h-[31px] w-[32px]"
              aria-label="up"
            >
              <Ui name={`${P}/arrow_button`} w={32} h={31} className="group-hover:hidden" />
              <Ui
                name={`${P}/arrow_button_over`}
                w={32}
                h={31}
                className="hidden group-hover:block"
              />
            </button>
            <button
              type="button"
              onClick={() => select(index + 2)}
              className="group absolute top-[560px] left-[647px] h-[31px] w-[32px] rotate-180"
              aria-label="down"
            >
              <Ui name={`${P}/arrow_button`} w={32} h={31} className="group-hover:hidden" />
              <Ui
                name={`${P}/arrow_button_over`}
                w={32}
                h={31}
                className="hidden group-hover:block"
              />
            </button>
          </>
        ) : (
          <>
            {[0, 1, 2].map((i) => (
              <Cycle
                key={`d${i}`}
                name={`${P}/threearrow`}
                from={2}
                count={3}
                ms={220}
                offset={i}
                w={126}
                h={36}
                className="absolute rotate-180"
                style={{ left: 643, top: 205 - i * 42 }}
              />
            ))}
            <Watermark />
            <div className="absolute top-[250px] left-[633px] h-[110px] w-[143px]">
              <Ui name={`${P}/namebox`} w={143} h={110} className="absolute inset-0" />
              <input
                // focused with the default name selected, so typing replaces it
                ref={(el) => el?.select()}
                value={name}
                onChange={(ev) => {
                  setName(ev.target.value.slice(0, NAME_MAX));
                  setNameError(null);
                }}
                placeholder={entry.name}
                aria-label={t`你的名字`}
                spellCheck={false}
                // drawn as the client draws it (LFO.exe 0x4d10ad): white, left-aligned from (650, 292)
                className="absolute top-[41px] left-[17px] h-[16px] w-[116px] bg-transparent p-0 font-bold text-[13px] text-white leading-[16px] caret-white outline-none [text-shadow:0_1px_1px_#000] selection:bg-white/30 placeholder:text-white/50"
              />
              {nameError && (
                <p className="absolute top-[112px] left-1/2 w-[160px] -translate-x-1/2 rounded-[4px] bg-black/80 px-1.5 py-0.5 text-center font-bold text-[#ffb0b0] text-[11px]">
                  {nameError}
                </p>
              )}
            </div>
            <Ui
              name={`${P}/buttonlight`}
              w={74}
              h={82}
              className="absolute animate-pulse"
              style={{ left: focus === "yes" ? 633 : 704, top: 369 }}
            />
            <button
              type="button"
              onMouseEnter={() => setFocus("yes")}
              onClick={confirm}
              className="absolute top-[373px] left-[637px] h-[75px] w-[67px]"
              aria-label={t`確定`}
            >
              <Ui
                name={`${P}/${name.trim() || profileSlot === undefined ? "button_yes" : "button_yes_gray"}`}
                w={67}
                h={75}
              />
            </button>
            <button
              type="button"
              onMouseEnter={() => setFocus("no")}
              onClick={back}
              className="absolute top-[373px] left-[708px] h-[75px] w-[67px]"
              aria-label={t`返回`}
            >
              <Ui name={`${P}/button_no`} w={67} h={75} />
            </button>
            {[0, 1, 2].map((i) => (
              <Cycle
                key={`u${i}`}
                name={`${P}/threearrow`}
                from={2}
                count={3}
                ms={220}
                offset={i}
                w={126}
                h={36}
                className="absolute"
                style={{ left: 643, top: 459 + i * 42 }}
              />
            ))}
          </>
        )}
        {LINES.map((x) => (
          <Ui
            key={x}
            name={`${P}/line`}
            w={8}
            h={599}
            className="absolute top-[1px]"
            style={{ left: x }}
          />
        ))}

        {/* the character, between the brackets, sliding like a carousel */}
        <Ui name={`${P}/bracket`} w={117} h={352} className="absolute top-[165px] left-[38px]" />
        <Ui
          name={`${P}/bracket`}
          w={117}
          h={352}
          className="absolute top-[165px] left-[429px] rotate-180"
        />
        <Cycle
          name={`${P}/arrow`}
          from={1}
          count={3}
          ms={150}
          w={42}
          h={51}
          className="absolute top-[405px] left-[480px]"
        />
        <Ui
          name={`${P}/playerselect`}
          w={135}
          h={34}
          className="absolute top-[17px] left-[480px]"
        />
        <Ui name={`${P}/palette1`} w={126} h={92} className="absolute top-[35px] left-0" />

        <Rings points={current.points} />

        {/* a short crossfade-slide: the outgoing art leaves in 140 ms (a quick run through the
            roster never stacks half-faded characters), the incoming one eases in over 260 ms;
            only transform / opacity animate, on art decoded ahead (preloadArt) */}
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={current.key}
            custom={dir}
            className="pointer-events-none absolute top-[340px] left-[292px]"
            variants={{
              enter: (d: number) => ({ x: d * 70, opacity: 0, scale: 0.98 }),
              center: {
                x: 0,
                opacity: 1,
                scale: 1,
                transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
              },
              exit: (d: number) => ({
                x: -d * 50,
                opacity: 0,
                transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            style={{ willChange: "transform, opacity" }}
          >
            {/* centred here, so the animated element moves on x / scale alone */}
            <div className="-translate-x-1/2 -translate-y-1/2">
              <Ui name={`${P}/${current.big}`} className="max-h-[420px] w-auto" alt={current.key} />
            </div>
          </motion.div>
        </AnimatePresence>

        <Ui name={`${P}/fix`} w={579} h={541} className="absolute top-[43px] left-[25px]" />
        <ScanLabels points={current.points} />

        {/* stat bars: bar values from profile.tzw, ticks and colours from the client */}
        {(["top", "bottom"] as const).map((rowKey, r) =>
          BAR[rowKey].map((b, j) => {
            const value = current.bars[r * 3 + j] ?? 0;
            const lit = Math.round((value / 100) * TICKS);
            const top = rowKey === "top" ? 103 : 549;
            return (
              <div key={b.label}>
                {/* the ticks, clipped to the outline's opening (5 px frame, 4.5 px top and bottom) */}
                <div
                  className="absolute h-[15px] w-[98px] overflow-hidden rounded-full"
                  style={{ left: b.bx + 5, top: top + 4.5 }}
                >
                  {Array.from({ length: TICKS }, (_, i) => (
                    <UiTint
                      key={i}
                      name={`${P}/power_bar`}
                      color={i < lit ? b.color : "rgb(255 255 255 / 0.5)"}
                      className="absolute top-[-2.5px] h-[20px] w-[5px]"
                      style={{ left: i * 6 }}
                    />
                  ))}
                </div>
                <Ui
                  name={`${P}/${b.label}`}
                  className="absolute"
                  style={{ left: b.lx, top: rowKey === "top" ? 106 : 552 }}
                  alt={b.label}
                />
                <Ui
                  name={`${P}/bar_outline`}
                  w={108}
                  h={24}
                  className="absolute"
                  style={{ left: b.bx, top }}
                />
              </div>
            );
          }),
        )}

        {/* the name in the client's alphabet */}
        <AnimatePresence initial={false}>
          <motion.div
            key={current.key}
            className="absolute top-[45px] left-[128px] flex items-end gap-[1px]"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
          >
            {current.key.split("").map((ch, i) => (
              <Ui
                key={`${i}-${ch}`}
                name={/[a-z]/.test(ch) ? `${P}/alphabet${ch}` : `${P}/alphabet_`}
                alt={ch}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </Screen>
    </div>
  );
}
