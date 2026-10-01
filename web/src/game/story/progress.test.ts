import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENT } from "./director";
import type { StoryData } from "./types";

/*
  Can every story be finished? A model of the director's stage rules — phases advance when they
  have played (enemies down, drama done), HALT holds a room until a CHANGEPHASE moves it, CH_DOOR
  re-routes or locks a door while its phase lasts, RAN_DOOR and doors with several targets lead
  anywhere they list, WARP / TELEPORT carry the player on — walked from the start room until an
  ending (COMPLETE) is reached or nothing more opens.
*/

const dir = resolve(process.cwd(), "../data/assets/game/stories");
const stories = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "catalog.json" && f !== "beasts.json")
      .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as StoryData)
      .filter((d) => d.rooms && d.events?.some((e) => e?.[2] === EVENT.COMPLETE))
  : [];

// the towers are a random maze with their own rules (special items, self-looping doors) still
// to be worked out
const KNOWN = new Set(["tower01", "tower02"]);

function finishable(d: StoryData) {
  const rooms = new Set(Object.keys(d.rooms).map(Number));
  const events = new Map<string, number[][]>();
  for (const e of d.events)
    if (e && e[0] !== null && e.length >= 3) {
      const k = `${e[0]}:${e[1]}`;
      events.set(k, [...(events.get(k) ?? []), e]);
    }
  const at = (bg: number, p: number) => events.get(`${bg}:${p}`) ?? [];
  const lastPhase = new Map<number, number>();
  for (const e of d.events)
    if (e && e[0] !== null) lastPhase.set(e[0], Math.max(lastPhase.get(e[0]) ?? 0, e[1]));

  const phase = new Map<number, number>();
  const doors = new Map<string, { to: number; door: number; phase: number }>();
  const random = new Map<number, Set<number>>();
  const warps = new Set<number>();
  const moved = new Set<number>();
  let complete = false;

  const run = (bg: number, p: number) => {
    for (const [, , op, ...a] of at(bg, p)) {
      if (op === EVENT.COMPLETE) complete = true;
      else if (op === EVENT.CHANGEPHASE && rooms.has(a[0])) {
        phase.set(a[0], a[1]);
        moved.add(a[0]);
        for (const [k, o] of doors) if (k.startsWith(`${a[0]}:`) && o.phase < a[1]) doors.delete(k);
      } else if (op === EVENT.CH_DOOR)
        doors.set(`${bg}:${a[0]}`, { to: a[1], door: a[2], phase: p });
      else if (op === EVENT.RAN_DOOR) random.set(bg, (random.get(bg) ?? new Set()).add(a[0]));
      else if ((op === EVENT.WARP || op === EVENT.TELEPORT) && rooms.has(a[0])) warps.add(a[0]);
    }
  };
  const play = (bg: number) => {
    run(bg, 0);
    for (let guard = 0; guard < 80; guard++) {
      const p = phase.get(bg) ?? 1;
      run(bg, p);
      if (at(bg, p).some((e) => e[2] === EVENT.HALT)) return;
      if (p >= (lastPhase.get(bg) ?? 0)) return;
      phase.set(bg, p + 1);
      for (const [k, o] of doors) if (k.startsWith(`${bg}:`) && o.phase < p + 1) doors.delete(k);
      random.delete(bg);
    }
  };

  let start = Number(d.start.bg);
  if (!rooms.has(start)) start = Math.min(...rooms);
  const seen = new Set<number>();
  const queue = [start];
  for (let guard = 0; guard < 5000 && !complete; guard++) {
    const bg = queue.shift() ?? [...warps, ...moved].find((r) => !seen.has(r) || moved.has(r));
    if (bg === undefined) break;
    moved.delete(bg);
    play(bg);
    seen.add(bg);
    const outs = new Set<number>(random.get(bg));
    for (const l of d.links[String(bg)] ?? []) {
      const o = doors.get(`${bg}:${l.link}`);
      if (o && o.to === bg && o.door === l.link) continue; // locked
      outs.add(o ? o.to : l.toBg);
    }
    for (const w of warps) outs.add(w);
    for (const t of outs) if (rooms.has(t) && !seen.has(t) && !queue.includes(t)) queue.push(t);
  }
  return complete;
}

describe.skipIf(!stories.length)("every story can be finished", () => {
  it("reaches its ending through the stage's own rules", () => {
    const stuck = stories.filter((d) => !KNOWN.has(d.key) && !finishable(d)).map((d) => d.key);
    expect(stuck).toEqual([]);
  });
});
