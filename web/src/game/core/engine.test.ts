import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CharData, InputState } from "./types";
import { EMPTY_INPUT } from "./types";
import { World } from "./world";

// Runs against the real exported frame data (make data && bun pipeline/sprites.ts).
// tests run from web/; the pipeline writes to the repo-level data/ dir
const dir = resolve(process.cwd(), "../data/assets/game/chars");
const load = (key: string) => JSON.parse(readFileSync(`${dir}/${key}.json`, "utf8")) as CharData;
const hasData = existsSync(`${dir}/stinky.json`) && existsSync(`${dir}/victor.json`);
const stage = { minX: 0, maxX: 2000, minZ: 300, maxZ: 600 };

function setup() {
  const world = new World(stage);
  const hero = world.spawn(load("stinky"), 1, 500, 450, 1);
  hero.infiniteMp = true;
  return { world, hero };
}

/** Run a scripted list of per-tick inputs for one fighter. */
function play(world: World, id: number, script: Partial<InputState>[], idleAfter = 0) {
  const events = [];
  for (const step of [...script, ...Array.from({ length: idleAfter }, () => ({}))])
    events.push(...world.step(new Map([[id, { ...EMPTY_INPUT, ...step }]])));
  return events;
}
const tap = (b: keyof InputState): Partial<InputState>[] => [{ [b]: true }, {}];

