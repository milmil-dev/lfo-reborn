import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FighterEvent } from "./core/fighter";
import type { CharData } from "./core/types";
import { World } from "./core/world";
import { backpackAct, type MomoPart, momoPower, newMomoBrain, thinkMomo } from "./momo";

const dir = resolve(process.cwd(), "../data/assets/game");
const load = (p: string) => JSON.parse(readFileSync(`${dir}/${p}.json`, "utf8")) as CharData;
const hasData = existsSync(`${dir}/momo.json`) && existsSync(`${dir}/chars/davis.json`);

const part = (mpi: Record<string, string>, attack?: string): MomoPart => ({
  id: 40004,
  slot: "backpack",
  name: "momostar_test",
  mpi,
  attack,
});

describe("a 摩摩星's backpack", () => {
  it("fires its own G_### attack, else the boxing set for its level", () => {
    expect(backpackAct(part({}, "G_004")).action).toBe("G_004");
    expect(backpackAct(part({}), 3).action).toBe("boxing_lv3");
    expect(backpackAct(part({}), 9).action).toBe("boxing_lv5");
    expect(backpackAct(undefined).action).toBe("boxing_lv1");
  });

  it("supports its leader when it targets them", () => {
    const a = backpackAct(part({ TarType: "leader", ActType: "support" }));
    expect(a.support).toBe(true);
    expect(a.action).toBe("consumer_good");
  });

  it("hits harder as it levels, LV1 to LV10", () => {
    expect(momoPower(1)).toBeCloseTo(0.3);
    expect(momoPower(10)).toBeGreaterThan(momoPower(5));
    expect(momoPower(99)).toBe(momoPower(10));
  });

  it("reads its reach from ActRangeX / Z", () => {
    const a = backpackAct(part({ ActRangeX: "120", ActRangeZ: "30" }));
    expect([a.reachX, a.reachZ]).toEqual([120, 30]);
  });
});

describe.skipIf(!hasData)("the 摩摩星 follower", () => {
  const { parts } = JSON.parse(readFileSync(`${dir}/momo.json`, "utf8")) as { parts: MomoPart[] };
  const base = () => load("sprites/3500");

  it("exports a base creature whose frames draw parts", () => {
    const b = base();
    expect(Object.values(b.frames).some((f) => f.eff?.length)).toBe(true);
    const own = parts.flatMap((p) => (p.attack ? [p.attack] : []));
    expect(own.filter((a) => b.actions[a] === undefined)).toEqual([]);
    expect(parts.some((p) => p.slot === "backpack")).toBe(true);
  });

  it("keeps up with its leader", () => {
    const world = new World({ minX: 0, maxX: 2400, minZ: 300, maxZ: 600 });
    const leader = world.spawn(load("chars/davis"), 1, 400, 450, 1);
    const momo = world.spawn(base(), 1, 350, 450, 1);
    const b = newMomoBrain();
    const act = backpackAct(undefined);
    leader.x = 900;
    for (let t = 0; t < 30 * 6; t++)
      world.step(new Map([[momo.id, thinkMomo(momo, leader, world.fighters, b, act).input]]));
    expect(Math.abs(leader.x - momo.x)).toBeLessThan(160);
  });

  it("walks up to an enemy and hits it when its meter fills", () => {
    const world = new World({ minX: 0, maxX: 2400, minZ: 300, maxZ: 600 });
    const leader = world.spawn(load("chars/davis"), 1, 300, 450, 1);
    const momo = world.spawn(base(), 1, 350, 450, 1);
    const foe = world.spawn(load("chars/davis"), 2, 560, 450, -1);
    const b = newMomoBrain();
    const act = backpackAct(undefined, 1);
    let attacks = 0;
    let hurt = false;
    for (let t = 0; t < 30 * 12; t++) {
      const r = thinkMomo(momo, leader, world.fighters, b, act);
      const played: FighterEvent[] = [];
      if (r.play) {
        attacks++;
        momo.goto(momo.action(r.play), played);
      }
      // its punches are thrown objects (the base's bla rows), spawned the way the director does
      for (const e of [...played, ...world.step(new Map([[momo.id, r.input]]))])
        if (e.type === "spawn" && existsSync(`${dir}/sprites/${e.bla.type}.json`)) {
          const owner = world.fighters.find((f) => f.id === e.fighter)!;
          world.spawnEffect(owner, e.bla, load(`sprites/${e.bla.type}`));
        }
      if (foe.hp < foe.maxHp) hurt = true;
      if (foe.hp < foe.maxHp / 2) foe.hp = foe.maxHp;
    }
    expect(attacks).toBeGreaterThan(0);
    expect(hurt).toBe(true);
    expect(Math.abs(foe.x - momo.x)).toBeLessThan(200);
  });
});
