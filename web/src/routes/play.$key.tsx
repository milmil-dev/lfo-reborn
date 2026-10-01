import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyCaps } from "@/components/lfo";
import { audio } from "@/game/audio";
import { Effects } from "@/game/effects";
import type { Fighter } from "@/game/core/fighter";
import { EMPTY_INPUT, type InputState, type Move } from "@/game/core/types";
import { World } from "@/game/core/world";
import { Controls, keyLabel } from "@/game/input";
import { BASE, loadChar, loadForm, loadSprite, loadStage, runLoop, Scene } from "@/game/render";
import { MetalButton } from "@/game/kit/buttons";
import { SkillTable } from "@/game/kit/skill-table";
import { HitCounter, StatusBox, useHudScale } from "@/game/story/hud";
import { useActiveProfile } from "@/game/profiles";
import { charge, drain, NO_TRAN, press, ready } from "@/game/transform";
import { StartGate } from "@/game/ui";
import { LoadingScreen } from "@/game/kit/loading";
import { q } from "@/lib/api";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/play/$key")({
  loader: async ({ params }) => {
    const player = await loadChar(params.key);
    const dummy = await loadChar(params.key === "victor" ? "ricky" : "victor");
    const stage = await loadStage("gate");
    // 異轉: the training ground lets any character with a transformed form use it
    const form = await loadForm(player.data.attrs.id).catch(() => null);
    return { player, dummy, stage, form };
  },
  component: Training,
  pendingComponent: () => <LoadingScreen show />,
});

// the floor of the school-gate stage (school2_base.png, 1652 × 604)
// the whole gravel yard of the gate stage, from the building's foot down to the fence
const FLOOR = { minZ: 250, maxZ: 590 };

type Hud = { hp: number; maxHp: number; mp: number; maxMp: number; status: string[] };
type LogKey = { id: number; keys: string };

