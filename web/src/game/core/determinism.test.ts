import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Button, CharData, InputState } from "./types";
import { EMPTY_INPUT } from "./types";
import { World } from "./world";

/*
  The engine is meant to run under netcode: every peer steps its own World with the same
  inputs and they must all end every tick in the same state. Two things guard that here —
  the same scripted inputs into two worlds have to leave the same World.hash() tick for tick,
  and nothing in game/core may read a clock, a random source or a maths function whose result
  the spec leaves to the platform.
*/

const root = resolve(process.cwd(), "../data/assets/game");
const load = (p: string) => JSON.parse(readFileSync(`${root}/${p}.json`, "utf8")) as CharData;
const hasData = ["chars/stinky", "chars/victor", "sprites/101"].every((p) =>
  existsSync(`${root}/${p}.json`),
);
const stage = { minX: 0, maxX: 2000, minZ: 300, maxZ: 600 };
const BUTTONS = Object.keys(EMPTY_INPUT) as Button[];

/** The test's own little LCG for scripted play — never the engine's. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Per-tick inputs for `players` fighters: random chords held for a few ticks at a time. */
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

/** Two fighters and a bat lying between them. */
function arena() {
  const world = new World(stage);
  const a = world.spawn(load("chars/stinky"), 1, 500, 450, 1);
  const b = world.spawn(load("chars/victor"), 2, 700, 450, -1);
  world.spawn(load("sprites/101"), 0, 600, 450, 1);
  return { world, ids: [a.id, b.id] };
}

/** Plays the script and returns the hash after every tick; specials' effects are spawned as the game does. */
function run(inputs: InputState[][]) {
  const { world, ids } = arena();
  const sprites = new Map<number, CharData>();
  const sprite = (id: number) => {
    let d = sprites.get(id);
    if (!d) sprites.set(id, (d = load(`sprites/${id}`)));
    return d;
  };
  const hashes: number[] = [];
  for (const tick of inputs) {
    const events = world.step(new Map(ids.map((id, i) => [id, tick[i]])));
    for (const e of events) {
      if (e.type !== "spawn") continue;
      const owner = world.fighters.find((f) => f.id === e.fighter);
      if (owner && existsSync(`${root}/sprites/${e.bla.type}.json`))
        world.spawnEffect(owner, e.bla, sprite(e.bla.type));
    }
    for (const f of [...world.fighters]) if (f.dead) world.remove(f);
    hashes.push(world.hash());
  }
  return hashes;
}

describe.skipIf(!hasData)("the same inputs replay to the same state", () => {
  it("two worlds fed one script hash alike every tick, and the state does move", () => {
    const inputs = script(7, 2, 900);
    const a = run(inputs);
    expect(run(inputs)).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(300);
  });

  it("one changed input diverges the hashes from that tick on", () => {
    const inputs = script(11, 2, 600);
    const other = inputs.map((tick, t) =>
      t === 300 ? [{ ...tick[0], attack: !tick[0].attack }, tick[1]] : tick,
    );
    const a = run(inputs);
    const b = run(other);
    expect(b.slice(0, 300)).toEqual(a.slice(0, 300));
    expect(b.slice(300)).not.toEqual(a.slice(300));
  });

  it("a different past still tells once both fighters are standing again", () => {
    const { world: a, ids } = arena();
    const { world: b } = arena();
    expect(a.hash()).toBe(b.hash());
    const idle = new Map(ids.map((id) => [id, EMPTY_INPUT]));
    a.step(new Map([[ids[0], { ...EMPTY_INPUT, attack: true }]]));
    b.step(idle);
    for (let i = 0; i < 60; i++) {
      a.step(idle);
      b.step(idle);
    }
    expect(a.fighters[0].anim).toBe("STAND");
    expect(b.fighters[0].anim).toBe("STAND");
    expect(a.hash()).not.toBe(b.hash());
  });
});

/*
  What core may not touch. Math.random and the clocks are obvious; sin / cos / tan / exp / log /
  pow (and `**`) are not required to be correctly rounded, so V8, JavaScriptCore and SpiderMonkey
  give different last bits — the four operations, sqrt, round / floor / ceil / trunc, abs, sign,
  min / max are exact everywhere. toLocale* and Intl depend on the browser's locale. Chance the
  game needs goes through a seeded generator kept in the world state.
*/
const BANNED =
  /\bMath\.(random|sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b|\bDate\.now\b|\bnew Date\b|\bperformance\.now\b|\bcrypto\.|(?<![/*])\*\*(?![/*])|\btoLocale\w*|\bIntl\./g;

describe("game/core reads no clock, random source or platform-dependent maths", () => {
  const dir = resolve(process.cwd(), "src/game/core"); // tests run from web/
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  it.each(files)("%s", (file) => {
    const src = readFileSync(resolve(dir, file), "utf8");
    const hits = [...src.matchAll(BANNED)].map(
      (m) => `${m[0]} on line ${src.slice(0, m.index).split("\n").length}`,
    );
    expect(hits).toEqual([]);
  });
});
