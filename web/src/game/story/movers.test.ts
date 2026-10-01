import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CharData } from "../core/types";
import { World } from "../core/world";
import { type Mover, newMover, steer } from "./movers";
import { type Segment, slide, wallSegments } from "./walls";

// Runs against the real exported frame data (make data); tests run from web/
const dir = resolve(process.cwd(), "../data/assets/game/chars");
const hasData = existsSync(`${dir}/stinky.json`);
const load = (key: string) => JSON.parse(readFileSync(`${dir}/${key}.json`, "utf8")) as CharData;

/**
 * The director's tick for one scripted actor: steer, step the world, slide along the walls.
 * Returns the ticks the move took, or null if it was still going after `limit` ticks.
 */
function play(world: World, walls: Segment[], m: Mover, limit = 30 * 30) {
  const f = world.fighters[0]!;
  for (let t = 1; t <= limit; t++) {
    const { input, done } = steer(f, m, world.stage);
    if (done) return t;
    const [x, z] = [f.x, f.z];
    world.step(new Map([[f.id, input]]));
    [f.x, f.z] = slide(walls, x, z, f.x, f.z);
  }
  return null;
}

describe.skipIf(!hasData)("scripted moves", () => {
  const stage = { minX: 20, maxX: 1980, minZ: 300, maxZ: 600 };

  it("reach an open point by walking", () => {
    const world = new World(stage);
    const f = world.spawn(load("stinky"), 1, 500, 450, 1);
    const ticks = play(world, [], newMover(700, 450, false));
    expect(ticks).not.toBeNull();
    expect(Math.abs(f.x - 700)).toBeLessThan(5);
    expect(f.anim).toBe("STAND");
  });

  it("finish against a wall that blocks the path, on the point", () => {
    const world = new World(stage);
    const f = world.spawn(load("stinky"), 1, 500, 450, 1);
    // a fence across the whole floor between the actor and its mark
    const walls = wallSegments([
      [
        [600, 250, 1],
        [600, 650, 0],
      ],
    ]);
    const ticks = play(world, walls, newMover(700, 450, false));
    expect(ticks).not.toBeNull();
    // stopped at the fence, then gave up about a second later rather than at the time limit
    expect(ticks!).toBeLessThan(30 * 6);
    expect([f.x, f.z]).toEqual([700, 450]);
    expect(f.anim).toBe("STAND");
  });

  it("finish when the point is outside the room, at its edge", () => {
    const world = new World(stage);
    const f = world.spawn(load("stinky"), 1, 1900, 450, 1);
    const ticks = play(world, [], newMover(2300, 450, true));
    expect(ticks).not.toBeNull();
    expect(f.x).toBe(stage.maxX);
  });
});
