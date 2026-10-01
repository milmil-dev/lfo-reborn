/*
  Seamless rooms. The client loads one room at a time and fades between them; the lobby's
  streets are really one long street cut into 2400 px rooms whose left / right edge exits lead
  into each other. Here those rooms are laid end to end into one strip — walk off the right of
  room 6 and you are in room 7, no fade — while doors and other exits still travel.

  Two rooms are joined only when both sides agree: A has an edge exit on the right (or left)
  that links to B, and B has an edge exit on the opposite side that links back to A. Anything
  else (an exit in the middle of a room, a one-way link) stays an ordinary exit.
*/
import type { Room, StoryData } from "./types";

export type Segment = { bg: number; dx: number; room: Room };
/** a room in the strip, and its layers / exits / entries moved into strip space */
export type StitchedRoom = Room & {
  segments: Segment[];
  entries: (Room["entries"][number] & { bg: number })[];
  exits: (Room["exits"][number] & { bg: number })[];
};

const EDGE = 60;
const MAX_ROOMS = 12;

function edgeExit(room: Room, dir: 3 | 4) {
  return room.exits.find(
    (e) => e.dir === dir && (dir === 4 ? e.x + e.w >= room.width - EDGE : e.x <= EDGE),
  );
}

/** The room joined to `bg` on its left (3) or right (4) side, if both sides agree. */
function neighbour(story: StoryData, bg: number, dir: 3 | 4): number | null {
  const room = story.rooms[String(bg)];
  const exit = room && edgeExit(room, dir);
  const link = exit && story.links[String(bg)]?.find((l) => l.link === exit.link);
  const other = link && story.rooms[String(link.toBg)];
  if (!link || !other) return null;
  const back = edgeExit(other, dir === 4 ? 3 : 4);
  const backLink = back && story.links[String(link.toBg)]?.find((l) => l.link === back.link);
  return backLink?.toBg === bg ? link.toBg : null;
}

/** The strip of rooms `bg` belongs to, left to right, with each room's x offset. */
export function stripOf(story: StoryData, bg: number): Segment[] {
  const room = (b: number) => story.rooms[String(b)];
  const segs: Segment[] = [{ bg, dx: 0, room: room(bg) }];
  const seen = new Set([bg]);
  for (let n = neighbour(story, bg, 4); n !== null && !seen.has(n) && segs.length < MAX_ROOMS;) {
    const last = segs[segs.length - 1];
    segs.push({ bg: n, dx: last.dx + last.room.width, room: room(n) });
    seen.add(n);
    n = neighbour(story, n, 4);
  }
  for (let n = neighbour(story, bg, 3); n !== null && !seen.has(n) && segs.length < MAX_ROOMS;) {
    segs.unshift({ bg: n, dx: segs[0].dx - room(n).width, room: room(n) });
    seen.add(n);
    n = neighbour(story, n, 3);
  }
  const shift = -segs[0].dx;
  return segs.map((s) => ({ ...s, dx: s.dx + shift }));
}

/** One room made of the strip: layers, walls, entries and exits moved into strip space. */
export function stitch(story: StoryData, segs: Segment[]): StitchedRoom {
  const inStrip = new Set(segs.map((s) => s.bg));
  const last = segs[segs.length - 1];
  return {
    name: segs[0].room.name,
    width: last.dx + last.room.width,
    upper: Math.min(...segs.map((s) => s.room.upper)),
    lower: Math.max(...segs.map((s) => s.room.lower)),
    friction: segs[0].room.friction,
    segments: segs,
    layers: segs.flatMap(({ room, dx }) =>
      room.layers.map((l) =>
        // a parallax layer keeps its own room's view (x + dx · ratio) and is clipped to it
        l.ratio === 1
          ? { ...l, x: l.x + dx }
          : { ...l, x: l.x + dx * l.ratio, clip: [dx, dx + room.width] as [number, number] },
      ),
    ),
    entries: segs.flatMap(({ room, dx, bg }) =>
      room.entries.map((e) => ({ ...e, x: e.x + dx, bg })),
    ),
    exits: segs.flatMap(({ room, dx, bg }) =>
      room.exits
        .filter((e) => {
          // exits that became seams disappear
          if (e.dir !== 3 && e.dir !== 4) return true;
          const n = neighbour(story, bg, e.dir as 3 | 4);
          return !(n !== null && inStrip.has(n) && edgeExit(room, e.dir as 3 | 4) === e);
        })
        .map((e) => ({ ...e, x: e.x + dx, bg })),
    ),
    walls: segs.flatMap(({ room, dx }) =>
      room.walls.map((w) => w.map(([x, z, ...rest]) => [x + dx, z, ...rest] as [number, number])),
    ),
  };
}

/** The strip segment under an x in strip space. */
export function segmentAt(room: StitchedRoom, x: number) {
  return (
    room.segments.find((s) => x < s.dx + s.room.width) ?? room.segments[room.segments.length - 1]
  );
}
