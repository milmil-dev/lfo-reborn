import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { q } from "@/lib/api";
import { type Brain, newBrain, think } from "../ai";
import { audio } from "../audio";
import type { Fighter } from "../core/fighter";
import { EMPTY_INPUT, type InputState, TICK_HZ } from "../core/types";
import { Effects } from "../effects";
import { Controls } from "../input";
import { LoadingScreen } from "../kit/loading";
import { ResultBoard } from "../kit/result";
import { applyLevel, statTable } from "../leveling";
import { getActiveProfile, updateActiveProfile } from "../profiles";
import { BASE, loadSprite } from "../render";
import { Screen } from "../screen";
import { Director, type DirectorSnapshot } from "../story/director";
import { BottomBar, HitCounter, StatusBox, useHudScale, type Vitals } from "../story/hud";
import { RoomScene } from "../story/room-scene";
import type { StoryData } from "../story/types";
import { comSkill, decided, engineTeam, RANKS, settleHonor } from "../vs";
import { TEAM_COLOR } from "../kit/room";
import { cn } from "@/lib/cn";
import type { RoomClient } from "./client";
import { HASH_EVERY, INPUT_DELAY, packInput, type RoomState, unpackInput } from "./protocol";
import { MAX_AHEAD, Rollback, type Sim } from "./rollback";

/*
  An online bout with rollback (rollback.ts). Every peer runs the same World on its own clock:
  my presses land INPUT_DELAY ticks ahead and are known by then, the other seats are guessed
  to keep pressing what they last pressed, and the room's frames (one input mask per seat per
  tick) confirm each tick or rewind it and replay. The host runs the COM seats' brains and sends
  their presses like its own. Every HASH_EVERY confirmed ticks each peer reports World.hash() and
  the room calls out a desync. Everyone fights at the room's level, so no save data enters the
  bout.
*/

type Entrant = {
  name: string;
  team: number;
  you: boolean;
  com: boolean;
  kos: number;
  f: Fighter | null;
};

/** One row of the roster strip: who is in the bout and how they stand. */
type Strip = {
  name: string;
  team: number;
  com: boolean;
  you: boolean;
  online: boolean;
  charId: number | null;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  kos: number;
};

/** ticks the local clock keeps ahead of the room's latest frame: the horizon of guessed presses */
const LEAD = 3;
type Outcome = { won: boolean; line: string | null; honor: number; rank: number };

export type ChatLine = { seat: number; name: string; text: string };

