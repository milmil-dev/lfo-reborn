import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CharData, InputState } from "./types";
import { EMPTY_INPUT } from "./types";
import { World } from "./world";

// Runs against the real exported data (make data; items from `bun stories.ts --items`).
const root = resolve(process.cwd(), "../data/assets/game");
const load = (p: string) => JSON.parse(readFileSync(`${root}/${p}.json`, "utf8")) as CharData;
const hasData = ["chars/stinky", "chars/victor", "sprites/101", "sprites/201", "sprites/501"].every(
  (p) => existsSync(`${root}/${p}.json`),
);
const stage = { minX: 0, maxX: 2000, minZ: 300, maxZ: 600 };

function setup(itemId: number) {
  const world = new World(stage);
  const hero = world.spawn(load("chars/stinky"), 1, 500, 450, 1);
  const item = world.spawn(load(`sprites/${itemId}`), 0, 520, 450, 1);
  return { world, hero, item };
}
function play(world: World, id: number, script: Partial<InputState>[], idleAfter = 0) {
  const events = [];
  for (const s of [...script, ...Array.from({ length: idleAfter }, () => ({}))])
    events.push(...world.step(new Map([[id, { ...EMPTY_INPUT, ...s }]])));
  return events;
}

describe.skipIf(!hasData)("field items", () => {
  it("an item dropped in the field falls and lies on the floor", () => {
    const { world, item } = setup(101);
    item.y = -40;
    play(world, 0, [], 40);
    expect(item.itemState).toBe("ground");
    expect(item.anim).toBe("ITEMGROUND");
  });

  it("攻 next to a bat picks it up instead of punching", () => {
    const { world, hero, item } = setup(101);
    play(world, hero.id, [], 20);
    const events = play(world, hero.id, [{ attack: true }, {}], 5);
    expect(events.some((e) => e.type === "pick")).toBe(true);
    expect(hero.holding).toBe(item);
    expect(item.itemState).toBe("held");
    expect(hero.anim.startsWith("ATTACK")).toBe(false);
  });

  it("swinging the bat hits with the bat's own attack", () => {
    const { world, hero, item } = setup(101);
    const dummy = world.spawn(load("chars/victor"), 2, 560, 450, -1);
    play(world, hero.id, [], 20);
    play(world, hero.id, [{ attack: true }, {}], 5);
    expect(hero.holding).toBe(item);
    const events = play(world, hero.id, [{ attack: true }, {}], 30);
    expect(hero.anim === "SWORDATTACK" || events.some((e) => e.type === "hit")).toBe(true);
    const hit = events.find((e) => e.type === "hit");
    expect(hit && hit.type === "hit" && hit.attacker).toBe(hero.id);
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
    expect(item.hp).toBeLessThan(item.data.attrs.hp);
  });

  it("pushing forward with 攻 throws it, and it lands further on", () => {
    const { world, hero, item } = setup(101);
    play(world, hero.id, [], 20);
    play(world, hero.id, [{ attack: true }, {}], 5);
    play(world, hero.id, [{ right: true, attack: true }, { right: true }], 10);
    expect(hero.holding).toBe(null);
    play(world, hero.id, [], 60);
    expect(item.itemState).toBe("ground");
    expect(item.x).toBeGreaterThan(600);
  });

  it("a crate is carried with the HEAVY move set and thrown with 攻", () => {
    const { world, hero, item } = setup(201);
    play(world, hero.id, [], 20);
    play(world, hero.id, [{ attack: true }, {}], 40);
    expect(hero.holding).toBe(item);
    expect(hero.anim.startsWith("HEAVY")).toBe(true);
    play(
      world,
      hero.id,
      Array.from({ length: 10 }, () => ({ right: true })),
    );
    expect(hero.anim).toBe("HEAVYWALK");
    play(world, hero.id, [{ attack: true }, {}], 40);
    expect(hero.holding).toBe(null);
  });

  it("a soda is drunk and restores HP", () => {
    const { world, hero } = setup(501);
    hero.hp = 100;
    play(world, hero.id, [], 20);
    play(world, hero.id, [{ attack: true }, {}], 5);
    play(world, hero.id, [{ attack: true }, {}], 80);
    expect(hero.holding).toBe(null);
    expect(hero.hp).toBeGreaterThan(100);
  });

  it("an attack knocks a loose item away (旋風炮拳 over a bat on the floor)", () => {
    const { world, hero, item } = setup(101);
    hero.infiniteMp = true;
    item.x = 640;
    play(world, hero.id, [], 20);
    expect(item.itemState).toBe("ground");
    const x0 = item.x;
    hero.goto(hero.data.moves.find((m) => m.keys.includes("GDUA"))!.to);
    for (let i = 0; i < 90; i++)
      for (const e of world.step(new Map([[hero.id, EMPTY_INPUT]])))
        if (e.type === "spawn") world.spawnEffect(hero, e.bla, load(`sprites/${e.bla.type}`));
    expect(item.x).not.toBe(x0);
    expect(item.hp).toBeLessThan(item.data.attrs.hp);
  });
});
