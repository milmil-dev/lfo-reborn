import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CharData } from "./types";
import { World } from "./world";

/*
  Every sprite a story can put on the floor has to be able to lose. The .spt data is uneven:
  some creatures ship no BOUNCE1, some point FALL1A at their STAND, some spell the bounce
  `BOU0NCE1`, and chars/karl names its frames in lower case. A knock-down that cannot reach
  LIEDOWN used to relaunch the fighter every time it landed, so a wave never emptied and the
  room never moved on (issue #26 — the Bee in mission_school2).
*/

const root = resolve(process.cwd(), "../data/assets/game");
const load = (p: string) => JSON.parse(readFileSync(`${root}/${p}.json`, "utf8")) as CharData;
const hasData = existsSync(`${root}/sprites/3002.json`) && existsSync(`${root}/chars/karl.json`);
const stage = { minX: -9999, maxX: 9999, minZ: 0, maxZ: 900 };

/** Put a sprite at 0 HP and step until the engine calls it finished; -1 if it never does. */
function knockOut(data: CharData) {
  const world = new World(stage);
  const f = world.spawn(data, 2, 0, 450, 1);
  f.hp = 0;
  f.knockOut();
  for (let t = 0; t < 400; t++) {
    world.step(new Map());
    if (f.finished) return t;
  }
  return -1;
}

describe.skipIf(!hasData)("a fighter at 0 HP goes down for good", () => {
  it("lies down even though the Bee ships no BOUNCE1", () => {
    expect(load("sprites/3002").actions.BOUNCE1).toBeUndefined();
    expect(knockOut(load("sprites/3002"))).toBeGreaterThanOrEqual(0);
  });

  it("lies down when FALL1A points at its STAND (Wu, Butterfly, ground_trap …)", () => {
    for (const key of ["sprites/3027", "sprites/3121", "sprites/3100"])
      expect(knockOut(load(key))).toBeGreaterThanOrEqual(0);
  });

  it("lies down when the bounce is misspelt BOU0NCE1", () => {
    const marek = load("chars/marek_p");
    expect(marek.actions.BOUNCE1).toBeDefined();
    expect(marek.frames[String(marek.actions.BOUNCE1)].n).toBe("BOU0NCE1");
    expect(knockOut(marek)).toBeGreaterThanOrEqual(0);
  });

  it("stays down once it has lain down, and is never launched twice", () => {
    const world = new World(stage);
    const f = world.spawn(load("sprites/3002"), 2, 0, 450, 1);
    f.hp = 0;
    f.knockOut();
    const at = [];
    for (let t = 0; t < 200; t++) {
      world.step(new Map());
      at.push(f.anim);
    }
    // one fall, then the floor: it never lands back on its feet and falls again
    expect(at.lastIndexOf("FALL1A")).toBeLessThan(at.indexOf("LIEDOWN"));
    expect(at.at(-1)).toBe("LIEDOWN");
  });

  it("treats a sprite with no LIEDOWN at all as down once it has landed", () => {
    // a synthetic sprite: STAND, WALK and a FALL with no lie-down after it
    const data: CharData = {
      ...load("sprites/3002"),
      key: "test_no_lie",
      actions: { STAND: 0, WALK: 10, FALL1A: 700 },
      frames: {
        "0": { n: "STAND", s: 0, p: 0, cx: 0, cy: 0, d: 4, nx: 0, dvx: 0, dvy: 0, dvz: 0 },
        "700": { n: "FALL1A", s: 0, p: 0, cx: 0, cy: 0, d: 4, nx: 700, dvx: 0, dvy: 0, dvz: 0 },
      },
    };
    const world = new World(stage);
    const f = world.spawn(data, 2, 0, 450, 1);
    f.hp = 0;
    f.knockOut();
    let finished = false;
    for (let t = 0; t < 400 && !finished; t++) {
      world.step(new Map());
      finished = f.finished;
    }
    expect(finished).toBe(true);
    expect(f.y).toBe(0);
    // and a standing fighter of the same sprite is not mistaken for a downed one: with no
    // LIEDOWN the action table answers 0, which is its STAND
    const live = world.spawn(data, 1, 100, 450, 1);
    expect(live.anim).toBe("STAND");
    expect(live.down).toBe(false);
    expect(live.finished).toBe(false);
  });

  it("a live fighter still gets up from LIEDOWN", () => {
    const world = new World(stage);
    const f = world.spawn(load("sprites/3002"), 2, 0, 450, 1);
    f.goto(f.action("LIEDOWN"));
    for (let t = 0; t < 120; t++) world.step(new Map());
    expect(f.finished).toBe(false);
    expect(f.down).toBe(false);
  });

  it("names its lie-down in lower case (chars/karl) and still counts as finished", () => {
    const karl = load("chars/karl");
    expect(karl.frames[String(karl.actions.LIEDOWN)].n).toBe("liedown");
    const world = new World(stage);
    const f = world.spawn(karl, 1, 0, 450, 1);
    f.hp = 0;
    f.knockOut();
    let finished = false;
    for (let t = 0; t < 400 && !finished; t++) {
      world.step(new Map());
      finished = f.finished;
    }
    expect(finished).toBe(true);
    expect(f.anim).toBe("liedown");
  });
});

describe.skipIf(!hasData)("every sprite a story can spawn can be killed", () => {
  const stories = resolve(process.cwd(), "../data/assets/game/stories");
  // sprite ids -> asset paths, across every story's own sprite table
  const paths = new Set<string>();
  for (const file of readdirSync(stories).filter((f) => f.endsWith(".json"))) {
    const story = JSON.parse(readFileSync(`${stories}/${file}`, "utf8")) as {
      sprites?: Record<string, string | null>;
      groups?: Record<string, { sprite: number }[]>;
    };
    if (!story.groups || !story.sprites) continue;
    for (const members of Object.values(story.groups))
      for (const m of members) {
        const path = story.sprites[String(m.sprite)];
        // the stage's own scenery sprites are not fighters; the groups hold only fighters
        if (path) paths.add(path);
      }
  }

  it("finds the stories' sprites", () => {
    expect(paths.size).toBeGreaterThan(100);
  });

  it("settles each of them at 0 HP", () => {
    const stuck: string[] = [];
    for (const path of paths) {
      if (!existsSync(`${root}/${path}.json`)) continue;
      const data = JSON.parse(readFileSync(`${root}/${path}.json`, "utf8")) as CharData;
      // scenery (a lift, a light, a background animation) has no attrs and is never spawned as one
      if (!data.attrs || !data.frames || !data.actions) continue;
      if (knockOut(data) < 0)
        stuck.push(`${path} (${data.nameEn}) stopped at ${data.key} with no way down`);
    }
    expect(stuck).toEqual([]);
  });
});