/** The bout's own chrome: who is in it and how they stand, and the room's chat. */
function Roster({ rows, scale }: { rows: Strip[]; scale: number }) {
  const { t } = useLingui();
  return (
    <div
      className="pointer-events-none absolute top-0 right-0 z-20 flex flex-col items-end gap-[2px] p-[6px]"
      style={{ transform: `scale(${scale})`, transformOrigin: "top right" }}
    >
      {rows.map((r) => (
        <div
          key={`${r.name}-${r.team}-${r.com ? "c" : "p"}`}
          className="flex w-[186px] items-center gap-[5px] rounded bg-black/45 px-[6px] py-[2px] font-bold text-[11px] text-white"
        >
          <span
            className="grid size-[13px] shrink-0 place-items-center rounded-[2px] text-[9px] text-black"
            style={{ background: TEAM_COLOR[r.team] ?? "#9aa0aa" }}
          >
            {r.team >= 10 ? t`獨` : r.team}
          </span>
          <span className={cn("truncate", !r.online && !r.com && "text-white/40 line-through")}>
            {r.name}
            {r.com && <span className="text-[9px] text-white/60"> COM</span>}
            {r.you && <span className="text-[#ffe08a]"> ★</span>}
          </span>
          {r.kos > 0 && (
            <span className="shrink-0 font-lfo text-[9px] text-[#ffe08a]">KO {r.kos}</span>
          )}
          <span className="ml-auto flex shrink-0 flex-col gap-px">
            <span className="block h-[3px] w-[34px] bg-black/60">
              <span
                className="block h-full bg-[#ff2b2b]"
                style={{ width: `${(34 * Math.max(0, r.hp)) / Math.max(1, r.maxHp)}px` }}
              />
            </span>
            <span className="block h-[3px] w-[34px] bg-black/60">
              <span
                className="block h-full bg-[#3e8ef7]"
                style={{ width: `${(34 * Math.max(0, r.mp)) / Math.max(1, r.maxMp)}px` }}
              />
            </span>
          </span>
          {!r.com && !r.online && (
            <span className="shrink-0 text-[9px] text-white/50">{t`離線`}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The room's chat during a bout: the last few lines, and a box to add one. */
function BoutChat({
  lines,
  scale,
  onSend,
}: {
  lines: ChatLine[];
  scale: number;
  onSend: (text: string) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  // laid out in the HUD's 800 × 600 units like the rest of the chrome, above the bottom dial
  const box = {
    left: 24 * scale,
    bottom: 158 * scale,
    transform: `scale(${scale})`,
    transformOrigin: "bottom left",
  };
  if (!open)
    return (
      <div className="absolute z-20" style={box}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-black/55 px-3 py-1 font-bold text-[12px] text-white/85 hover:bg-black/75"
        >
          {t`聊天`}
        </button>
      </div>
    );
  return (
    <div className="absolute z-20" style={box}>
      <div className="flex h-[150px] w-[236px] flex-col rounded-[8px] bg-black/70 p-[6px] text-[11px] text-white">
        <div className="mb-[3px] flex items-center justify-between">
          <span className="font-bold text-white/70">{t`聊天`}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-1 text-white/60 hover:text-white"
            aria-label={t`收起聊天`}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-[2px] overflow-hidden">
          {lines.length === 0 && <p className="text-white/40">{t`（還沒有人說話）`}</p>}
          {lines.slice(-6).map((l, i) => (
            <p key={`${i}-${l.text}`} className="text-[#ffe9a8]">
              <span className="text-[#ffb27a]">{l.name}：</span>
              {l.text}
            </p>
          ))}
        </div>
        <input
          type="text"
          maxLength={120}
          placeholder={t`輸入訊息，Enter 送出`}
          className="mt-[3px] h-[22px] rounded border border-white/20 bg-black/40 px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-[#ffd27a]"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const el = e.currentTarget;
            if (el.value.trim()) onSend(el.value);
            el.value = "";
          }}
        />
      </div>
    </div>
  );
}

export function NetRun({
  client,
  room,
  you,
  onDone,
}: {
  client: RoomClient;
  room: RoomState;
  you: number;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const scale = useHudScale();
  const queryClient = useQueryClient();
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [combo, setCombo] = useState({ n: 0, id: 0 });
  const [board, setBoard] = useState<Entrant[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [desync, setDesync] = useState<number | null>(null);
  // a correction arrived from further back than the snapshots kept: this peer fell too far behind
  const [lost, setLost] = useState(false);
  // the roster strip: everyone's bars as of the last tick (the scene draws only other players' bars)
  const [strip, setStrip] = useState<Strip[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const profile = getActiveProfile();

  useEffect(() => {
    const el = host.current;
    const me = room.seats[you];
    if (!el || !me?.key) return;
    let stopped = false;
    let stop = () => {};
    // frames may start before the sprites are in: queue them from the first moment
    const queue: { k: number; m: number[] }[] = [];
    // the room's clock, as its frames arrive: the local clock runs at that rate (a Durable Object's
    // timer is not exactly 30 Hz) and LEAD ticks ahead of it, which is as far as presses are guessed
    let interval = 1000 / TICK_HZ;
    let lastFrameAt = 0;
    // a bout this peer is coming back into: the room said so (client.resuming), and it replays
    // its log once this peer's world is up. The clock must not run until the replay is through.
    let resuming = client.getSnapshot().resuming;
    let resumeEnd = -1;
    const off = client.onMessage((msg) => {
      if (msg.t === "f") {
        queue.push(msg);
        const now = performance.now();
        if (lastFrameAt) interval = interval * 0.9 + Math.min(100, now - lastFrameAt) * 0.1;
        lastFrameAt = now;
      } else if (msg.t === "desync") setDesync(msg.k);
      else if (msg.t === "chat")
        setChat((c) => [...c, { seat: msg.seat, name: msg.name, text: msg.text }].slice(-40));
      else if (msg.t === "resume-end") resumeEnd = msg.k;
    });

    const run = async () => {
      const res = await fetch(`${BASE}/stories/${room.rules.stage}.json`);
      if (!res.ok) throw new Error(`stage ${room.rules.stage} not found`);
      const story = (await res.json()) as StoryData;
      if (stopped) return;

      const entrants: Entrant[] = room.seats.map((s, i) => ({
        name: s.name,
        team: engineTeam(s.team, i),
        you: i === you,
        com: s.com,
        kos: 0,
        f: null,
      }));
      const downed = new Set<number>();
      let comboN = 0;
      let comboAt = -99;
      const scene = new RoomScene(el, () => ({ x: d.camera.x, height: 600 }));
      const d = new Director(
        story,
        {
          load: (path) => loadSprite(path),
          added: (f, path) => void loadSprite(path).then((a) => scene.add(f, a)),
          removed: (f) => scene.remove(f),
          room: async (r) => scene.setRoom(r),
          preload: (r) => scene.preload(r),
          talk: async () => {},
          title: () => {},
          fade: async () => {},
          music: (file) => audio.music(file, 0.35),
          sound: (file) => audio.sfx(file, { volume: 0.7 }),
          shake: (n) => scene.quake(n),
          status: () => {},
          fx: (events) => {
            for (const e of events) {
              if (e.type === "sound") audio.sfx(e.name, { volume: 0.5 });
              else if (e.type === "hit") {
                scene.spark(e.x, e.y, e.blocked);
                scene.damage(e.x, e.y - 30, e.damage, e.blocked);
                audio.sfx(e.blocked ? "guard.wav" : `hit${1 + (e.damage % 3)}.wav`, {
                  volume: 0.7,
                });
                scene.quake(e.blocked ? 3 : Math.min(12, 4 + e.damage / 8));
                const att = d.world.fighters.find((f) => f.id === e.attacker);
                const side = entrants.filter((x) => x.f && att && x.f.team === att.team);
                const src = side.find((x) => x.f === att) ?? side[0];
                const target = entrants.find((x) => x.f?.id === e.target);
                if (src?.you && !e.blocked) {
                  comboN = d.world.tick - comboAt < 45 ? comboN + 1 : 1;
                  comboAt = d.world.tick;
                  setCombo({ n: comboN, id: comboN === 1 ? d.world.tick : comboAt });
                }
                if (src && target?.f && target.f.hp <= 0 && !downed.has(target.f.id)) {
                  downed.add(target.f.id);
                  src.kos++;
                }
              }
            }
          },
        },
        `chars/${me.key}`,
      );
      d.effects = new Effects(d.world, scene);
      d.arena = true;
      const controls = new Controls();
      // the host runs the computer players
      const brains = new Map<number, Brain>();

      await d.start();
      const stage = d.world.stage;
      const mid = (stage.minZ + stage.maxZ) / 2;
      const left = stage.minX + 200;
      const right = Math.max(left + 400, Math.min(stage.maxX - 200, left + 900));
      // odd seats start on the right, even on the left, each pair a step further in
      for (let i = 0; i < room.seats.length; i++) {
        const s = room.seats[i];
        if (!s.key) continue;
        const pair = Math.floor(i / 2);
        const x = i % 2 === 0 ? left + pair * 90 : right - pair * 90;
        const z = mid + (pair - 0.5) * 40;
        const f =
          i === you
            ? await d.addPlayer(`chars/${s.key}`, x, z)
            : await d.addLocal(`chars/${s.key}`, entrants[i].team, x, z);
        if (!f) continue;
        // every peer must spawn the same fighter the same way: team and facing by seat, not by
        // whether the fighter is its own (addPlayer) or another's (addLocal)
        f.team = entrants[i].team;
        f.facing = x > stage.maxX / 2 ? -1 : 1;
        f.showBars = i !== you;
        entrants[i].f = f;
        const c = await queryClient.fetchQuery(q.character(f.data.attrs.id)).catch(() => null);
        if (c) applyLevel(f, statTable(c), room.rules.level);
        if (s.com) {
          entrants[i].name = c?.name ?? s.key;
          if (you === 0) brains.set(i, newBrain(comSkill(room.rules.level)));
        }
      }
      if (stopped) {
        scene.destroy();
        controls.dispose();
        return;
      }
      setLoading(false);
      client.send({ t: "loaded" });
      // a bout this peer is coming back into: ask for the frames from tick 0 (the world above is
      // the bout's start, so the replay rebuilds exactly what everyone else has)
      if (resuming) client.send({ t: "resume" });

      // the bout runs on the local clock; the room's frames confirm or correct it (rollback.ts)
      const sim: Sim = {
        step: (masks, silent) => {
          const locals = new Map<number, InputState>();
          let mine: InputState = EMPTY_INPUT;
          entrants.forEach((e, i) => {
            if (!e.f) return;
            const input = unpackInput(masks[i] ?? 0);
            if (e.you) mine = input;
            else locals.set(e.f.id, input);
          });
          d.step(mine, locals, silent);
        },
        snapshot: () => d.snapshot(),
        restore: (s) => d.restore(s as DirectorSnapshot),
        hash: () => d.world.hash(),
      };
      const rb = new Rollback(sim, room.seats.length);
      if (import.meta.env.DEV)
        Object.assign(window, { __lfo: { director: d, scene, entrants, rb } });
      let endAt = 0;
      let ended = false;
      let nextHash = HASH_EVERY;

      /** My presses (and the COM presses this peer drives) for a tick ahead, then one step. */
      const localTick = () => {
        const k = rb.tick + INPUT_DELAY;
        const mine = packInput(controls.sample());
        rb.setLocal(you, k, mine);
        client.send({ t: "i", k, m: mine });
        for (const [i, b] of brains) {
          const f = entrants[i].f;
          if (!f) continue;
          const m = packInput(think(f, d.world.fighters, b));
          rb.setLocal(i, k, m);
          client.send({ t: "i", k, s: i, m });
        }
        rb.advance();
        afterTick(rb.tick - 1);
      };
      /** The room's frames in; then the hashes of the ticks they confirmed out. */
      const takeFrames = () => {
        while (queue.length) {
          const fr = queue.shift()!;
          rb.frame(fr.k, fr.m);
          // a replay runs the world up to the room's tick, silently: the bout already happened
          if (resuming && rb.tick <= fr.k) while (rb.tick <= fr.k) rb.advance(true);
        }
        // a replay is done once the room says the log is through (its frames up to that tick)
        if (resuming && resumeEnd >= 0 && rb.tick >= resumeEnd) {
          resuming = false;
          client.setResumed();
        }
        if (resuming) return;
        while (nextHash <= rb.confirmed) {
          const x = rb.hashAfter(nextHash);
          if (x !== null) client.send({ t: "h", k: nextHash, x });
          nextHash += HASH_EVERY;
        }
        if (rb.lost) setLost(true);
      };

      const afterTick = (k: number) => {
        const p = entrants[you].f;
        if (p && k % 3 === 0) {
          setVitals({
            name: me.name,
            charId: p.data.attrs.id,
            honor: getActiveProfile()?.honor ?? 0,
            hp: p.hp,
            maxHp: p.maxHp,
            mp: p.mp,
            maxMp: p.maxMp,
            sp: p.sp,
            maxSp: p.maxSp,
            status: [...p.status.keys()],
          });
          // the strip keeps everyone (the scene draws only the other players' bars)
          setStrip(
            entrants.map((e, i) => ({
              name: e.name,
              team: e.team,
              com: e.com,
              you: e.you,
              online: room.seats[i]?.online ?? true,
              charId: e.f?.data.attrs.id ?? null,
              hp: e.f?.hp ?? 0,
              maxHp: e.f?.maxHp ?? 1,
              mp: e.f?.mp ?? 0,
              maxMp: e.f?.maxMp ?? 1,
              kos: e.kos,
            })),
          );
        }
        if (k % 30 === 0) setSeconds(Math.floor(k / 30));
        if (comboN && k - comboAt > 60) {
          comboN = 0;
          setCombo((c) => ({ ...c, n: 0 }));
        }
        // last team standing — held for 45 ticks, since a rollback can take a knock-out back
        const alive = entrants.filter((x) => x.f).map((x) => ({ team: x.team, hp: x.f!.hp }));
        const winner = decided(alive);
        if (winner === null) endAt = 0;
        else if (!endAt) endAt = k + 45;
        else if (k >= endAt && !ended) {
          ended = true;
          const won = winner === entrants[you].team;
          const r = settleHonor(getActiveProfile()?.honor ?? 0, won, entrants[you].kos);
          updateActiveProfile((pr) => ({ ...pr, honor: r.honor }));
          audio.sfx(won ? "johnnyallright.wav" : "johnnymove.wav");
          setOutcome({ won, line: r.line, honor: r.honor, rank: r.rank });
          setBoard(entrants.map((x) => ({ ...x })));
          if (you === 0) client.send({ t: "end" });
        }
      };

      let acc = 0;
      let last = performance.now();
      let raf = 0;
      const frame = (now: number) => {
        acc += Math.min(250, now - last);
        last = now;
        takeFrames();
        if (resuming) {
          // the room is replaying: the world is already at the start, so no tick may run yet
          acc = 0;
          d.setViewWidth((el.clientWidth * 600) / Math.max(1, el.clientHeight));
          scene.draw(undefined, { alpha: 0, tick: d.world.tick });
          raf = requestAnimationFrame(frame);
          return;
        }
        // the local clock follows the room's rate (24 – 36 Hz), holding LEAD ticks ahead of its
        // latest frame: too far ahead it waits, too far behind (we loaded late, or stalled) it
        // catches up a few ticks a frame — and never past what the snapshots can take back
        const dt = Math.min(1000 / 24, Math.max(1000 / 36, interval));
        while (acc >= dt) {
          acc -= dt;
          if (rb.ahead <= LEAD && !rb.lost) localTick();
        }
        for (let n = 0; n < 4 && rb.ahead < LEAD - 1 && rb.ahead < MAX_AHEAD && !rb.lost; n++)
          localTick();
        d.setViewWidth((el.clientWidth * 600) / Math.max(1, el.clientHeight));
        // drawn between the last tick and the next, like runLoop does for the local modes
        scene.draw(undefined, { alpha: Math.min(1, acc / dt), tick: d.world.tick });
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      stop = () => {
        cancelAnimationFrame(raf);
        controls.dispose();
        scene.destroy();
        audio.music(null);
      };
    };
    void run();
    return () => {
      stopped = true;
      off();
      stop();
    };
  }, [client, room, you, queryClient]);

  const winners = board && outcome ? board.filter((x) => x.f && x.f.hp > 0).map((x) => x.team) : [];

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <LoadingScreen show={loading} />
      {vitals && !board && <StatusBox v={vitals} scale={scale} />}
      {!board && (
        <BottomBar
          scale={scale}
          seconds={seconds}
          level={profile?.lv ?? 1}
          exp={profile?.exp ?? 0}
          money={profile?.money ?? 0}
        />
      )}
      {!board && <Roster rows={strip} scale={scale} />}
      {!board && (
        <BoutChat lines={chat} scale={scale} onSend={(text) => client.send({ t: "chat", text })} />
      )}
      <HitCounter hits={combo.n} id={combo.id} scale={scale} />
      {(desync !== null || lost) && (
        <p className="absolute inset-x-0 top-[14%] z-40 text-center font-bold text-[#ff6b6b] text-sm [text-shadow:0_1px_2px_#000]">
          {lost
            ? t`連線太慢，跟不上房間的進度：這一局無法同步。`
            : t`同步失敗（第 ${desync} 格）：各人看到的戰況已不一致。`}
        </p>
      )}
      <AnimatePresence>
        {board && outcome && (
          <motion.div
            key="result"
            className="absolute inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Screen>
              <ResultBoard
                heading={outcome.won ? "WIN" : "LOSE"}
                title={outcome.line ?? t`勳銜：${RANKS[outcome.rank]}　榮譽 ${outcome.honor}`}
                header={[t`名稱`, "LV", t`隊伍`, t`擊倒`, t`結果`, "", "", "", "", "", ""]}
                rows={board.map((x) => [
                  x.com ? `${x.name} COM` : x.you ? `${x.name} ★` : x.name,
                  room.rules.level,
                  x.team >= 10 ? t`獨立` : x.team,
                  x.kos,
                  winners.includes(x.team) ? "WIN" : "LOSE",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                ])}
                actions={[{ label: t`返回遊戲室`, run: onDone }]}
              />
            </Screen>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
