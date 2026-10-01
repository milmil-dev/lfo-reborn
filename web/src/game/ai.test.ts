import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newBrain, think } from "./ai";
import type { CharData } from "./core/types";
import { World } from "./core/world";

const dir = resolve(process.cwd(), "../data/assets/game");
const load = (p: string) => JSON.parse(readFileSync(`${dir}/${p}.json`, "utf8")) as CharData;
const hasData = existsSync(`${dir}/chars/stinky.json`);

// a seeded generator, so the fight is the same every run
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe.skipIf(!hasData)("computer players", () => {
  it("fight each other with punches and specials", () => {
    const world = new World({ minX: 0, maxX: 1600, minZ: 300, maxZ: 600 });
    const a = world.spawn(load("chars/stinky"), 1, 500, 450, 1);
    const b = world.spawn(load("chars/davis"), 2, 900, 450, -1);
    const rand = rng(7);
    const brains = new Map([
      [a.id, newBrain(0.8, rand)],
      [b.id, newBrain(0.8, rand)],
    ]);
    let specials = 0;
    for (let t = 0; t < 30 * 40; t++) {
      const inputs = new Map(
        [a, b].map((f) => [f.id, think(f, world.fighters, brains.get(f.id)!, rand)]),
      );
      for (const e of world.step(inputs)) {
        if (e.type === "move") specials++;
        if (e.type === "spawn") {
          const owner = world.fighters.find((f) => f.id === e.fighter)!;
          if (existsSync(`${dir}/sprites/${e.bla.type}.json`))
            world.spawnEffect(owner, e.bla, load(`sprites/${e.bla.type}`));
        }
      }
      // keep them standing for the whole bout
      for (const f of [a, b]) if (f.hp < f.maxHp / 2) f.hp = f.maxHp;
    }
    expect(specials).toBeGreaterThan(0);
    expect(a.hp < a.maxHp || b.hp < b.maxHp).toBe(true);
  });
});
