import { useLingui } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "@/game/audio";
import { Effects } from "@/game/effects";
import { Controls } from "@/game/input";
import { KeyConfig } from "@/game/key-config";
import {
  applyLevel,
  withFusionBonus,
  withTranCaps,
  expScale,
  gainExp,
  monsterExp,
  type StatTable,
  statTable,
} from "@/game/leveling";
import { MetalButton } from "@/game/kit/buttons";
import { ChromeTitle, ResultBoard } from "@/game/kit/result";
import { type Beast, beastLevel, downLine, raidLine, rollRaid } from "@/game/beasts";
import { dropHeld } from "@/game/core/items";
import type { Fighter } from "@/game/core/fighter";
import {
  add,
  durFromHp,
  equipBonus,
  FIELD_ITEM_TYPES,
  fieldHp,
  type Owned,
  rollLoot,
  settle,
} from "@/game/inventory";
import { useItemTable } from "@/game/items-data";
import { Backpack } from "@/game/kit/backpack";
import { HudRestore, TabBlock } from "@/game/kit/chat";
import { CharaCard, Popup, SkillList, Smiley, SmileyBox, type SmileyDef } from "@/game/kit/panels";
import { FloatingPanel } from "@/game/kit/floating";
import { nianyuanDrop } from "@/game/fusion";
import { skillLevel } from "@/game/core/skills";
import {
  addSkillExp,
  awardExp,
  getActiveProfile,
  getSkillExp,
  fusionOf,
  getInventory,
  hasToken,
  playKey,
  saveInventory,
  useInventory,
  useMoney,
} from "@/game/profiles";
import { charge, drain, NO_TRAN, press, ready as tranReady, unlocked } from "@/game/transform";
import { Screen } from "@/game/screen";
import { BASE, type CharAssets, loadChar, loadForm, loadSprite, runLoop } from "@/game/render";
import { catalogQuery, stageLabel } from "@/game/stage-select";
import { Director, type StoryStatus } from "@/game/story/director";
import {
  BottomBar,
  ChapterCard,
  DialogFrame,
  GoArrow,
  HitCounter,
  KEY_NAME,
  KeyBox,
  MiniMap,
  StatusBox,
  useHudScale,
  type Vitals,
} from "@/game/story/hud";
import { RoomScene } from "@/game/story/room-scene";
import type { DialogueLine, StoryData } from "@/game/story/types";
import { StartGate } from "@/game/ui";
import { LoadingScreen } from "@/game/kit/loading";
import { KEY } from "@/lib/storage-keys";
import { asset, q } from "@/lib/api";
import { cn } from "@/lib/cn";
import { usePageTitle } from "@/lib/title";

export const Route = createFileRoute("/play/story/$story")({
  loader: async ({ params, context: { queryClient } }) => {
    // the catalog names the stage (tab title, result board); fetched alongside the stage itself
    void queryClient.prefetchQuery(catalogQuery);
    const res = await fetch(`${BASE}/stories/${params.story}.json`);
    if (!res.ok) throw new Error(`story ${params.story} not found`);
    return (await res.json()) as StoryData;
  },
  component: StoryPage,
  pendingComponent: () => <LoadingScreen show />,
});

type Talk = { lines: DialogueLine[]; i: number; done: () => void };
type Score = {
  seconds: number;
  /** damage dealt, EXP earned this run, and the level / EXP into it */
  damage: number;
  exp: number;
  lv: number;
  lvExp: number;
  hits: number;
  hitId: number;
  best: number;
  kos: number;
};

function StoryPage() {
  const story = Route.useLoaderData();
  const { data: catalog } = useQuery(catalogQuery);
  const entry = catalog?.find((e) => e.key === story.key);
  usePageTitle(catalog ? (entry ? stageLabel(entry) : story.key) : null);
  const [run, setRun] = useState(0); // bumping this restarts the story from the top
  const [started, setStarted] = useState(false);
  const onStart = useCallback(() => setStarted(true), []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={onStart} />
      {started && <StoryRun key={run} story={story} onRetry={() => setRun((r) => r + 1)} />}
    </div>
  );
}

