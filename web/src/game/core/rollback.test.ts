import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Button, CharData, InputState } from "./types";
import { EMPTY_INPUT } from "./types";
import { World } from "./world";

/*
  Rollback netcode takes the world back to an earlier tick and re-simulates with corrected
  inputs. That only works if a restored world is the earlier world to the bit: same hash, same
  fighters (the ones spawned since gone, the ones removed since back, with the same ids), and
  stepping on from it reaches the same state as never having left.
*/

const root = resolve(process.cwd(), "../data/assets/game");
const load = (p: string) => JSON.parse(readFileSync(`${root}/${p}.json`, "utf8")) as CharData;
const hasData = ["chars/stinky", "chars/victor", "sprites/101"].every((p) =>
  existsSync(`${root}/${p}.json`),
);
const stage = { minX: 0, maxX: 2000, minZ: 300, maxZ: 600 };
const BUTTONS = Object.keys(EMPTY_INPUT) as Button[];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function script(seed: number, players: number, ticks: number): InputState[][] {
  const rand = lcg(seed);
  const held = Array.from({ length: players }, () => ({ ...EMPTY_INPUT }));
  const left = Array.from({ length: players }, () => 0);
  const out: InputState[][] = [];
  for (let t = 0; t < ticks; t++)
    out.push(
      held.map((h, i) => {
        if (left[i]-- <= 0) {
          for (const b of BUTTONS) h[b] = rand() < 0.25;
          left[i] = 1 + Math.floor(rand() * 8);
        }
        return { ...h };
      }),
    );
  return out;
}

/** A bout that spawns specials' effects and removes what dies, as the game does. */
class Bout {
  readonly world = new World(stage);
  readonly ids: number[];
  private readonly sprites = new Map<number, CharData>();
  constructor() {
    const a = this.world.spawn(load("chars/stinky"), 1, 500, 450, 1);
    a.infiniteMp = true;
    const b = this.world.spawn(load("chars/victor"), 2, 700, 450, -1);
    b.infiniteMp = true;
    this.world.spawn(load("sprites/101"), 0, 600, 450, 1);
    this.ids = [a.id, b.id];
  }
  step(inputs: InputState[]) {
    const events = this.world.step(new Map(this.ids.map((id, i) => [id, inputs[i]])));
    for (const e of events) {
      if (e.type !== "spawn") continue;
      const owner = this.world.fighters.find((f) => f.id === e.fighter);
      if (!owner || !existsSync(`${root}/sprites/${e.bla.type}.json`)) continue;
      let d = this.sprites.get(e.bla.type);
      if (!d) this.sprites.set(e.bla.type, (d = load(`sprites/${e.bla.type}`)));
      this.world.spawnEffect(owner, e.bla, d);
    }
    for (const f of [...this.world.fighters]) if (f.dead) this.world.remove(f);
  }
}

describe.skipIf(!hasData)("snapshot and restore", () => {
  it("brings the world back to the bit, fighters and all, and continues as if it never left", () => {
    const inputs = script(5, 2, 400);
    const straight = new Bout();
    const rolled = new Bout();
    for (let t = 0; t < 100; t++) {
      straight.step(inputs[t]);
      rolled.step(inputs[t]);
    }
    const snap = rolled.world.snapshot();
    const hashAt100 = rolled.world.hash();
    const idsAt100 = rolled.world.fighters.map((f) => f.id);
    // wander off down the wrong timeline: other inputs, more effects spawned and removed
    const wrong = script(99, 2, 60);
    for (let t = 0; t < 60; t++) rolled.step(wrong[t]);
    expect(rolled.world.hash()).not.toBe(hashAt100);

    const { added, removed } = rolled.world.restore(snap);
    expect(rolled.world.hash()).toBe(hashAt100);
    expect(rolled.world.fighters.map((f) => f.id)).toEqual(idsAt100);
    // what the view has to undo: everything spawned since leaves, everything gone since is back
    for (const f of added) expect(idsAt100).toContain(f.id);
    for (const f of removed) expect(idsAt100).not.toContain(f.id);

    // the same Fighter objects, so the view's handles still point at them
    const [a, b] = straight.ids.map((id) => rolled.world.fighters.find((f) => f.id === id)!);
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    for (let t = 100; t < 400; t++) {
      straight.step(inputs[t]);
      rolled.step(inputs[t]);
      expect(rolled.world.hash()).toBe(straight.world.hash());
    }
  });

  it("a snapshot is a copy: stepping on does not change it", () => {
    const bout = new Bout();
    const inputs = script(3, 2, 40);
    for (let t = 0; t < 20; t++) bout.step(inputs[t]);
    const snap = bout.world.snapshot();
    const h = bout.world.hash();
    for (let t = 20; t < 40; t++) bout.step(inputs[t]);
    bout.world.restore(snap);
    expect(bout.world.hash()).toBe(h);
    bout.world.restore(snap);
    expect(bout.world.hash()).toBe(h);
  });
});
