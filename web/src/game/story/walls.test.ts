import { crossesWall, type Point, slide, wallSegments } from "./walls";

// the lobby (room 0), as the client lists them: a shop front whose closing edge is open …
const shop: Point[] = [
  [1829, 219, 1],
  [1784, 260, 1],
  [1642, 259, 1],
  [1636, 171, 0],
];
// … and a bench, all of whose edges block
const bench: Point[] = [
  [1866, 384, 1],
  [1897, 360, 1],
  [1984, 358, 1],
  [2009, 380, 1],
  [2009, 392, 1],
  [1988, 408, 1],
  [1893, 409, 1],
  [1865, 387, 1],
  [1865, 377, 0],
];

describe("room walls", () => {
  const segs = wallSegments([shop, bench]);

  it("flagged edges block, the open edge does not", () => {
    expect(crossesWall(segs, 1700, 300, 1700, 240)).toBe(true); // through the shop front
    expect(crossesWall(segs, 1600, 150, 1700, 150)).toBe(false); // along the open back
  });

  it("walking into a wall slides along it", () => {
    expect(slide(segs, 1700, 262, 1710, 255)).toEqual([1710, 262]);
  });

  it("a bench cannot be entered from any side", () => {
    expect(crossesWall(segs, 1930, 330, 1930, 385)).toBe(true);
    expect(crossesWall(segs, 1930, 440, 1930, 385)).toBe(true);
  });

  it("a fighter standing on a wall can step away from it", () => {
    expect(crossesWall(segs, 1700, 259.5, 1700, 280)).toBe(false);
  });
});
