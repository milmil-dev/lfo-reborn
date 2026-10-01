import { useLingui } from "@lingui/react/macro";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, type MotionValue, motion, useSpring, useTransform } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { audio } from "@/game/audio";
import { IconButton } from "@/game/kit/buttons";
import { NewGameRoom } from "@/game/kit/new-game";
import { InfoPanel, OkCaption, PreviewFrame, StageBar } from "@/game/kit/stage";
import { useActiveProfile } from "@/game/profiles";
import { linesFor } from "@/game/story/lines";
import { BASE } from "@/game/render";
import { Screen } from "@/game/screen";
import type { StoryData } from "@/game/story/types";
import { StartGate } from "@/game/ui";
import { cn } from "@/lib/cn";
import { ASSETS } from "@/lib/assets";
import { usePageTitle } from "@/lib/title";

/*
  STAGE / MISSION select. The entries are the client's own list (LOADSTORYLIST, exported by
  pipeline/catalog.ts): every lead's line of every stage, and every mission, in the original order,
  drawn with the original STAGE / MISSION bars. The list is a wheel that loops (↑ from the first
  entry lands on the last), scrolls with the wheel / arrows / PageUp·PageDown, and filters as you
  type: title, 第n話, area, lead or any words of the opening narration. Whoever enters plays it as
  their own character.
*/

type CatalogEntry = {
  key: string;
  stage: string;
  chapter: number;
  title: string;
  mode: "story" | "mission" | "vs";
  area: string;
  lead: string | null;
  /** charIds whose line plays this file; 0 = anyone the stage gives no line of their own */
  players: number[];
  synopsis: string;
  exported: boolean;
};

/** "第1話 學校" for a story line, the bare title for a mission or VS stage */
export const stageLabel = (e: Pick<CatalogEntry, "chapter" | "title">) =>
  e.chapter > 0 ? `第${e.chapter}話 ${e.title}` : e.title;