function Training() {
  const { t } = useLingui();
  const scale = useHudScale();
  // entered from the lobby (VS mode) with a profile, or straight from 選擇角色
  const inLobby = useActiveProfile() !== null;
  const { player, dummy, stage, form } = Route.useLoaderData();
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<Hud | null>(null);
  const [foe, setFoe] = useState<Hud | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [lit, setLit] = useState<Move | null>(null);
  const [log, setLog] = useState<LogKey[]>([]);
  const [combo, setCombo] = useState({ n: 0, dmg: 0, id: 0 });
  const [opts, setOpts] = useState({ infiniteMp: true, dummyGuard: false, list: true });
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const resetRef = useRef<() => void>(() => {});
  const dropRef = useRef<() => void>(() => {});
  // 異轉能量計, mirrored from the loop for the HUD
  const [tran, setTran] = useState(NO_TRAN);
  const tranRef = useRef<() => void>(() => {});
  // where the 出招表 was dragged to: kept while it is closed and reopened with Tab
  const tableArea = useRef<HTMLDivElement>(null);
  const tableX = useMotionValue(0);
  const tableY = useMotionValue(0);
  const leave = useCallback(() => {
    if (inLobby) void navigate({ to: "/play/lobby" });
    else void navigate({ to: "/play", search: { pick: player.data.key } });
  }, [inLobby, navigate, player.data.key]);

  const { data: detail } = useQuery(q.character(player.data.attrs.id));
  const skillBySlot = new Map((detail?.skills ?? []).map((s) => [s.slot, s]));
  // the game loop is created once; it reads skill names (which load later) through this ref
  const skillsRef = useRef(skillBySlot);
  skillsRef.current = skillBySlot;

  const onStart = useCallback(() => audio.music("lfo_school1.ogg", 0.3), []);

  useEffect(() => {
    if (!host.current) return;
    const scene = new Scene(host.current, { stage });
    const world = new World({ minX: 60, maxX: stage.width - 60, ...FLOOR });
    const me = world.spawn(player.data, 1, 700, 530, 1);
    const foe = world.spawn(dummy.data, 2, 900, 530, -1);
    foe.showBars = true;
    void scene.add(me, player);
    void scene.add(foe, dummy);
    const fx = new Effects(world, scene);
    fx.preload(player.data);
    fx.preload(dummy.data);
    const controls = new Controls();
    let comboN = 0;
    let comboDmg = 0;
    let lastHit = 0;
    let prevInput: InputState = { ...EMPTY_INPUT };
    let keyId = 0;

    // 異轉: swap the player's data and sprite for the transformed form and back
    let tr = NO_TRAN;
    const become = (to: typeof player, action?: string) => {
      me.morph(to.data, action);
      scene.remove(me);
      void scene.add(me, to);
      fx.preload(to.data);
    };
    tranRef.current = () => {
      if (!form) return;
      const next = press(tr);
      if (next.active && !tr.active) become(form);
      else if (!next.active && tr.active) become(player, "STAND");
      tr = next;
      setTran(tr);
    };
    if (import.meta.env.DEV)
      Object.assign(window, {
        __lfo: { world, me, foe, controls, fillTran: () => (tr = charge(tr, 1e9)) },
      });

    // I drops a field item from the sky next to the player: one of each kind in turn, then the rest
    let itemOrder: number[] = [];
    let dropN = 0;
    void fetch(`${BASE}/sprites/items.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ id: number; type: number }[]>) : []))
      .then((list) => {
        const firsts: number[] = [];
        const seen = new Set<number>();
        for (const i of list) {
          if (seen.has(i.type)) continue;
          seen.add(i.type);
          firsts.push(i.id);
        }
        itemOrder = [...firsts, ...list.map((i) => i.id).filter((id) => !firsts.includes(id))];
      });
    dropRef.current = () => {
      if (!itemOrder.length) return;
      const id = itemOrder[dropN++ % itemOrder.length];
      void loadSprite(`sprites/${id}`).then((a) => {
        const it = world.spawn(a.data, 0, me.x + me.facing * 70, me.z, me.facing);
        it.y = -160;
        void scene.add(it, a);
      });
    };

    resetRef.current = () => {
      for (const [f, x, face] of [
        [me, 700, 1],
        [foe, 900, -1],
      ] as [Fighter, number, 1 | -1][]) {
        f.x = x;
        f.z = 530;
        f.y = f.vx = f.vy = f.vz = 0;
        f.facing = face;
        f.hp = f.maxHp;
        f.mp = f.maxMp;
        f.goto(f.action("STAND"));
      }
    };

    const stop = runLoop(
      world,
      () => {
        me.infiniteMp = optsRef.current.infiniteMp;
        const input = controls.sample();
        const foeInput = optsRef.current.dummyGuard
          ? { ...EMPTY_INPUT, defend: foe.anim === "STAND" || foe.anim.startsWith("GUARD") }
          : EMPTY_INPUT;
        const events = world.step(
          new Map([
            [me.id, input],
            [foe.id, foeInput],
          ]),
        );
        fx.update(events);

        // input history: one entry per newly pressed button group
        const fresh = (Object.keys(input) as (keyof InputState)[]).filter(
          (b) => input[b] && !prevInput[b],
        );
        prevInput = input;
        if (fresh.length) {
          const code = fresh
            .map(
              (b) =>
                ({
                  defend: "G",
                  attack: "A",
                  jump: "J",
                  up: "U",
                  down: "D",
                  item: "",
                  drop: "",
                  left: me.facing < 0 ? "F" : "B",
                  right: me.facing > 0 ? "F" : "B",
                })[b],
            )
            .join("");
          const id = ++keyId;
          setLog((l) => [...l.slice(-9), { id, keys: code }]);
        }

        for (const e of events) {
          if (e.type === "sound") audio.sfx(e.name, { volume: 0.6, pan: (e.x - me.x) / 600 });
          else if (e.type === "move" && e.fighter === me.id) {
            setLit(e.move);
            setBanner({ id: world.tick, text: skillsRef.current.get(e.move.slot)?.name ?? e.name });
          } else if (e.type === "hit") {
            scene.spark(e.x, e.y, e.blocked);
            scene.damage(e.x, e.y - 30, e.damage, e.blocked);
            audio.sfx(e.blocked ? "guard.wav" : `hit${1 + (world.tick % 3)}.wav`, { volume: 0.7 });
            scene.quake(e.blocked ? 3 : Math.min(14, 4 + e.damage / 8));
            if (
              form &&
              !e.blocked &&
              world.fighters.find((f) => f.id === e.attacker)?.team === me.team
            ) {
              const was = ready(tr);
              tr = charge(tr, e.damage);
              if (!was && ready(tr)) audio.sfx("ready_transform.wav", { volume: 0.9 });
            }
            if (e.attacker === me.id) {
              comboN = world.tick - lastHit < 45 ? comboN + 1 : 1;
              comboDmg = comboN === 1 ? e.damage : comboDmg + e.damage;
              lastHit = world.tick;
              setCombo({ n: comboN, dmg: comboDmg, id: world.tick });
            }
          } else if (e.type === "land" && e.fighter === foe.id && foe.anim.includes("BOUNCE")) {
            audio.sfx("fall.wav", { volume: 0.5 });
            scene.quake(6);
          }
        }
        // a transformed form drains its gauge and ends when it runs dry or the player goes down
        if (tr.active) {
          const was = tr;
          tr = me.hp <= 0 ? NO_TRAN : drain(tr);
          if (was.active && !tr.active) become(player, "STAND");
        }
        // the dummy never stays down for good: back to full once it lies down, then it gets up
        if (foe.hp <= 0 && /LIEDOWN/.test(foe.anim)) foe.hp = foe.maxHp;

        if (world.tick % 3 === 0) {
          setMe({
            hp: me.hp,
            maxHp: me.maxHp,
            mp: me.mp,
            maxMp: me.maxMp,
            status: [...me.status.keys()],
          });
          setTran(tr);
          setFoe({
            hp: foe.hp,
            maxHp: foe.maxHp,
            mp: foe.mp,
            maxMp: foe.maxMp,
            status: [...foe.status.keys()],
          });
        }
      },
      () => scene.draw(me),
    );

    return () => {
      stop();
      controls.dispose();
      scene.destroy();
    };
  }, [player, dummy, stage, form]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") leave();
      else if (e.code === "KeyR") resetRef.current();
      else if (e.code === "KeyU") dropRef.current();
      else if (e.code === "KeyY") tranRef.current();
      else if (e.code === "KeyM") setOpts((o) => ({ ...o, infiniteMp: !o.infiniteMp }));
      else if (e.code === "KeyG") setOpts((o) => ({ ...o, dummyGuard: !o.dummyGuard }));
      else if (e.code === "Tab") {
        e.preventDefault();
        setOpts((o) => ({ ...o, list: !o.list }));
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [leave]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(id);
  }, [banner]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={onStart} />
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />

      {/* status boxes (kit) */}
      {me && (
        <StatusBox
          v={{
            name: tran.active && form ? form.data.name : player.data.name,
            charId: player.data.attrs.id,
            hp: me.hp,
            maxHp: me.maxHp,
            mp: me.mp,
            maxMp: me.maxMp,
            sp: 100,
            status: me.status,
          }}
          scale={scale}
          tran={
            form
              ? {
                  gauge: tran.gauge,
                  active: tran.active,
                  ready: ready(tran),
                  icon: player.data.attrs.id,
                  keyHint: "Y",
                  onPress: () => tranRef.current(),
                }
              : undefined
          }
        />
      )}
      {foe && (
        <StatusBox
          corner="tr"
          v={{
            name: dummy.data.name,
            charId: dummy.data.attrs.id,
            hp: foe.hp,
            maxHp: foe.maxHp,
            mp: foe.mp,
            maxMp: foe.maxMp,
            sp: 100,
            status: foe.status,
          }}
          scale={scale}
        />
      )}
      <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2">
        <MetalButton onClick={leave} className="h-[32px] w-[140px] text-[14px]">
          {inLobby ? t`返回大廳` : t`返回選角`}
        </MetalButton>
      </div>

      {/* combo counter (kit) */}
      <HitCounter hits={combo.n} id={combo.id} scale={scale} top={140} />
      <AnimatePresence>
        {combo.n > 1 && (
          <motion.p
            key={`dmg-${combo.id}`}
            className="pointer-events-none absolute right-6 z-10 font-lfo text-sm text-white/80 [text-shadow:0_1px_2px_#000]"
            style={{ top: 250 * scale }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { delay: 1 } }}
          >
            {combo.dmg} DMG
          </motion.p>
        )}
      </AnimatePresence>

      {/* special move banner */}
      <AnimatePresence>
        {banner && (
          <motion.p
            key={banner.id}
            className="pointer-events-none absolute inset-x-0 top-[28%] z-10 text-center font-black text-[clamp(2.5rem,6vw,5rem)] italic tracking-tight [text-shadow:0_6px_30px_rgb(0_0_0/0.7)]"
            initial={{ opacity: 0, scale: 1.6, letterSpacing: "0.4em" }}
            animate={{ opacity: 1, scale: 1, letterSpacing: "0em" }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {banner.text}
          </motion.p>
        )}
      </AnimatePresence>

      {/* 出招表: the client's skill table, opened in the middle and dragged by its frame */}
      <div
        ref={tableArea}
        className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
      >
        <AnimatePresence>
          {opts.list && (
            <motion.aside
              drag
              dragConstraints={tableArea}
              dragMomentum={false}
              dragElastic={0}
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              style={{ x: tableX, y: tableY, scale: Math.min(1.25, scale * 1.1) }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: Math.min(1.25, scale * 1.1) }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <SkillTable
                data={tran.active && form ? form.data : player.data}
                skills={skillBySlot}
                mp={me?.mp ?? 0}
                lit={lit}
                onClose={() => setOpts((o) => ({ ...o, list: false }))}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* input history + controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-6 bg-gradient-to-t from-black/80 to-transparent p-5 pt-16">
        <ol className="flex flex-wrap items-center gap-2">
          {log.map((k) => (
            <motion.li key={k.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <KeyCaps keys={[k.keys]} />
            </motion.li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-end gap-2 text-foreground/70 text-xs">
          <Hint k="← → ↑ ↓" label={t`移動（連按 → 跑）`} />
          <Hint k={keyLabel("attack")} label={t`攻`} />
          <Hint k={keyLabel("jump")} label={t`跳`} />
          <Hint k={keyLabel("defend")} label={t`防`} />
          <Hint k="R" label={t`重置`} />
          <Hint k="U" label={t`掉落道具`} />
          {form && <Hint k="Y" label={t`異轉`} active={ready(tran) || tran.active} />}
          <Hint
            k="M"
            label={opts.infiniteMp ? t`無限元力 開` : t`無限元力 關`}
            active={opts.infiniteMp}
          />
          <Hint
            k="G"
            label={opts.dummyGuard ? t`沙包防禦 開` : t`沙包防禦 關`}
            active={opts.dummyGuard}
          />
        </div>
      </div>
    </div>
  );
}

function Hint({ k, label, active }: { k: string; label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-[5px] border-2 border-[#3b3f46] bg-[linear-gradient(#5d626a,#2e3238)] px-3 py-1 text-white/80",
        active && "bg-[linear-gradient(#fff1b0,#c98a00)] text-[#3a2600]",
      )}
    >
      <kbd className="font-mono font-bold text-foreground">{k}</kbd>
      {label}
    </span>
  );
}
