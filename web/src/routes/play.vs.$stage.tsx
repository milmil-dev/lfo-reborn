import { useLingui } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { audio } from "@/game/audio";
import type { Fighter } from "@/game/core/fighter";
import type { InputState } from "@/game/core/types";
import { Effects } from "@/game/effects";
import { SeatControls } from "@/game/input";
import { add, emptyInventory, equipBonus } from "@/game/inventory";
import { useItemTable } from "@/game/items-data";
import { nianyuanDrop } from "@/game/fusion";
import { LoadingScreen } from "@/game/kit/loading";
import { ResultBoard } from "@/game/kit/result";
import { applyLevel, statTable, withFusionBonus } from "@/game/leveling";
import {
  fusionOf,
  getActiveProfile,
  getInventory,
  playKey,
  type Profile,
  updateActiveProfile,
} from "@/game/profiles";
import { BASE, loadSprite, runLoop } from "@/game/render";
import { Screen } from "@/game/screen";
import { Director } from "@/game/story/director";
import { BottomBar, HitCounter, StatusBox, useHudScale, type Vitals } from "@/game/story/hud";
import { RoomScene } from "@/game/story/room-scene";
import { catalogQuery, stageLabel } from "@/game/stage-select";
import type { StoryData } from "@/game/story/types";
import { StartGate } from "@/game/ui";
import {
  comSkill,
  decided,
  engineTeam,
  guestsOf,
  RANKS,
  type RoomSetup,
  settleHonor,
} from "@/game/vs";
import { CUP_HONOR, playRound, yourTeam } from "@/game/champion";
import { useCup } from "@/game/champion-store";
import { q } from "@/lib/api";
import { usePageTitle } from "@/lib/title";

/*
  A VS bout: the stage of the waiting room, you, the other players at this machine (each on
  their own device) and the COM players on their teams, last team standing wins (the client's
  default rule, 「最先打倒隊方所有成員」). The result board lists everyone; a win or a loss moves
  your honor and, now and then, your 勳銜 — the guests have no profile to move.
*/

export const Route = createFileRoute("/play/vs/$stage")({
  // cup: a 王者爭霸 match — the result goes back to the bracket
  validateSearch: z.object({
    room: z.string().catch(""),
    cup: z.boolean().optional().catch(undefined),
  }),
  beforeLoad: () => {
    if (!getActiveProfile()) throw redirect({ to: "/play/profile" });
  },
  loader: async ({ params, context: { queryClient } }) => {
    // the catalog names the stage (tab title, result board); fetched alongside the stage itself
    void queryClient.prefetchQuery(catalogQuery);
    const res = await fetch(`${BASE}/stories/${params.stage}.json`);
    if (!res.ok) throw new Error(`stage ${params.stage} not found`);
    return (await res.json()) as StoryData;
  },
  component: VsPage,
  pendingComponent: () => <LoadingScreen show />,
});

type Entrant = {
  name: string;
  lv: number;
  team: number;
  you: boolean;
  /** a person at this machine (you or a guest) rather than a COM */
  human: boolean;
  kos: number;
  f: Fighter | null;
};
type Outcome = { won: boolean; line: string | null; honor: number; rank: number };

function VsPage() {
  const story = Route.useLoaderData();
  const { data: catalog } = useQuery(catalogQuery);
  const entry = catalog?.find((e) => e.key === story.key);
  usePageTitle(catalog ? (entry ? stageLabel(entry) : story.key) : null);
  const { room, cup } = Route.useSearch();
  const [run, setRun] = useState(0);
  const [started, setStarted] = useState(false);
  const onStart = useCallback(() => setStarted(true), []);
  // parsed once per room string: the bout restarts whenever its setup object changes
  const setup = useMemo(() => {
    try {
      return JSON.parse(room) as RoomSetup;
    } catch {
      return null;
    }
  }, [room]);
  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={onStart} />
      {started && setup && (
        <VsRun
          key={run}
          story={story}
          setup={setup}
          cup={!!cup}
          onAgain={() => setRun((r) => r + 1)}
        />
      )}
    </div>
  );
}

