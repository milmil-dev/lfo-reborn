import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { q } from "@/lib/api";
import { type Brain, newBrain, think } from "../ai";
import { audio } from "../audio";
import type { Fighter } from "../core/fighter";
import { EMPTY_INPUT, type InputState } from "../core/types";
import { Effects } from "../effects";
import { Controls } from "../input";
import { LoadingScreen } from "../kit/loading";
import { ResultBoard } from "../kit/result";
import { applyLevel, statTable } from "../leveling";
import { getActiveProfile, updateActiveProfile } from "../profiles";
import { BASE, loadSprite } from "../render";
import { Screen } from "../screen";
import { Director } from "../story/director";
import { BottomBar, HitCounter, StatusBox, useHudScale, type Vitals } from "../story/hud";
import { RoomScene } from "../story/room-scene";
import type { StoryData } from "../story/types";
import { comSkill, decided, engineTeam, RANKS, settleHonor } from "../vs";
import type { RoomClient } from "./client";
import { HASH_EVERY, INPUT_DELAY, packInput, type RoomState, unpackInput } from "./protocol";

/*
  An online bout in lockstep. Every peer runs the same World; the room's frames (one input mask
  per seat per tick) are the only thing that moves it, so the World is stepped when a frame
  arrives, never on the local clock. My own presses go to the room for a tick INPUT_DELAY ahead
  and come back in a frame like everyone else's; the host runs the COM seats' brains and sends
  their presses the same way. Every HASH_EVERY ticks each peer reports World.hash() and the room
  calls out a desync. Everyone fights at the room's level, so no save data enters the bout.
*/

type Entrant = {
  name: string;
  team: number;
  you: boolean;
  com: boolean;
  kos: number;
  f: Fighter | null;
};
type Outcome = { won: boolean; line: string | null; honor: number; rank: number };

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
  const profile = getActiveProfile();

  useEffect(() => {
    const el = host.current;
    const me = room.seats[you];
    if (!el || !me?.key) return;
    let stopped = false;
    let stop = () => {};
    // frames may start before the sprites are in: queue them from the first moment
    const queue: { k: number; m: number[] }[] = [];
    const off = client.onMessage((msg) => {
      if (msg.t === "f") queue.push(msg);
      else if (msg.t === "desync") setDesync(msg.k);
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
      const controls = new Controls();
      // the host runs the computer players
      const brains = new Map<number, Brain>();
      if (import.meta.env.DEV) Object.assign(window, { __lfo: { director: d, scene, entrants } });

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

      let applied = -1;
      let endAt = 0;
      const apply = (fr: { k: number; m: number[] }) => {
        if (fr.k <= applied) return;
        applied = fr.k;
        const locals = new Map<number, InputState>();
        let mine: InputState = EMPTY_INPUT;
        entrants.forEach((e, i) => {
          if (!e.f) return;
          const input = unpackInput(fr.m[i] ?? 0);
          if (e.you) mine = input;
          else locals.set(e.f.id, input);
        });
        d.step(mine, locals);
        const k = fr.k;
        client.send({ t: "i", k: k + INPUT_DELAY, m: packInput(controls.sample()) });
        for (const [i, b] of brains) {
          const f = entrants[i].f;
          if (f)
            client.send({
              t: "i",
              k: k + INPUT_DELAY,
              s: i,
              m: packInput(think(f, d.world.fighters, b)),
            });
        }
        if (k > 0 && k % HASH_EVERY === 0) client.send({ t: "h", k, x: d.world.hash() });

        const p = entrants[you].f;
        if (p && k % 3 === 0)
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
        if (k % 30 === 0) setSeconds(Math.floor(k / 30));
        if (comboN && k - comboAt > 60) {
          comboN = 0;
          setCombo((c) => ({ ...c, n: 0 }));
        }
        const alive = entrants.filter((x) => x.f).map((x) => ({ team: x.team, hp: x.f!.hp }));
        if (!endAt) {
          if (decided(alive) !== null) endAt = k + 45;
        } else if (k === endAt) {
          const winner = decided(alive);
          const won = winner === entrants[you].team;
          const r = settleHonor(getActiveProfile()?.honor ?? 0, won, entrants[you].kos);
          updateActiveProfile((pr) => ({ ...pr, honor: r.honor }));
          audio.sfx(won ? "johnnyallright.wav" : "johnnymove.wav");
          setOutcome({ won, line: r.line, honor: r.honor, rank: r.rank });
          setBoard(entrants.map((x) => ({ ...x })));
          if (you === 0) client.send({ t: "end" });
        }
      };

      let raf = 0;
      const frame = () => {
        // a burst (we loaded late) is caught up a few ticks a frame
        let n = 0;
        while (queue.length && n++ < 10) apply(queue.shift()!);
        d.setViewWidth((el.clientWidth * 600) / Math.max(1, el.clientHeight));
        scene.draw();
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
      <HitCounter hits={combo.n} id={combo.id} scale={scale} />
      {desync !== null && (
        <p className="absolute inset-x-0 top-[14%] z-40 text-center font-bold text-[#ff6b6b] text-sm [text-shadow:0_1px_2px_#000]">
          {t`同步失敗（第 ${desync} 格）：各人看到的戰況已不一致。`}
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
