import type { StoryData } from "./story/types";

/*
  小地圖 — the newer client's map above the bottom-right corner: every room is a thin outlined
  box as long as the room is wide, laid out the way the rooms join (a door to the left / right
  sits beside, a door at the back / front a row up / down), with the doors marked green, you
  white and everyone else blue.

  The lobby has dozens of rooms; there only the room you are in and the ones its doors lead to
  are drawn, as the client does ("簡化成了三個區域").
*/

/** box length per room pixel, the box height and the gaps between boxes (HUD units) */
export const MAP_SCALE = 1 / 28;
export const BOX_H = 6;
const GAP_X = 6;
const GAP_Y = 9;
const MIN_W = 18;
const MAX_W = 90;
/** more rooms than this and only the neighbourhood of the current one is drawn */
const WHOLE_MAP = 10;

export type MapBox = {
  bg: number;
  x: number;
  y: number;
  w: number;
  /** each door's place along the box, 0 – 1 */
  doors: number[];
};

// exit directions in the client's data: 1 back (up), 2 front (down), 3 left, 4 right
const STEP: Record<number, [number, number]> = { 1: [-1, 0], 2: [1, 0], 3: [0, -1], 4: [0, 1] };

/** The boxes of the map around room `current`, in HUD units from the top-left. */
export function layoutMap(story: StoryData, current: number): MapBox[] {
  const rooms = story.rooms;
  if (!rooms[String(current)]) return [];
  const depthLimit = Object.keys(rooms).length > WHOLE_MAP ? 1 : Number.POSITIVE_INFINITY;

  // place rooms on a grid by how their doors join, nearest first
  const cell = new Map<number, { row: number; col: number }>([[current, { row: 0, col: 0 }]]);
  const taken = new Set(["0,0"]);
  const queue: [number, number][] = [[current, 0]];
  while (queue.length) {
    const [bg, depth] = queue.shift()!;
    if (depth >= depthLimit) continue;
    const at = cell.get(bg)!;
    for (const e of rooms[String(bg)].exits) {
      const to = story.links[String(bg)]?.find((l) => l.link === e.link)?.toBg;
      if (to === undefined || cell.has(to) || !rooms[String(to)]) continue;
      const [dr, dc] = STEP[e.dir] ?? [1, 0];
      const row = at.row + dr;
      // the nearest free column on that row, walking away from the parent
      let col = at.col + dc;
      for (let k = 1; taken.has(`${row},${col}`); k++) col = at.col + dc + (k % 2 ? k : -k);
      cell.set(to, { row, col });
      taken.add(`${row},${col}`);
      queue.push([to, depth + 1]);
    }
  }

  // each row laid out left to right by column, rows centred on one another
  const rows = new Map<number, number[]>();
  for (const [bg, { row }] of cell) rows.set(row, [...(rows.get(row) ?? []), bg]);
  const order = [...rows.keys()].sort((a, b) => a - b);
  const widthOf = (bg: number) =>
    Math.min(MAX_W, Math.max(MIN_W, Number(rooms[String(bg)].width) * MAP_SCALE));
  const lines = order.map((row) => {
    const bgs = rows.get(row)!.sort((a, b) => cell.get(a)!.col - cell.get(b)!.col);
    const total = bgs.reduce((n, bg) => n + widthOf(bg), 0) + GAP_X * (bgs.length - 1);
    return { bgs, total };
  });
  const span = Math.max(...lines.map((l) => l.total));
  return lines.flatMap(({ bgs, total }, r) => {
    let x = (span - total) / 2;
    return bgs.map((bg) => {
      const room = rooms[String(bg)];
      const w = widthOf(bg);
      const box: MapBox = {
        bg,
        x,
        y: r * (BOX_H + GAP_Y),
        w,
        doors: room.exits.map((e) =>
          Math.min(1, Math.max(0, (Number(e.x) + Number(e.w) / 2) / Number(room.width))),
        ),
      };
      x += w + GAP_X;
      return box;
    });
  });
}
