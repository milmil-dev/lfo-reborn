import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CharData, InputState } from "./types";
import { EMPTY_INPUT } from "./types";
import { World } from "./world";

// Every special of every playable character, started directly, has to finish and hand control
// back (no frame chain that parks the fighter for good). Runs against the real exported data.
const dir = resolve(process.cwd(), "../data/assets/game/chars");
const keys = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .map((f) => f.replace(/\.json$/, ""))
  : [];

describe.skipIf(!keys.length)("every special move ends", () => {
  it.each(keys)("%s", (key) => {
    const data = JSON.parse(readFileSync(`${dir}/${key}.json`, "utf8")) as CharData;
    const stuck: string[] = [];
    for (const m of data.moves) {
      if (!data.frames[String(m.to)]) continue;
      const world = new World({ minX: 0, maxX: 4000, minZ: 300, maxZ: 600 });
      const f = world.spawn(data, 1, 2000, 450, 1);
      f.infiniteMp = true;
      f.goto(m.to);
      for (let i = 0; i < 600; i++) world.step(new Map([[f.id, EMPTY_INPUT]]));
      // LOSE / WIN poses are meant to be held
      if (/^(lose|win)$/i.test(f.anim)) continue;
      if (f.airborne || !/stand|walk/i.test(f.anim))
        stuck.push(`${key} ${m.keys.join("/")} → ${f.anim}#${f.frameId}`);
    }
    expect(stuck).toEqual([]);
  });
});

// Every special has to start from its typed command, as a player would press it: one key a
// tick, released in between. (防 後 前 攻 needs 後 not to turn the fighter; 防 攻 攻 needs the
// first 攻 not to throw a punch.)
const KEY: Record<string, keyof InputState> = {
  G: "defend",
  A: "attack",
  J: "jump",
  F: "right",
  B: "left",
  U: "up",
  D: "down",
};
// placeholder commands in the data (ZZZZZ, XYZ, GG), sprites that are not ordinary player
// characters (karl, yeachap_r), and two moves still to look into
const KNOWN = new Set(["rova ZZZZZ", "uranus_r XYZ", "rowan GG", "firzen GBFJ", "louiss GFJ"]);
const SKIP = new Set(["karl", "yeachap_r"]);

describe.skipIf(!keys.length)("every special can be typed", () => {
  it.each(keys.filter((k) => !SKIP.has(k)))("%s", (key) => {
    const data = JSON.parse(readFileSync(`${dir}/${key}.json`, "utf8")) as CharData;
    const missed: string[] = [];
    for (const m of data.moves ?? []) {
      const seq = m.keys[0];
      if (m.from || seq.length < 2 || !data.frames[String(m.to)] || KNOWN.has(`${key} ${seq}`))
        continue;
      const anim = data.frames[String(m.to)].n;
      const world = new World({ minX: 0, maxX: 4000, minZ: 300, maxZ: 600 });
      const f = world.spawn(data, 1, 2000, 450, 1);
      f.infiniteMp = true;
      const tick = (input: Partial<InputState> = {}) => {
        world.step(new Map([[f.id, { ...EMPTY_INPUT, ...input }]]));
        return f.frameId === m.to || f.anim === anim;
      };
      for (let i = 0; i < 5; i++) tick();
      let started = false;
      for (const ch of seq) started = tick({ [KEY[ch]]: true }) || tick() || started;
      for (let i = 0; i < 3 && !started; i++) started = tick();
      if (!started) missed.push(`${seq}→${f.anim}`);
    }
    expect(missed).toEqual([]);
  });
});