describe.skipIf(!hasData)("fighter engine (stinky)", () => {
  it("異轉: morphs in place, plays the TRANSFORM burst and settles in STAND", () => {
    const { world, hero } = setup();
    hero.hp = 700;
    const form = load("stinky_r");
    hero.morph(form);
    expect(hero.anim).toBe("TRANSFORM");
    const events = play(world, hero.id, [], 40);
    expect(hero.data.attrs.id).toBe(7002);
    expect(hero.hp).toBe(700);
    expect(hero.x).toBe(500);
    expect(events.some((e) => e.type === "spawn" && e.bla.type === 819)).toBe(true);
    expect(hero.anim).toBe("STAND");
    // and back: the base form has no TRANSFORM, so it simply stands
    hero.morph(load("stinky"), "STAND");
    expect(hero.data.attrs.id).toBe(2);
    expect(hero.anim).toBe("STAND");
  });

  it("rolls along the depth when ↑ is held on the floor, then gets up", () => {
    const { world, hero } = setup();
    hero.goto(hero.action("LIEDOWN"));
    const z0 = hero.z;
    play(
      world,
      hero.id,
      Array.from({ length: 4 }, () => ({ up: true })),
    );
    expect(hero.anim).toBe("LIEDOWNROLLU");
    play(world, hero.id, [], 60);
    expect(hero.z).toBeLessThan(z0 - 30);
    expect(hero.anim).toBe("STAND");
  });

  it("跳 on the way down recovers from a knock-down (FALLRECOVERY)", () => {
    const { world, hero } = setup();
    hero.goto(hero.action("FALL1A"));
    hero.y = -120;
    hero.vy = 2;
    play(world, hero.id, [{ jump: true }]);
    expect(hero.anim).toBe("FALLRECOVERY");
    play(world, hero.id, [], 60);
    expect(hero.y).toBe(0);
    expect(hero.anim).toBe("STAND");
  });

  it("idles through the STAND loop", () => {
    const { world, hero } = setup();
    play(world, hero.id, [], 60);
    expect(hero.anim).toBe("STAND");
    expect(hero.x).toBe(500);
  });

  it("walks right at the character's walk speed", () => {
    const { world, hero } = setup();
    play(
      world,
      hero.id,
      Array.from({ length: 10 }, () => ({ right: true })),
    );
    expect(hero.anim).toBe("WALK");
    expect(hero.x).toBeCloseTo(500 + 10 * hero.data.attrs.walk, 0);
  });

  it("double tap starts a run", () => {
    const { world, hero } = setup();
    play(world, hero.id, [{ right: true }, {}, { right: true }, { right: true }]);
    expect(hero.anim).toBe("RUN");
  });

  it("holding 防 keeps guarding until it is released", () => {
    const { world, hero } = setup();
    play(
      world,
      hero.id,
      Array.from({ length: 60 }, () => ({ defend: true })),
    );
    expect(hero.anim).toBe("GUARD");
    play(world, hero.id, [], 30);
    expect(hero.anim).toBe("STAND");
  });

  it("a pending level-up plays the LEVELUP pose and its light", () => {
    const { world, hero } = setup();
    hero.pendingLevelUp = true;
    const events = play(world, hero.id, [], 12);
    expect(hero.anim).toBe("LEVELUP");
    expect(events.some((e) => e.type === "spawn")).toBe(true);
    play(world, hero.id, [], 60);
    expect(hero.anim).toBe("STAND");
  });

  it("真十字旋風拳 (防跳攻) lands and returns to standing", () => {
    const { world, hero } = setup();
    play(world, hero.id, [{}, { defend: true }, {}, { jump: true }, {}, { attack: true }], 120);
    expect(hero.y).toBe(0);
    expect(hero.anim).toBe("STAND");
  });

  // effects spawned by specials fly with the bla row's launch velocity and hit for their owner
  function fireAt(keys: string, who = "stinky") {
    const world = new World(stage);
    const hero = world.spawn(load(who), 1, 500, 450, 1);
    hero.infiniteMp = true;
    const foe = world.spawn(load("victor"), 2, 640, 450, -1);
    const sprite = (id: number) =>
      JSON.parse(readFileSync(`${dir}/../sprites/${id}.json`, "utf8")) as CharData;
    hero.goto(hero.data.moves.find((m) => m.keys.includes(keys))!.to);
    const hits = [];
    const statuses: string[] = [];
    for (let i = 0; i < 120; i++)
      for (const e of world.step(new Map([[hero.id, EMPTY_INPUT]]))) {
        if (e.type === "spawn") world.spawnEffect(hero, e.bla, sprite(e.bla.type));
        if (e.type === "hit" && e.attacker !== hero.id) hits.push(e);
        if (e.type === "status" && e.fighter === foe.id && e.on) statuses.push(e.kind);
      }
    return { foe, hits, statuses };
  }

  it("菲雲's fire sets the enemy burning (effect bit 8)", () => {
    const moves = load("firen").moves.map((m) => m.keys[0]);
    const burnt = moves.some((k) => fireAt(k, "firen").statuses.includes("burn"));
    expect(burnt).toBe(true);
  });

  it("破空拳's whirlwind (806) flies forward and catches the enemy", () => {
    const { foe, hits } = fireAt("GBFA");
    expect(hits.length).toBeGreaterThan(0);
    expect(foe.anim).not.toBe("STAND");
  });

  it("旋風炮拳's blast (800) damages the enemy", () => {
    const { foe, hits } = fireAt("GDUA");
    expect(hits.some((h) => h.type === "hit" && h.damage > 0)).toBe(true);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it("a fighter at 0 HP falls and stays down", () => {
    const world = new World(stage);
    const hero = world.spawn(load("stinky"), 1, 500, 450, 1);
    const foe = world.spawn(load("victor"), 2, 540, 450, -1);
    foe.hp = 0; // e.g. the last point went to guard chip damage
    for (let i = 0; i < 200; i++) world.step(new Map([[hero.id, EMPTY_INPUT]]));
    expect(foe.down).toBe(true);
    expect(foe.anim).toMatch(/LIEDOWN/);
  });

  it("jumps and lands back on the floor", () => {
    const { world, hero } = setup();
    const events = play(world, hero.id, tap("jump"), 60);
    expect(events.some((e) => e.type === "land")).toBe(true);
    expect(hero.y).toBe(0);
    expect(["STAND", "CROUCH2STAND", "JUMPLAND"]).toContain(hero.anim);
  });

  it("防 ↑ 攻 performs a special move from the spm table", () => {
    const { world, hero } = setup();
    const target = hero.data.moves.find((m) => m.keys.includes("GUA"))!;
    const events = play(world, hero.id, [...tap("defend"), ...tap("up"), { attack: true }]);
    expect(events.some((e) => e.type === "move")).toBe(true);
    expect(hero.frame.n).toBe(hero.frameAt(target.to)!.n);
  });

  it("chain-only inputs (a bare 攻) do nothing on their own", () => {
    const { world, hero } = setup();
    const events = play(world, hero.id, [{ attack: true }]);
    expect(events.some((e) => e.type === "move")).toBe(false);
    expect(hero.anim.startsWith("ATTACK")).toBe(true);
  });

  it("punches connect with a dummy and knock it down eventually", () => {
    const { world, hero } = setup();
    const dummy = world.spawn(load("victor"), 2, 560, 450, -1);
    const start = dummy.hp;
    let hits = 0;
    for (let i = 0; i < 12; i++) {
      hits += play(world, hero.id, tap("attack"), 12).filter((e) => e.type === "hit").length;
      hero.x = dummy.x - 60; // keep in range as the dummy is pushed back
      hero.facing = 1;
    }
    expect(hits).toBeGreaterThan(3);
    expect(dummy.hp).toBeLessThan(start);
  });
});
