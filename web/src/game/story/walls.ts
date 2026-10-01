/*
  Room walls, from the background files' `poy` rows: corners (x, z, flag) on the floor, where the
  flag belongs to the edge from that corner to the next — 0 open, anything else a wall nobody
  walks across. The edge back to the first corner is usually open, so most shapes are fences (a
  shop front, the rim of a lawn) rather than solid blocks; shapes with no flagged edge (the lawn
  itself, a raised stage) are just floor and are dropped by the pipeline.
*/

export type Point = [x: number, z: number, flag?: number];
export type Segment = [ax: number, az: number, bx: number, bz: number];

/** The blocking edges of every shape (corners without a flag, from older exports, all block). */
export function wallSegments(walls: Point[][]): Segment[] {
  const out: Segment[] = [];
  for (const w of walls)
    for (let i = 0; i < w.length; i++) {
      const [ax, az, flag = 1] = w[i];
      const [bx, bz] = w[(i + 1) % w.length];
      if (flag !== 0 && (ax !== bx || az !== bz)) out.push([ax, az, bx, bz]);
    }
  return out;
}

const side = (ax: number, az: number, bx: number, bz: number, px: number, pz: number) =>
  Math.sign((bx - ax) * (pz - az) - (bz - az) * (px - ax));

/**
 * Does moving from (x0, z0) to (x1, z1) cross a wall? Ending on a wall counts as crossing;
 * starting on one does not, so a fighter pressed against a wall can always step away from it.
 */
export function crossesWall(segs: Segment[], x0: number, z0: number, x1: number, z1: number) {
  if (x0 === x1 && z0 === z1) return false;
  for (const [ax, az, bx, bz] of segs) {
    const s0 = side(ax, az, bx, bz, x0, z0);
    const s1 = side(ax, az, bx, bz, x1, z1);
    if (s0 === 0 || s0 === s1) continue;
    const t0 = side(x0, z0, x1, z1, ax, az);
    const t1 = side(x0, z0, x1, z1, bx, bz);
    if (t0 !== t1 || t0 === 0) return true;
  }
  return false;
}

/** Where a move ends up: all the way, sliding along one axis, or not at all. */
export function slide(segs: Segment[], x0: number, z0: number, x1: number, z1: number): Point {
  if (!crossesWall(segs, x0, z0, x1, z1)) return [x1, z1];
  if (!crossesWall(segs, x0, z0, x1, z0)) return [x1, z0];
  if (!crossesWall(segs, x0, z0, x0, z1)) return [x0, z1];
  return [x0, z0];
}