function StoryRun({ story, onRetry }: { story: StoryData; onRetry: () => void }) {
  const { t } = useLingui();
  // the stage's own name for the result board (第 n 話 for story lines)
  const { data: catalog } = useQuery(catalogQuery);
  const entry = catalog?.find((e) => e.key === story.key);
  const stageName = entry ? stageLabel(entry) : story.key;
  // read from inside the stage's loop, which must not restart when the catalog arrives
  const stageNameRef = useRef(stageName);
  stageNameRef.current = stageName;
  // where this stage sits (story / mission, chapter), for the 念源體 a clear may give
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const navigate = useNavigate();
  const scale = useHudScale();
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<StoryStatus | null>(null);
  // the loading screen stays up until the first room and the cast are in
  const [loading, setLoading] = useState(true);
  const [talk, setTalk] = useState<Talk | null>(null);
  const [title, setTitle] = useState<{ top: string; bottom: string } | null>(null);
  const [fade, setFade] = useState({ to: 1, ms: 0 });
  const [vitals, setVitals] = useState<Vitals | null>(null);
  // 小地圖: the room you are in, your place in it, and the others in that room
  const [where, setWhere] = useState<{ bg: number; me: number; others: number[] } | null>(null);
  const queryClient = useQueryClient();
  const items = useItemTable();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // "獲得 …" when loot goes into the backpack
  const [gain, setGain] = useState<{ id: number; name: string; icon: string | null } | null>(null);
  // 兇獸突襲 announcements, in the client's own words
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  // 鑰匙: the key ring, as the director reports it
  const [keys, setKeys] = useState<number[]>([]);
  // the locked-door line, read by the game loop (which must not restart when the language does)
  const lockedRef = useRef((key: number) => t`這道門鎖上了，需要「${KEY_NAME[key] ?? t`鑰匙`}」。`);
  lockedRef.current = (key: number) => t`這道門鎖上了，需要「${KEY_NAME[key] ?? t`鑰匙`}」。`;
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 2400);
    return () => clearTimeout(t);
  }, [gain]);
  const [score, setScore] = useState<Score>(() => {
    const p = getActiveProfile();
    return {
      seconds: 0,
      damage: 0,
      exp: 0,
      lv: p?.lv ?? 1,
      lvExp: p?.exp ?? 0,
      hits: 0,
      hitId: 0,
      best: 0,
      kos: 0,
    };
  });
  const [menu, setMenu] = useState<
    "none" | "pause" | "keys" | "item" | "chara" | "skill" | "smiley"
  >("none");
  // a smiley picked from the chara block plays over the player's head for a while
  const [smiley, setSmiley] = useState<{ id: number; s: SmileyDef } | null>(null);
  useEffect(() => {
    if (!smiley) return;
    const id = setTimeout(() => setSmiley(null), 2600);
    return () => clearTimeout(id);
  }, [smiley]);
  const headTag = useRef<HTMLDivElement>(null);
  // the block's corner triangle folds the HUD away, leaving only the triangle
  const [hudHidden, setHudHidden] = useState(false);
  // 異轉能量計 (shown once the character may transform), mirrored from the loop
  const [tran, setTran] = useState<typeof NO_TRAN | null>(null);
  const tranRef = useRef<() => void>(() => {});
  // 出招表: a click on a skill icon performs it
  const castRef = useRef<(slot: number) => void>(() => {});
  // 道具欄: the backpack's field items (potions, weapons, throwables), ten slots after the fist
  const bag = useInventory().bag;
  const money = useMoney();
  const bar = useMemo(() => {
    const out: { id: number; uids: number[] }[] = [];
    for (const o of bag) {
      const item = items.get(o.id);
      if (!item || !FIELD_ITEM_TYPES.has(item.type)) continue;
      const row = out.find((r) => r.id === o.id);
      if (row) row.uids.push(o.uid);
      else if (out.length < 10) out.push({ id: o.id, uids: [o.uid] });
    }
    return out;
  }, [items, bag]);
  const [slot, setSlot] = useState(0);
  const barRef = useRef(bar);
  barRef.current = bar;
  const slotRef = useRef(slot);
  slotRef.current = slot;
  // 1 … 9, 0 pick a slot; ` goes back to the fist (bare hands)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = e.code.match(/^Digit(\d)$/);
      if (m) setSlot(m[1] === "0" ? 10 : Number(m[1]));
      else if (e.code === "Backquote") setSlot(0);
      else if (e.code === "KeyY") tranRef.current();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const pausedRef = useRef(false);
  // the skill table floats over the fight (its icons cast); every other menu holds the stage
  pausedRef.current = menu !== "none" && menu !== "skill";

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    let director: Director | null = null;
    let combo = { n: 0, last: -99 };
    let best = 0;
    const downed = new Set<number>();
    let damage = 0;
    let gained = 0;
    // level progress: the active profile's (saved as it grows), or a guest run's own
    const profile = getActiveProfile();
    let prog = { lv: profile?.lv ?? 1, exp: profile?.exp ?? 0 };
    let table: StatTable | null = null;
    let leveled: number | null = null; // fighter id the level was applied to
    let prevBar = { item: false, drop: false };
    // 兇獸突襲: whether this run meets a beast (rolled once), and the beast once it is in
    let raid: Beast | null = null;
    let beast: Fighter | null = null;
    let roomsSeen = 0;
    void fetch(`${BASE}/beasts.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Beast[]>) : []))
      .then((list) => {
        // dev: sessionStorage lfo-reborn.forceRaid = "1" makes every run meet the first beast
        const forced = import.meta.env.DEV && sessionStorage.getItem(KEY.forceRaid) === "1";
        raid = forced ? (list[0] ?? null) : rollRaid(list);
      })
      .catch(() => {});
    // 異轉: the base and transformed sprites once the character qualifies (LV 150 + 信物)
    let tr = NO_TRAN;
    let forms: { base: CharAssets; form: CharAssets } | null = null;
    const become = (to: CharAssets, action?: string) => {
      const me = director?.player;
      if (!me) return;
      me.morph(to.data, action);
      scene.remove(me);
      void scene.add(me, to);
    };
    tranRef.current = () => {
      if (!forms || director?.drama) return;
      const next = press(tr);
      if (next.active && !tr.active) become(forms.form);
      else if (!next.active && tr.active) become(forms.base, "STAND");
      tr = next;
      setTran(tr);
    };
    // 耐久度: the copies the player brought into the stage, written back when it ends
    const carried = new Map<Fighter, { copy: Owned; from: "equip" | "bag"; max: number }>();
    const carry = (f: Fighter | null, copy: Owned, from: "equip" | "bag") => {
      const item = itemsRef.current.get(copy.id);
      if (!f || !item) return;
      const max = f.hp;
      f.hp = fieldHp(copy, item, max);
      carried.set(f, { copy, from, max });
    };
    let settled = false;
    let cleared = false;
    const settleCarried = () => {
      if (settled || !getActiveProfile()) return;
      settled = true;
      const d = director;
      const back = [...carried].flatMap(([f, c]) => {
        const item = itemsRef.current.get(c.copy.id);
        if (!item) return [];
        // still in hand or lying in the room: the player has it; used up or broken: gone
        const kept = !f.dead && !!d?.world.fighters.includes(f);
        return [
          { copy: c.copy, from: c.from, dur: f.dead ? 0 : durFromHp(f.hp, c.max, item), kept },
        ];
      });
      if (back.length) saveInventory(settle(getInventory(), back));
    };
    const scene = new RoomScene(el, () => ({ x: director?.camera.x ?? 0, height: 600 }));
    director = new Director(
      story,
      {
        load: (path) => loadSprite(path),
        added: (f, path) => void loadSprite(path).then((a) => scene.add(f, a)),
        removed: (f) => scene.remove(f),
        room: async (room) => scene.setRoom(room),
        entered: () => {
          roomsSeen++;
          const d = director;
          // the beast comes in at the run's second room
          if (roomsSeen === 2 && raid && d && !beast) {
            const lv = beastLevel(prog.lv);
            void d.spawnBeast(`sprites/${raid.sprite}`, lv).then((f) => {
              if (!f) return;
              beast = f;
              audio.sfx("ready_transform.wav", { volume: 0.8 });
              setNotice({ id: Date.now(), text: raidLine(stageNameRef.current) });
              void queryClient
                .fetchQuery(q.character(f.data.attrs.id))
                .then((c) => applyLevel(f, statTable(c), lv))
                .catch(() => {});
            });
          }
        },
        preload: (room) => scene.preload(room),
        // doors: push into the doorway under a light veil, then ease back out in the new room
        door: (phase, x, y) =>
          phase === "out" ? scene.zoomTo(x, y, 1.35, 0.55, 220) : scene.zoomTo(x, y, 1, 0, 280),
        talk: (lines) =>
          new Promise<void>((done) => {
            audio.sfx("johnnymove.wav", { volume: 0.4 });
            setTalk({ lines, i: 0, done });
          }),
        title: setTitle,
        fade: (to, ms) =>
          new Promise<void>((done) => {
            setFade({ to, ms });
            setTimeout(done, ms);
          }),
        music: (file) => audio.music(file, 0.35),
        sound: (file) => audio.sfx(file, { volume: 0.7 }),
        shake: (n) => scene.quake(n),
        keys: setKeys,
        locked: (key) => setNotice({ id: Date.now(), text: lockedRef.current(key) }),
        status: (s) => {
          setStatus(s);
          if (s.kind === "complete" || s.kind === "gameover") settleCarried();
          if (s.kind === "complete" && !cleared) {
            cleared = true;
            // 合體's 念源體 (fusion.ts): a clear may hand one out
            const e = entryRef.current;
            const id =
              e &&
              (e.mode === "story" || e.mode === "mission") &&
              nianyuanDrop({ mode: e.mode, chapter: e.chapter }, Math.random(), Math.random());
            const item = id ? itemsRef.current.get(id) : undefined;
            const next = item && getActiveProfile() && add(getInventory(), item);
            if (item && next) {
              saveInventory(next);
              audio.sfx("pick.wav", { volume: 0.8 });
              setGain({ id: Date.now() + 2, name: item.name, icon: item.icon });
            }
          }
          // exit arrows appear once the room's fight is over
          scene.showExits(!!s.clear && !s.enemies);
        },
        fx: (events) => {
          const d = director;
          const me = d?.player;
          for (const e of events) {
            if (e.type === "sound")
              audio.sfx(e.name, { volume: 0.5, pan: me ? (e.x - me.x) / 600 : 0 });
            // 招式等級: every special the player performs counts towards its level
            else if (e.type === "move" && me && e.fighter === me.id) {
              addSkillExp(e.move.slot);
              me.skillLevels[e.move.slot] = skillLevel(getSkillExp(e.move.slot));
            } else if (e.type === "hit") {
              scene.spark(e.x, e.y, e.blocked);
              scene.damage(e.x, e.y - 30, e.damage, e.blocked);
              audio.sfx(e.blocked ? "guard.wav" : `hit${1 + (e.damage % 3)}.wav`, { volume: 0.7 });
              scene.quake(e.blocked ? 3 : Math.min(12, 4 + e.damage / 8));
              // the player's hits, directly or through their effects
              const src = d?.world.fighters.find((f) => f.id === e.attacker);
              if (d && me && src && src.team === me.team && !e.blocked) {
                combo = { n: d.world.tick - combo.last < 45 ? combo.n + 1 : 1, last: d.world.tick };
                if (forms) {
                  const was = tranReady(tr);
                  tr = charge(tr, e.damage);
                  if (!was && tranReady(tr)) audio.sfx("ready_transform.wav", { volume: 0.9 });
                }
                damage += e.damage;
                best = Math.max(best, combo.n);
                const target = d.world.fighters.find((f) => f.id === e.target);
                if (target && target.hp <= 0 && !downed.has(target.id)) {
                  downed.add(target.id);
                  // the beast's 魔精石 goes to whoever brings it down
                  if (target === beast && raid) {
                    const stone = itemsRef.current.get(raid.stone);
                    setNotice({ id: Date.now(), text: downLine(raid.name, me.data.name) });
                    const next = stone && add(getInventory(), stone);
                    if (stone && next && getActiveProfile()) {
                      saveInventory(next);
                      setGain({ id: Date.now() + 1, name: stone.name, icon: stone.icon });
                    }
                  }
                  // 升級: a KO pays the monster's EXP, scaled by the level difference
                  const amount = Math.round(
                    monsterExp(target.level, target.reward) *
                      expScale(prog.lv, target.level) *
                      target.rewardScale,
                  );
                  gained += amount;
                  const saved = awardExp(amount);
                  const r = saved
                    ? { level: saved.profile.lv, exp: saved.profile.exp, gained: saved.gained }
                    : gainExp(prog.lv, prog.exp, amount);
                  prog = { lv: r.level, exp: r.exp };
                  if (r.gained && table) {
                    applyLevel(
                      me,
                      table,
                      prog.lv,
                      equipBonus(getInventory(), itemsRef.current),
                      getActiveProfile()?.points,
                    );
                    me.pendingLevelUp = true;
                  }
                  // 掉寶: the stage's loot table; field items fall where the enemy was, the rest
                  // goes into the backpack
                  const drop = story.loot?.length ? rollLoot(story.loot) : null;
                  const item = drop === null ? undefined : itemsRef.current.get(drop);
                  if (drop !== null && (!item || FIELD_ITEM_TYPES.has(item.type)))
                    void d.dropItem(drop, target.x, target.z);
                  else if (item) {
                    const next = add(getInventory(), item);
                    if (next && getActiveProfile()) {
                      saveInventory(next);
                      audio.sfx("pick.wav", { volume: 0.8 });
                      setGain({ id: Date.now(), name: item.name, icon: item.icon });
                    }
                  }
                }
                setScore((s) => ({
                  ...s,
                  damage,
                  exp: gained,
                  lv: prog.lv,
                  lvExp: prog.exp,
                  best,
                  kos: downed.size,
                  hits: combo.n,
                  hitId: combo.n === 1 ? d.world.tick : s.hitId,
                }));
              }
            } else if (
              e.type === "land" &&
              director?.world.fighters.find((f) => f.id === e.fighter)?.anim.includes("BOUNCE")
            ) {
              audio.sfx("fall.wav", { volume: 0.4 });
            }
          }
        },
      },
      // the active profile plays as its own character; a guest run keeps the line's lead
      profile ? `chars/${playKey(profile)}` : undefined,
    );
    const d = director;
    d.effects = new Effects(d.world, scene);
    castRef.current = (slot) => {
      if (!d.drama) d.player?.cast(slot);
    };
    const controls = new Controls();
    if (import.meta.env.DEV)
      Object.assign(window, {
        __lfo: { director: d, scene, fillTran: () => (tr = charge(tr, 1e9)) },
      });

    let ready = false;
    void d.start().then(() => {
      ready = true;
      setLoading(false);
      setFade({ to: 0, ms: 500 });
    });
    const stop = runLoop(
      d.world,
      () => {
        const input = controls.sample();
        if (!ready || pausedRef.current) return;
        // item: take the selected slot's item out of the backpack into the hands; drop: let go
        const hero = d.player;
        if (
          hero &&
          !d.drama &&
          input.item &&
          !prevBar.item &&
          slotRef.current > 0 &&
          !hero.holding &&
          hero.idle
        ) {
          const row = barRef.current[slotRef.current - 1];
          const uid = row?.uids[0];
          if (row && uid !== undefined) {
            const inv = getInventory();
            saveInventory({ ...inv, bag: inv.bag.filter((o) => o.uid !== uid) });
            const copy = inv.bag.find((o) => o.uid === uid);
            void d.giveItem(hero, row.id).then((f) => copy && carry(f, copy, "bag"));
          }
        }
        if (hero && input.drop && !prevBar.drop) dropHeld(hero);
        prevBar = { item: input.item, drop: input.drop };
        d.step(input);
        const p = d.player;
        const tick = d.world.tick;
        // the player's stats follow their level once the character's growth table is in
        if (p && leveled !== p.id) {
          leveled = p.id;
          const hero = p;
          hero.skillLevels = Object.fromEntries(
            Object.entries(getActiveProfile()?.skills ?? {}).map(([slot, exp]) => [
              slot,
              skillLevel(exp),
            ]),
          );
          // 合體: a 合體戰神 grows by its own character's table (he-ti.mdx 7), with the bonus
          const fused = fusionOf(getActiveProfile());
          const statId = fused ? getActiveProfile()!.charId : hero.data.attrs.id;
          void queryClient
            .fetchQuery(q.character(statId))
            .then(async (c) => {
              // qualified for 異轉: the form's higher att maximums apply (星奇 400 → 600)
              const tran =
                unlocked(prog.lv, hasToken(statId)) &&
                (await queryClient.fetchQuery(q.character(statId + 7000)).catch(() => null));
              table = withTranCaps(statTable(c), tran ? statTable(tran) : null);
              const inv = getInventory();
              applyLevel(
                hero,
                table,
                prog.lv,
                withFusionBonus(equipBonus(inv, itemsRef.current), !!fused),
                getActiveProfile()?.points,
              );
              // the weapon worn in the equipment box starts the stage in hand
              // 異轉: at LV 150 with the account's 信物 the gauge appears (a 合體戰神 has no form)
              const baseId = hero.data.attrs.id;
              if (!fused && unlocked(prog.lv, hasToken(baseId)))
                void Promise.all([loadChar(hero.data.key), loadForm(baseId)]).then(
                  ([base, form]) => {
                    if (!form) return;
                    forms = { base, form };
                    setTran(tr);
                  },
                );
              const held = inv.equip[3];
              if (held && held.dur > 0)
                void d.giveItem(hero, held.id).then((f) => carry(f, held, "equip"));
            })
            .catch(() => {
              // no API: the .spt stats stay
            });
        }
        if (combo.n && tick - combo.last > 60) {
          combo = { n: 0, last: -99 };
          setScore((s) => ({ ...s, hits: 0 }));
        }
        // a transformed form drains its gauge; it ends when the gauge runs dry or the player falls
        if (forms && tr.active) {
          tr = p && p.hp > 0 ? drain(tr) : NO_TRAN;
          if (!tr.active) become(forms.base, "STAND");
        }
        if (p && tick % 3 === 0) {
          if (forms) setTran(tr);
          const id = p.data.attrs.id;
          setVitals({
            name: d.story.names[String(id)] ?? p.data.name ?? p.data.nameEn,
            charId: id >= 7000 ? id - 7000 : id,
            honor: getActiveProfile()?.honor ?? 0,
            hp: p.hp,
            maxHp: p.maxHp,
            mp: p.mp,
            maxMp: p.maxMp,
            sp: p.sp,
            maxSp: p.maxSp,
            status: [...p.status.keys()],
          });
          const width = Number(d.story.rooms[String(d.bg)]?.width) || 0;
          setWhere({
            bg: d.bg,
            me: d.roomX(p.x),
            others: d.world.fighters
              .filter((f) => f !== p && f.hp > 0)
              .map((f) => d.roomX(f.x))
              .filter((x) => x >= 0 && x <= width),
          });
        }
        if (tick % 30 === 0) setScore((s) => ({ ...s, seconds: Math.floor(tick / 30) }));
      },
      (frame) => {
        d.setViewWidth((el.clientWidth * 600) / Math.max(1, el.clientHeight));
        scene.draw(undefined, frame);
        // keep the smiley tag over the player's head, where the sprite is drawn this frame
        const hero = d.player;
        if (hero && headTag.current) {
          const s = el.clientHeight / 600;
          const p = scene.renderPos(hero);
          headTag.current.style.transform = `translate(${(p.x - scene.cameraX) * s}px, ${(p.z + p.y - 96) * s}px) translate(-50%, -100%)`;
        }
      },
    );
    // closing or reloading the tab ends the stage too
    addEventListener("pagehide", settleCarried);
    return () => {
      removeEventListener("pagehide", settleCarried);
      settleCarried();
      stop();
      controls.dispose();
      scene.destroy();
      audio.music(null);
    };
  }, [story, queryClient]);

  const advance = useCallback(() => {
    setTalk((cur) => {
      if (!cur) return cur;
      if (cur.i + 1 < cur.lines.length) return { ...cur, i: cur.i + 1 };
      cur.done();
      return null;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || menu === "keys") return;
      setMenu((m) => (m === "none" ? "pause" : "none"));
      audio.sfx("johnnymove.wav", { volume: 0.5 });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [menu]);

  const over = status?.kind === "complete" || status?.kind === "gameover";
  const cinematic = status?.kind === "drama" || talk !== null;
  const hudOn = !!vitals && !cinematic && !over;
  const line = talk?.lines[talk.i];

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <LoadingScreen show={loading} />

      {hudOn && !hudHidden && vitals && (
        <>
          <KeyBox keys={keys} scale={scale} />
          <StatusBox
            v={vitals}
            scale={scale}
            tran={
              tran
                ? {
                    gauge: tran.gauge,
                    active: tran.active,
                    ready: tranReady(tran),
                    icon: vitals.charId,
                    keyHint: "Y",
                    onPress: () => tranRef.current(),
                  }
                : undefined
            }
          />
          <BottomBar
            scale={scale}
            seconds={score.seconds}
            level={score.lv}
            exp={score.lvExp}
            money={money}
            slots={bar.map((r) => {
              const item = items.get(r.id);
              return { icon: item?.icon ?? null, count: r.uids.length, name: item?.name ?? "" };
            })}
            selected={slot}
            onSelect={setSlot}
            onItem={() => {
              audio.sfx("johnnymove.wav", { volume: 0.5 });
              setMenu((m) => (m === "item" ? "none" : "item"));
            }}
          />
          <HitCounter hits={score.hits} id={score.hitId} scale={scale} top={90} />
          {where && (
            <MiniMap
              story={story}
              bg={where.bg}
              me={where.me}
              others={where.others}
              scale={scale}
            />
          )}
        </>
      )}
      {hudOn && hudHidden && (
        <HudRestore
          scale={scale}
          label={t`展開介面`}
          onClick={() => {
            audio.sfx("johnnymove.wav", { volume: 0.5 });
            setHudHidden(false);
          }}
        />
      )}
      {/* the chara block, standing on the bottom strip above its Item plate */}
      {hudOn && !hudHidden && (
        <div
          className="absolute right-0 bottom-0 z-20 h-[102px] w-[114px]"
          style={{
            transform: `translateY(${-33 * scale}px) scale(${scale})`,
            transformOrigin: "bottom right",
          }}
        >
          <TabBlock
            open={menu}
            labels={{
              chara: t`角色資料`,
              skill: t`技能`,
              friend: t`好友`,
              smiley: t`表情`,
              fight: t`暫停`,
              chat: t`聊天`,
              min: t`收起介面`,
            }}
            onPick={(b) => {
              audio.sfx("johnnymove.wav", { volume: 0.5 });
              if (b === "friend")
                setNotice({ id: Date.now(), text: t`好友名單：單機重現中沒有其他玩家在線。` });
              else if (b === "fight") setMenu((m) => (m === "pause" ? "none" : "pause"));
              else if (b === "chat")
                setNotice({ id: Date.now(), text: t`關卡中不能聊天，回到大廳再聊吧。` });
              else if (b === "min") setHudHidden(true);
              else setMenu((m) => (m === b ? "none" : b));
            }}
          />
        </div>
      )}
      <div ref={headTag} className="pointer-events-none absolute top-0 left-0 z-10 origin-top-left">
        <AnimatePresence>{smiley && <Smiley key={smiley.id} s={smiley.s} />}</AnimatePresence>
      </div>
      <AnimatePresence>
        {menu === "chara" && (
          <Popup key="chara" onClose={() => setMenu("none")}>
            <CharaCard onClose={() => setMenu("none")} />
          </Popup>
        )}
        {menu === "smiley" && (
          <Popup key="smiley" onClose={() => setMenu("none")}>
            <SmileyBox
              onPick={(s) => {
                setSmiley({ id: Date.now(), s });
                setMenu("none");
              }}
            />
          </Popup>
        )}
      </AnimatePresence>
      <FloatingPanel open={menu === "skill"} scale={Math.min(1.25, scale * 1.1)}>
        <SkillList
          mp={vitals?.mp}
          onCast={(m) => castRef.current(m.slot)}
          onClose={() => setMenu("none")}
        />
      </FloatingPanel>
      {/* the Item plate's 背包 / 裝備 — the stage waits while it is open */}
      <FloatingPanel open={menu === "item"} scale={Math.min(1.2, scale)}>
        <Backpack onClose={() => setMenu("none")} />
      </FloatingPanel>
      <GoArrow show={hudOn && !!status?.clear && !status.enemies} scale={scale} />
      <ChapterCard title={title} scale={scale} />
      <AnimatePresence>
        {notice && (
          <motion.p
            key={notice.id}
            className="pointer-events-none absolute top-[10%] left-1/2 z-20 -translate-x-1/2 rounded-[8px] bg-[#3a0a0e]/85 px-4 py-2 font-bold text-[16px] text-[#ffd27a] ring-2 ring-[#ff3b30]/60"
            initial={{ opacity: 0, scale: 1.2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            {notice.text}
          </motion.p>
        )}
        {gain && (
          <motion.div
            key={gain.id}
            className="pointer-events-none absolute top-[18%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-[10px] border-2 border-[#a9afb7] bg-[#0a0f16]/80 px-4 py-2 text-white shadow-[0_0_0_2px_#2e3238]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {gain.icon && (
              <img
                src={asset(gain.icon)}
                alt=""
                className="max-h-[36px] max-w-[48px] object-contain"
              />
            )}
            <span className="font-bold text-[15px]">{t`獲得 ${gain.name}`}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {talk && line && (
          <DialogueBox
            key="talk"
            line={line}
            name={line.sprite >= 0 ? story.names[String(line.sprite)] : undefined}
            onNext={advance}
            scale={scale}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none absolute inset-0 z-40 bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: fade.to }}
        transition={{ duration: fade.ms / 1000, ease: "easeInOut" }}
      />

      <AnimatePresence>
        {menu === "pause" && !over && (
          <Menu
            key="pause"
            heading={t`暫停`}
            items={[
              { label: t`繼續遊戲`, run: () => setMenu("none") },
              { label: t`按鍵設定`, run: () => setMenu("keys") },
              { label: t`重新開始`, run: onRetry },
              { label: t`離開故事`, run: () => void navigate({ to: "/play/story" }) },
            ]}
          />
        )}
        {menu === "keys" && <KeyConfig key="keys" onClose={() => setMenu("pause")} />}
        {over && (
          <div key="result" className="absolute inset-0 z-50 bg-black/60">
            <Screen>
              <ResultBoard
                heading={status?.kind === "gameover" ? "K.O." : "STAGE CLEAR"}
                title={
                  status?.kind === "gameover"
                    ? t`${vitals?.name ?? ""}倒下了……`
                    : t`${stageName} · 完成`
                }
                header={[
                  t`名稱`,
                  "LV",
                  t`時間`,
                  t`最高連擊`,
                  t`總傷害`,
                  t`擊倒`,
                  "EXP",
                  t`金錢`,
                  t`結果`,
                  "",
                  "",
                ]}
                rows={[
                  [
                    vitals?.name ?? "",
                    score.lv,
                    `${Math.floor(score.seconds / 60)}:${String(score.seconds % 60).padStart(2, "0")}`,
                    score.best,
                    score.damage,
                    score.kos,
                    score.exp,
                    0,
                    status?.kind === "gameover" ? "K.O." : "CLEAR",
                  ],
                ]}
                actions={
                  status?.kind === "gameover"
                    ? [
                        { label: t`再試一次`, run: onRetry },
                        { label: t`離開故事`, run: () => void navigate({ to: "/play/story" }) },
                      ]
                    : [
                        { label: t`離開故事`, run: () => void navigate({ to: "/play/story" }) },
                        { label: t`再玩一次`, run: onRetry },
                      ]
                }
              />
            </Screen>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ───────── dialogue: bust + name + original frame ───────── */

function DialogueBox({
  line,
  name,
  onNext,
  scale,
}: {
  line: DialogueLine;
  name?: string;
  onNext: () => void;
  scale: number;
}) {
  const [shown, setShown] = useState(0);
  const full = shown >= line.text.length;

  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => n + 1), 32);
    return () => clearInterval(id);
  }, [line]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!["Enter", "Space", "KeyJ", "KeyZ"].includes(e.code) || e.repeat) return;
      e.preventDefault();
      if (full) {
        audio.sfx("johnnymove.wav", { volume: 0.35 });
        onNext();
      } else setShown(line.text.length);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [full, line, onNext]);

  const narration = line.sprite < 0;
  return (
    <motion.div
      className="absolute bottom-0 left-1/2 z-30 w-[800px] cursor-pointer"
      style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: "bottom center" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={() => (full ? onNext() : setShown(line.text.length))}
    >
      <AnimatePresence mode="popLayout">
        {line.portrait && (
          <motion.img
            key={line.portrait}
            src={`${BASE}/${line.portrait}`}
            srcSet={`${BASE}/${line.portrait.replace(/\.(png|webp)$/, "@2x.webp")} 2x`}
            alt=""
            // inside the box at its left, standing on the screen's bottom edge and rising a little
            // above the box (measured from the 1280 × 720 game: ~200 × 172)
            className="pointer-events-none absolute bottom-0 left-[6px] z-[3] h-[172px]"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* the full width of the screen, the portrait inside it: name and lines start past it */}
        <DialogFrame className="h-[147px]">
          <div className={cn("pt-[12px]", line.portrait && "pl-[175px]")}>
            {name && !narration && (
              <p className="mb-[10px] text-[15px] text-white [text-shadow:0_1px_1px_#000]">
                {name}
              </p>
            )}
            <p
              className={cn(
                "text-[16px] leading-[1.55] text-[#dcdcdc] [text-shadow:0_1px_1px_#000]",
                narration && "pt-3 text-center text-white/85",
              )}
            >
              {line.text.slice(0, shown)}
              <span className="opacity-0">{line.text.slice(shown)}</span>
            </p>
          </div>
          {full && (
            <motion.span
              className="absolute right-[30px] bottom-[18px] text-[#ffd447] text-xs"
              animate={{ y: [0, 3, 0] }}
              transition={{ duration: 0.7, repeat: Number.POSITIVE_INFINITY }}
            >
              ▼
            </motion.span>
          )}
        </DialogFrame>
      </motion.div>
    </motion.div>
  );
}

/* ───────── menus in the client's grey button style ───────── */

function Menu({
  heading,
  sub,
  items,
}: {
  heading: string;
  sub?: string;
  items: { label: string; run: () => void }[];
}) {
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") setSel((s) => (s + 1) % items.length);
      else if (e.key === "ArrowUp") setSel((s) => (s - 1 + items.length) % items.length);
      else if (e.key === "Enter" || e.code === "KeyJ") {
        audio.sfx("johnnyconfirm.wav");
        items[sel].run();
        return;
      } else return;
      audio.sfx("johnnymove.wav", { volume: 0.5 });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [items, sel]);

  return (
    <motion.div
      className="absolute inset-0 z-50 grid place-items-center bg-black/65"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 1.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <ChromeTitle className="text-[clamp(3rem,9vw,6rem)] leading-none">{heading}</ChromeTitle>
        </motion.div>
        {sub && <p className="mt-3 text-white/70 tracking-[0.3em]">{sub}</p>}
        <ul className="mt-8 flex flex-col items-center gap-2">
          {items.map((it, i) => (
            <li key={it.label}>
              <MetalButton active={i === sel} onMouseEnter={() => setSel(i)} onClick={it.run}>
                {it.label}
              </MetalButton>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
