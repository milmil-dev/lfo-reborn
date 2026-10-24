import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CharData, Move } from "./types";
import { cells, performable, specials } from "./table";

const move = (slot: number, keys: string[], to = slot + 8000, from = 0): Move => ({
  keys,
  mp: 10,
  from,
  to,
  slot,
});

function char(moves: Move[], frames: number[] = moves.map((m) => m.to)): CharData {
  return {
    key: "test",
    name: "",
    nameEn: "",
    attrs: {
      id: 1,
      hp: 1,
      mp: 1,
      walk: 1,
      run: 1,
      jumpH: 1,
      jumpD: 1,
      runJumpH: 1,
      runJumpD: 1,
      weight: 1,
    },
    actions: {},
    moves,
    frames: Object.fromEntries(frames.map((f) => [String(f), {}])),
    pages: [],
    rects: {},
  } as unknown as CharData;
}

describe("出招表 rows", () => {
  it("drops chain moves, placeholder commands and missing frames", () => {
    const data = char(
      [
        move(0, ["GFA"]),
        move(1, ["ZZZ"]),
        move(2, ["GDA"], 9999), // no frame
        move(3, ["A"], 8003), // a chain move's single key
        { ...move(4, ["A"]), from: 8000 }, // a chain
      ],
      [8000],
    );
    expect(specials(data).map((m) => m.slot)).toEqual([0]);
    expect(performable(data, move(0, ["GFA"]))).toBe(true);
  });

  it("lists one cell per slot, taking the first command", () => {
    const data = char([move(0, ["GAA"]), move(0, ["GJA"], 9800)]);
    expect(specials(data)).toHaveLength(1);
  });

  it("puts the client's rows in their tiers, three to a row", () => {
    const data = char([move(0, ["GFA"]), move(1, ["GDA"]), move(2, ["GJA"]), move(3, ["GUA"])]);
    const { cells: out, dropped } = cells(
      data,
      new Map([
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 1],
      ]),
    );
    expect(dropped).toEqual([]);
    expect(out.every((c) => c.listed)).toBe(true);
    // tier 1 fills first, then 2, then 3
    expect(out.map((c) => c.tier)).toEqual([1, 1, 2, 3]);
  });

  // a move the sprite can perform but the client's table has no row for still gets a cell
  it("gives an unlisted move a cell instead of losing it", () => {
    const listed = [0, 1, 2].map((s) => move(s, ["GFA"]));
    const data = char([...listed, move(9, ["GBFA"])]);
    const { cells: out } = cells(
      data,
      new Map([
        [0, 1],
        [1, 1],
        [2, 1],
      ]),
    );
    expect(out).toHaveLength(4);
    expect(out.find((c) => c.move.slot === 9)?.listed).toBe(false);
  });

  it("reports what cannot fit the nine cells", () => {
    const data = char(Array.from({ length: 11 }, (_, i) => move(i, ["GFA"])));
    const { cells: out, dropped } = cells(data, new Map());
    expect(out).toHaveLength(9);
    expect(dropped).toHaveLength(2);
  });
});

// the real exports: the table has to hold the nine cells, and the client's own rows never lose
// their place to an extra the sprite happens to carry
const dir = resolve(process.cwd(), "../data/assets/game/chars");
const keys = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .map((f) => f.replace(/\.json$/, ""))
  : [];

describe.skipIf(!keys.length)("every exported character's table", () => {
  it.each(keys)("%s", (key) => {
    const data = JSON.parse(readFileSync(`${dir}/${key}.json`, "utf8")) as CharData;
    if (!data.moves) return;
    const { cells: out } = cells(data, new Map());
    expect(out.length).toBeLessThanOrEqual(9);
    expect(out.every((c) => !c.listed)).toBe(true);
  });

  it("keeps the client's rows when a sprite has more specials than cells", () => {
    const data = JSON.parse(readFileSync(`${dir}/davis_r.json`, "utf8")) as CharData;
    const tiers = new Map([
      [1, 1],
      [15, 1],
      [5, 2],
      [14, 2],
      [17, 2],
      [6, 3],
      [16, 3],
    ]);
    const { cells: out, dropped } = cells(data, tiers);
    // the client's seven rows all keep their place
    expect(out.filter((c) => c.listed)).toHaveLength(7);
    // the sprite's three extra commands (GDFA, GUA, GFJ) leave two cells, so one is reported
    expect(out).toHaveLength(9);
    expect(dropped).toHaveLength(1);
    expect(out.filter((c) => !c.listed)).toHaveLength(2);
  });
});
