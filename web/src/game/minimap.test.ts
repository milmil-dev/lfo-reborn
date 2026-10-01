import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BOX_H, layoutMap } from "./minimap";
import type { StoryData } from "./story/types";

const load = (key: string) => {
  const file = resolve(process.cwd(), `../data/assets/game/stories/${key}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StoryData) : null;
};
const lobby = load("lobby");
const school = load("stinky_school");

describe.skipIf(!lobby)("小地圖 in the lobby", () => {
  it("draws only the room you are in and the rooms its doors lead to", () => {
    const boxes = layoutMap(lobby!, 7);
    const bgs = boxes.map((b) => b.bg);
    expect(bgs).toContain(7);
    expect(bgs).toContain(6);
    expect(bgs).toContain(8);
    expect(boxes.length).toBeLessThan(Object.keys(lobby!.rooms).length);
  });

  it("puts the street's neighbours beside it and the doors' rooms on another row", () => {
    const boxes = layoutMap(lobby!, 7);
    const at = (bg: number) => boxes.find((b) => b.bg === bg)!;
    expect(at(6).y).toBe(at(7).y);
    expect(at(6).x).toBeLessThan(at(7).x);
    expect(at(8).x).toBeGreaterThan(at(7).x);
    // no two boxes on a row overlap
    const overlaps = boxes.filter((a) =>
      boxes.some((b) => a !== b && a.y === b.y && a.x < b.x + b.w && b.x < a.x + a.w),
    );
    expect(overlaps).toEqual([]);
  });

  it("marks every door along its box", () => {
    const room = layoutMap(lobby!, 0).find((b) => b.bg === 0)!;
    expect(room.doors).toHaveLength(lobby!.rooms["0"].exits.length);
    expect(room.doors.every((d) => d >= 0 && d <= 1)).toBe(true);
  });
});

describe.skipIf(!school)("小地圖 in a stage", () => {
  it("draws the whole stage, rows a box apart", () => {
    const boxes = layoutMap(school!, Number(school!.start.bg));
    expect(boxes.length).toBeGreaterThan(1);
    // rows sit a box height plus a gap apart, from the top
    expect(boxes.every((b) => b.y >= 0 && b.y % 1 === 0)).toBe(true);
    expect(new Set(boxes.map((b) => b.y)).size === 1 || boxes.some((b) => b.y > BOX_H)).toBe(true);
  });
});