function VsRun({
  story,
  setup,
  cup,
  onAgain,
}: {
  story: StoryData;
  setup: RoomSetup;
  cup: boolean;
  onAgain: () => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const scale = useHudScale();
  const queryClient = useQueryClient();
  const items = useItemTable();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [vitals, setVitals] = useState<Vitals | null>(null);
  // the first guest's box sits in the other top corner; further guests have their bars under their feet
  const [vitals2, setVitals2] = useState<Vitals | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [combo, setCombo] = useState({ n: 0, id: 0 });
  const [board, setBoard] = useState<Entrant[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const profile = getActiveProfile();

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    const me = getActiveProfile();
    if (!me) return;
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
              audio.sfx(e.blocked ? "guard.wav" : `hit${1 + (e.damage % 3)}.wav`, { volume: 0.7 });
              scene.quake(e.blocked ? 3 : Math.min(12, 4 + e.damage / 8));
              // a projectile carries its owner's team: credit you first, else a teammate
              const att = d.world.fighters.find((f) => f.id === e.attacker);
              const side = entrants.filter((x) => x.f && att && x.f.team === att.team);
              const src = side.find((x) => x.f === att) ?? side.find((x) => x.you) ?? side[0];
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
      `chars/${playKey(me)}`,
    );
    d.effects = new Effects(d.world, scene);
    // seats: you on the keyboard (and any pad nobody else holds), then each guest's device
    const guests = guestsOf(setup);
    const controls = new SeatControls(["kb", ...guests.map((g) => g.device)]);
    const entrants: Entrant[] = [
      {
        name: me.name,
        lv: me.lv,
        team: engineTeam(setup.team, 0),
        you: true,
        human: true,
        kos: 0,
        f: null,
      },
      ...guests.map((g, i) => ({
        name: `P${i + 2}`,
        lv: g.lv,
        team: engineTeam(g.team, 1 + i),
        you: false,
        human: true,
        kos: 0,
        f: null as Fighter | null,
      })),
      ...setup.coms.map((c, i) => ({
        name: c.key,
        lv: c.lv,
        team: engineTeam(c.team, 1 + guests.length + i),
        you: false,
        human: false,
        kos: 0,
        f: null as Fighter | null,
      })),
    ];
    const comAt = 1 + guests.length;
    const downed = new Set<number>();
    let comboN = 0;
    let comboAt = -99;
    let ready = false;
    let endAt = 0;
    if (import.meta.env.DEV) Object.assign(window, { __lfo: { director: d, scene, entrants } });

    const level = async (
      f: Fighter,
      lv: number,
      bonus?: ReturnType<typeof equipBonus>,
      points?: Profile["points"],
      // 合體: a 合體戰神 grows by its own character's table
      statId = f.data.attrs.id,
    ) => {
      const c = await queryClient.fetchQuery(q.character(statId)).catch(() => null);
      if (c) applyLevel(f, statTable(c), lv, bonus, points);
      const e = entrants.find((x) => x.f === f)!;
      // a COM is named after its character; a guest keeps "玩家 n" and shows the character beside it
      e.name = e.human ? `${e.name} · ${c?.name ?? f.data.name}` : (c?.name ?? f.data.name);
    };

    void d.start().then(async () => {
      const room = d.world.stage;
      const mid = (room.minZ + room.maxZ) / 2;
      const left = room.minX + 200;
      const right = Math.max(left + 400, Math.min(room.maxX - 200, left + 900));
      const p = await d.addPlayer(`chars/${playKey(me)}`, left, mid);
      if (p) {
        p.team = entrants[0].team;
        entrants[0].f = p;
        const fused = !!fusionOf(me);
        await level(
          p,
          me.lv,
          withFusionBonus(equipBonus(getInventory(), itemsRef.current), fused),
          me.points,
          me.charId,
        );
        entrants[0].name = me.name;
      }
      // the people at this machine start on the left, the COM players on the right
      await Promise.all([
        ...guests.map(async (g, i) => {
          const f = await d.addLocal(
            `chars/${g.key}`,
            entrants[1 + i].team,
            left + 80 * (i + 1),
            mid + i * 40,
          );
          if (!f) return;
          f.showBars = i > 0;
          entrants[1 + i].f = f;
          await level(f, g.lv);
        }),
        ...setup.coms.map(async (c, i) => {
          const x = right - (i % 2) * 120;
          const z = mid + (i - 1) * 40;
          const f = await d.addCom(
            `chars/${c.key}`,
            entrants[comAt + i].team,
            x,
            z,
            comSkill(c.lv),
          );
          if (!f) return;
          f.showBars = true;
          entrants[comAt + i].f = f;
          await level(f, c.lv);
        }),
      ]);
      // the camera keeps everyone at this machine in view
      if (guests.length) d.camera.group = entrants.filter((x) => x.human && x.f).map((x) => x.f!);
      ready = true;
      setLoading(false);
    });

    const stop = runLoop(
      d.world,
      () => {
        const [input, ...rest] = controls.sample();
        if (!ready) return;
        const locals = new Map<number, InputState>();
        guests.forEach((_, i) => {
          const f = entrants[1 + i].f;
          if (f) locals.set(f.id, rest[i]);
        });
        d.step(input, locals);
        const tick = d.world.tick;
        const p = entrants[0].f;
        const read = (f: Fighter, name: string, honor?: number): Vitals => ({
          name,
          charId: f.data.attrs.id,
          honor,
          hp: f.hp,
          maxHp: f.maxHp,
          mp: f.mp,
          maxMp: f.maxMp,
          sp: f.sp,
          maxSp: f.maxSp,
          status: [...f.status.keys()],
        });
        if (p && tick % 3 === 0) setVitals(read(p, me.name, getActiveProfile()?.honor ?? 0));
        const g = guests.length ? entrants[1].f : null;
        if (g && tick % 3 === 0) setVitals2(read(g, entrants[1].name));
        if (tick % 30 === 0) setSeconds(Math.floor(tick / 30));
        if (comboN && tick - comboAt > 60) {
          comboN = 0;
          setCombo((c) => ({ ...c, n: 0 }));
        }
        // last team standing; the board comes up once the losers are down
        if (!endAt) {
          const winner = decided(
            entrants.filter((x) => x.f).map((x) => ({ team: x.team, hp: x.f!.hp })),
          );
          if (winner !== null) endAt = tick + 45;
        } else if (tick === endAt) {
          const winner = decided(
            entrants.filter((x) => x.f).map((x) => ({ team: x.team, hp: x.f!.hp })),
          );
          const won = winner === entrants[0].team;
          const prev = getActiveProfile()?.honor ?? 0;
          const r = settleHonor(prev, won, entrants[0].kos);
          // 合體's 冰．念源體: beating the dark characters in VS may give one (fusion.ts)
          const dark = setup.coms.some((c) => c.key.startsWith("dark"));
          const ice = won && nianyuanDrop({ mode: "vs", dark }, Math.random(), Math.random());
          const item = ice ? itemsRef.current.get(ice) : undefined;
          updateActiveProfile((pr) => {
            const inv = item ? add(pr.inv ?? emptyInventory(), item) : null;
            return { ...pr, honor: r.honor, ...(inv ? { inv } : {}) };
          });
          audio.sfx(won ? "johnnyallright.wav" : "johnnymove.wav");
          setOutcome({ won, line: r.line, honor: r.honor, rank: r.rank });
          setBoard(entrants.map((x) => ({ ...x })));
        }
      },
      (frame) => {
        d.setViewWidth((el.clientWidth * 600) / Math.max(1, el.clientHeight));
        scene.draw(undefined, frame);
      },
    );
    return () => {
      stop();
      controls.dispose();
      scene.destroy();
      audio.music(null);
    };
  }, [story, setup, queryClient]);

  // 王者爭霸: the round closes with this result; the final's winner takes the cup's honor
  const backToCup = (won: boolean) => {
    const b = useCup.getState().bracket;
    if (b) {
      const next = playRound(b, won);
      if (next.champion !== null && next.champion === yourTeam(next).id)
        updateActiveProfile((p) => ({ ...p, honor: p.honor + CUP_HONOR }));
      useCup.getState().set(next);
    }
    void navigate({ to: "/play/champion" });
  };

  const winners = board && outcome ? board.filter((x) => x.f && x.f.hp > 0).map((x) => x.team) : [];

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <LoadingScreen show={loading} />
      {vitals && !board && <StatusBox v={vitals} scale={scale} />}
      {vitals2 && !board && <StatusBox v={vitals2} scale={scale} corner="tr" />}
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
                  x.human ? x.name : `${x.name} COM`,
                  x.lv,
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
                actions={
                  cup
                    ? [{ label: t`繼續`, run: () => backToCup(outcome.won) }]
                    : [
                        { label: t`再來一局`, run: onAgain },
                        { label: t`離開遊戲室`, run: () => void navigate({ to: "/play/vs" }) },
                      ]
                }
              />
            </Screen>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