export const catalogQuery = queryOptions({
  queryKey: ["story", "catalog"],
  queryFn: () =>
    fetch(`${BASE}/stories/catalog.json`, { cache: "no-cache" }).then((r) =>
      r.ok ? (r.json() as Promise<CatalogEntry[]>) : [],
    ),
  staleTime: Number.POSITIVE_INFINITY,
});
export const charsQuery = queryOptions({
  queryKey: ["game", "chars"],
  queryFn: () =>
    fetch(`${BASE}/chars/index.json`).then(
      (r) => r.json() as Promise<{ key: string; id: number; name: string }[]>,
    ),
  staleTime: Number.POSITIVE_INFINITY,
});
const storyQuery = (key: string) =>
  queryOptions({
    queryKey: ["story", key],
    queryFn: async () => {
      const r = await fetch(`${BASE}/stories/${key}.json`);
      return r.ok ? ((await r.json()) as StoryData) : null;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

const ROW = 55; // bar height 47 + gap
const RADIUS = 3; // rows drawn above / below the chosen one
const LIST_TOP = 214;
const CENTER = LIST_TOP + RADIUS * ROW;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Every search word has to appear somewhere in the entry. */
function matches(e: CatalogEntry, leadName: string, words: string[]) {
  const hay =
    `${e.title} ${e.key} ${e.stage} 第${e.chapter}話 ${e.chapter} ${leadName} ${e.synopsis}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function StageSelect({ mode }: { mode: "story" | "mission" | "vs" }) {
  const { t } = useLingui();
  usePageTitle(mode === "mission" ? t`任務` : mode === "vs" ? t`對戰場地` : t`故事模式`);
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const myLead = profile?.key ?? "stinky";
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const { data: chars } = useSuspenseQuery(charsQuery);
  const nameOf = useCallback(
    (key: string | null) => (key ? (chars.find((c) => c.key === key)?.name ?? key) : ""),
    [chars],
  );
  // whose line a row is labelled with: a profile playing someone else's line (Fox on
  // stinky_school) sees it as a common one, played as themselves
  const leadOf = useCallback(
    (e: { lead: string | null }) => (profile && e.lead !== profile.key ? null : e.lead),
    [profile],
  );

  // a profile sees the line the client gives its character on every stage; a guest without one
  // plays each line as its lead, so sees them all
  const stories = useMemo(() => {
    const ofMode = catalog.filter((e) => e.mode === mode);
    return profile ? linesFor(ofMode, profile.charId) : ofMode;
  }, [catalog, mode, profile]);
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return stories.filter((e) => matches(e, nameOf(leadOf(e)), words));
  }, [stories, query, nameOf, leadOf]);
  const n = list.length;
  const loop = n > RADIUS * 2;

  // an unbounded cursor: the wheel spins through copies of the list, so it never hits an end
  const [cursor, setCursor] = useState(() =>
    Math.max(
      0,
      stories.findIndex((e) => e.lead === myLead && e.exported),
    ),
  );
  const pos = useSpring(cursor, { stiffness: 320, damping: 34, mass: 0.7 });
  useEffect(() => pos.set(cursor), [pos, cursor]);
  const current = n ? list[mod(cursor, n)] : null;
  const [focus, setFocus] = useState<"list" | "yes" | "no">("list");

  // a new filter starts from its first match (compared by list, so StrictMode's double effect run
  // on mount doesn't throw away the starting line)
  const shownList = useRef(list);
  useEffect(() => {
    if (shownList.current === list) return;
    shownList.current = list;
    setCursor(0);
    pos.jump(0);
  }, [list, pos]);

  const move = useCallback(
    (d: number) => {
      if (!n) return;
      audio.sfx("johnnymove.wav", { volume: 0.6 });
      setCursor((c) => (loop ? c + d : Math.max(0, Math.min(n - 1, c + d))));
    },
    [n, loop],
  );
  const go = () => {
    if (!current?.exported) return audio.sfx("guard.wav");
    audio.sfx("johnnyconfirm.wav");
    setCreating(current);
  };
  // 開設遊戲室 comes between picking a stage and playing it, as in the client
  const [creating, setCreating] = useState<CatalogEntry | null>(null);
  const back = () => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    void navigate({ to: profile ? "/play/lobby" : "/" });
  };

  const search = useRef<HTMLInputElement>(null);
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (creating) return;
    const typing = e.target === search.current;
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "PageDown") move(RADIUS * 2);
    else if (e.key === "PageUp") move(-RADIUS * 2);
    else if (e.key === "Enter") (focus === "no" ? back : go)();
    else if (e.key === "Escape") {
      if (query) setQuery("");
      else if (typing) search.current?.blur();
      else back();
    } else if (typing) return;
    else if (e.key === "/" || e.key === "f") search.current?.focus();
    else if (e.key === "ArrowRight") setFocus((f) => (f === "list" ? "yes" : "no"));
    else if (e.key === "ArrowLeft") setFocus((f) => (f === "no" ? "yes" : "list"));
    else if (e.code === "KeyJ") (focus === "no" ? back : go)();
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  // one notch of the mouse wheel = one story
  const wheelAt = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    const now = performance.now();
    if (now - wheelAt.current < 70 || Math.abs(e.deltaY) < 4) return;
    wheelAt.current = now;
    move(Math.sign(e.deltaY));
  };

  const { data: story } = useQuery({
    ...storyQuery(current?.key ?? ""),
    enabled: !!current?.exported,
  });
  const firstRoom = story?.rooms[String(story.start.bg)];
  const preview = firstRoom?.layers.find((l) => !l.object)?.img.replace(/\.\w+$/, ".webp");
  const lead = (current && leadOf(current)) ?? myLead;
  const restored = stories.filter((e) => e.exported).length;

  // a stage is picked while setting up a game room: the client plays lfo_character there
  // (LFO.exe scenes 15 / 18 / 23)
  const onStart = useCallback(() => audio.music("lfo_character.ogg", 0.35), []);

  const rows = [];
  if (n) {
    const from = loop ? cursor - RADIUS - 1 : 0;
    const to = loop ? cursor + RADIUS + 1 : n - 1;
    for (let k = from; k <= to; k++) {
      const e = list[mod(k, n)];
      rows.push(
        <WheelRow key={k} k={k} pos={pos}>
          <StageBar
            kind={mode === "mission" ? "MISSION" : "STAGE"}
            bright={k === cursor}
            locked={!e.exported}
            onClick={() => (k === cursor ? go() : move(k - cursor))}
            aria-label={`第${e.chapter}話 ${e.title} ${nameOf(leadOf(e))}`}
          >
            {e.chapter > 0 && (
              <span className="w-[58px] shrink-0 text-white/85 tabular-nums">第{e.chapter}話</span>
            )}
            <span className="truncate">{e.title}</span>
            {leadOf(e) && (
              <span className="ml-auto shrink-0 text-[12px] text-white/75">
                {nameOf(leadOf(e))}線
              </span>
            )}
            {!e.exported && <LockDot />}
          </StageBar>
        </WheelRow>,
      );
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#10141f] text-foreground select-none">
      <StartGate onStart={onStart} />
      <Screen className="bg-[radial-gradient(90%_80%_at_40%_30%,#46536b,#1a2130_75%)]">
        {/* preview of the chapter's first room */}
        <PreviewFrame className="absolute top-[18px] left-[56px]">
          <AnimatePresence mode="popLayout">
            {preview ? (
              <motion.img
                key={preview}
                src={`${BASE}/bg/${preview}`}
                alt=""
                className="absolute inset-0 size-full object-cover object-[50%_60%]"
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                draggable={false}
              />
            ) : (
              <motion.p
                key={current ? "locked" : "none"}
                className="absolute inset-0 grid place-items-center font-lfo text-[26px] text-white/35"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {current ? "COMING SOON" : "NO MATCH"}
              </motion.p>
            )}
          </AnimatePresence>
          {current && (
            <p className="absolute bottom-[8px] left-[14px] font-black text-[28px] text-white italic [text-shadow:0_2px_0_#000,0_0_12px_rgb(0_0_0/0.7)]">
              {current.chapter > 0 && `第${current.chapter}話　`}
              {current.title}
            </p>
          )}
        </PreviewFrame>

        {/* search */}
        <label className="absolute top-[168px] left-[28px] flex h-[36px] w-[300px] items-center gap-2 rounded-full border border-white/15 bg-black/35 px-4 focus-within:border-[#f47b20] focus-within:bg-black/50">
          <svg
            viewBox="0 0 16 16"
            className="size-[14px] shrink-0 fill-none stroke-white/60 stroke-2"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l4 4" />
          </svg>
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "story"
                ? t`搜尋故事、角色、地區…`
                : mode === "vs"
                  ? t`搜尋場地…`
                  : t`搜尋任務、地區…`
            }
            aria-label={t`搜尋故事`}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/45"
          />
          <span className="shrink-0 text-[11px] text-white/50 tabular-nums">
            {n}/{stories.length}
          </span>
        </label>

        {/* the wheel */}
        <div
          className="absolute top-[208px] left-[28px] h-[390px] w-[420px] overflow-hidden [mask-image:linear-gradient(transparent,#000_14%,#000_86%,transparent)]"
          onWheel={onWheel}
        >
          <div className="absolute inset-x-0 -top-[208px] bottom-0">{rows}</div>
          {!n && (
            <p className="absolute inset-x-0 top-[150px] text-center text-[14px] text-white/60">
              {mode === "story" ? t`找不到符合「${query}」的故事` : t`找不到符合「${query}」的場地`}
            </p>
          )}
        </div>
        <IconButton
          glyph="up"
          w={32}
          h={36}
          className="absolute top-[218px] left-[452px]"
          onClick={() => move(-1)}
          aria-label="up"
          disabled={!n}
        />
        <IconButton
          glyph="down"
          w={32}
          h={36}
          className="absolute top-[546px] left-[452px]"
          onClick={() => move(1)}
          aria-label="down"
          disabled={!n}
        />

        {/* the story's lead and its opening line */}
        <InfoPanel className="absolute top-[168px] left-[498px] h-[418px] w-[276px]">
          <img
            src={`${ASSETS}/ui-hd/profile/${lead}_big.webp`}
            srcSet={`${ASSETS}/ui-hd/profile/${lead}_big.webp 4x`}
            alt=""
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
            onLoad={(e) => {
              e.currentTarget.style.visibility = "visible";
            }}
            className="absolute top-[64px] left-1/2 max-h-[190px] -translate-x-1/2 object-contain opacity-90"
            draggable={false}
          />
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-[#232833] to-transparent px-4 pt-3 pb-6">
            <p className="truncate font-black text-[20px] text-white">
              {mode === "mission"
                ? t`任務`
                : mode === "vs"
                  ? t`對戰場地`
                  : current && leadOf(current)
                    ? t`${nameOf(leadOf(current))}線`
                    : t`共通線`}
            </p>
            <p
              className={cn(
                "mt-1 text-[12px]",
                current?.exported ? "text-[#9be15d]" : "text-white/60",
              )}
            >
              {current?.exported
                ? t`已重現 · 原版關卡、劇本與對白`
                : t`修復中 · 已重現 ${restored} / ${stories.length}`}
            </p>
          </div>
          <div className="absolute inset-x-0 top-[262px] h-[80px] bg-gradient-to-b from-transparent via-[#12161f]/85 to-[#12161f]/85 px-4 pt-3">
            <p className="line-clamp-3 text-[12.5px] text-white/85 leading-[1.55]">
              {current?.synopsis || " "}
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[#1a1f29] px-4 py-3">
            <OkCaption />
            <div className="flex gap-2">
              <IconButton
                glyph="o"
                w={57}
                h={64}
                active={focus === "yes"}
                onMouseEnter={() => setFocus("yes")}
                onClick={go}
                disabled={!current?.exported}
                aria-label={t`開始`}
              />
              <IconButton
                glyph="x"
                w={57}
                h={64}
                active={focus === "no"}
                onMouseEnter={() => setFocus("no")}
                onClick={back}
                aria-label={t`返回`}
              />
            </div>
          </div>
        </InfoPanel>
      </Screen>
      <AnimatePresence>
        {creating && (
          <NewGameRoom
            key="room"
            stage={
              creating.chapter > 0 ? `第${creating.chapter}話　${creating.title}` : creating.title
            }
            defaultName={t`${profile?.name ?? "LFO"}的遊戲室`}
            onConfirm={(room) =>
              void (mode === "vs"
                ? // VS: the room fills with COM players before the bout
                  navigate({ to: "/play/room", search: { stage: creating.key, name: room } })
                : navigate({ to: "/play/story/$story", params: { story: creating.key } }))
            }
            onCancel={() => setCreating(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** One bar on the wheel, placed and faded by its distance from the spinning cursor. */
function WheelRow({
  k,
  pos,
  children,
}: {
  k: number;
  pos: MotionValue<number>;
  children: React.ReactNode;
}) {
  const y = useTransform(pos, (p) => CENTER + (k - p) * ROW);
  const d = useTransform(pos, (p) => Math.abs(k - p));
  const opacity = useTransform(d, [0, RADIUS, RADIUS + 1], [1, 0.55, 0]);
  const scale = useTransform(d, [0, 1, RADIUS], [1, 0.96, 0.9]);
  const x = useTransform(d, [0, RADIUS], [0, 14]);
  return (
    <motion.div className="absolute left-0 origin-left" style={{ y, opacity, scale, x }}>
      {children}
    </motion.div>
  );
}

function LockDot() {
  return (
    <svg viewBox="0 0 12 14" className="size-[12px] shrink-0 fill-white/70" aria-hidden>
      <path d="M3 6V4a3 3 0 0 1 6 0v2h1v8H2V6zm1.5 0h3V4a1.5 1.5 0 0 0-3 0z" />
    </svg>
  );
}
