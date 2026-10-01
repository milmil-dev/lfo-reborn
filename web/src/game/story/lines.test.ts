import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { linesFor } from "./lines";

const path = resolve(process.cwd(), "../data/assets/game/stories/catalog.json");
const catalog: { key: string; stage: string; mode: string; players: number[] }[] = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : [];
const keys = (charId: number) =>
  linesFor(
    catalog.filter((e) => e.mode === "story"),
    charId,
  ).map((e) => e.key);

describe.skipIf(!catalog.length)("linesFor", () => {
  it("gives everyone the common chapters, through the line listed for anyone", () => {
    const john = keys(7);
    expect(john).toContain("stinky_school");
    expect(john).toContain("stinky_coliseum");
    expect(john).toContain("stinky_china1");
    expect(john).toContain("china4");
  });

  it("plays a character's own line instead of the common one", () => {
    const davis = keys(1);
    expect(davis).toContain("davis_school");
    expect(davis).not.toContain("stinky_school");
    expect(keys(2)).toContain("stinky_school");
    expect(keys(5)).toContain("davis_greek1"); // Woody is given Davis's
    expect(keys(197)).toContain("dennis_china5"); // and Kiki Dennis's
  });

  it("leaves out a stage with no line for the character", () => {
    expect(keys(7).some((k) => k.includes("egypt"))).toBe(false);
    expect(keys(1)).toContain("davis_egypt1");
  });

  it("lists each stage once", () => {
    for (const id of [1, 2, 7, 266, 7002]) {
      const stages = linesFor(catalog, id).map((e) => `${e.mode}:${e.stage}`);
      expect(new Set(stages).size).toBe(stages.length);
    }
  });
});
