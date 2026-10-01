import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Director, obtainableKeys, type StoryUI } from "./director";
import type { StoryData } from "./types";

const dir = resolve(process.cwd(), "../data/assets/game/stories");
const load = (k: string) => JSON.parse(readFileSync(`${dir}/${k}.json`, "utf8")) as StoryData;
const has = ["davis_lantau", "mission_school5"].every((k) => existsSync(`${dir}/${k}.json`));

// the director only needs its UI once it plays; these checks never start it
const ui = {} as StoryUI;

describe.skipIf(!has || !load("davis_lantau").locks)("鑰匙 and locked doors", () => {
  it("knows which keys a stage hands out: spawned key sprites and ADDKEY's", () => {
    const keys = obtainableKeys(load("davis_lantau"));
    for (const k of [701, 702, 703, 704, 705, 710, 711, 712]) expect(keys.has(k)).toBe(true);
  });

  it("a lok door needs its key; one the stage never gives stays open", () => {
    expect(new Director(load("davis_lantau"), ui).lockOf(3, 2)).toBe(703);
    expect(new Director(load("davis_lantau"), ui).lockOf(6, 1)).toBeNull();
    // mission_school5 locks 8:0 with 705 but hands out no keys at all
    expect(new Director(load("mission_school5"), ui).lockOf(8, 0)).toBeNull();
  });

  it("finds 大嶼山's key gates: the turned-back loop opens to the scene that takes the key", () => {
    const d = new Director(load("davis_lantau"), ui) as unknown as {
      gates: Map<string, { key: number; to: number }>;
    };
    // room 7: phase 4 plays the 'turned back' scene, 5 warps back, 6 loops to 4; with the key
    // the room plays its second take — 10 – 12 the waves again, 13 the way opening, 14 the key used
    for (const p of [4, 5, 6]) expect(d.gates.get(`7:${p}`)).toEqual({ key: 711, to: 10 });
    expect(d.gates.get(`8:4`)).toEqual({ key: 712, to: 10 });
  });
});
