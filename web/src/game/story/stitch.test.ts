import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { segmentAt, stitch, stripOf } from "./stitch";
import type { StoryData } from "./types";

const file = resolve(process.cwd(), "../data/assets/game/stories/lobby.json");
const lobby = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StoryData) : null;

describe.skipIf(!lobby)("seamless lobby streets", () => {
  it("joins the main street's rooms end to end", () => {
    const segs = stripOf(lobby!, 7);
    expect(segs.map((s) => s.bg)).toEqual([5, 6, 7, 8, 9]);
    expect(segs.map((s) => s.dx)).toEqual([0, 2400, 4800, 7200, 9600]);
  });

  it("drops the exits that became seams and keeps doors", () => {
    const room = stitch(lobby!, stripOf(lobby!, 7));
    const sideExits = room.exits.filter((e) => e.dir === 3 || e.dir === 4);
    // only the strip's own two ends may remain
    expect(sideExits.every((e) => e.x < 100 || e.x > room.width - 100)).toBe(true);
    expect(room.exits.some((e) => e.dir === 1)).toBe(true);
    expect(room.width).toBe(12000);
  });

  it("knows which room the player is walking in", () => {
    const room = stitch(lobby!, stripOf(lobby!, 7));
    expect(segmentAt(room, 5000).bg).toBe(7);
    expect(segmentAt(room, 7300).bg).toBe(8);
  });

  it("leaves a room alone when its edge link is not mutual", () => {
    // 13's right exit sits at x 2247, not at its edge: 12 and 13 stay separate
    expect(stripOf(lobby!, 12).map((s) => s.bg)).not.toContain(13);
  });
});
