import { EMPTY_INPUT, type InputState, TICK_HZ } from "../core/types";
import type { Fighter, Stage } from "../core/fighter";

/*
  A drama script's `move` / `run`: the actor is steered towards a point with ordinary inputs, so it
  walks (or runs) with its own frames. A wall or the room's bounds can stop it short of a point it
  cannot reach, and `wait_complete` waits for every mover, so a mover always finishes: once it is
  close enough, once it has stopped getting closer, or when it runs out of time; the last two
  put the actor on the point as the original's scripts expect.
*/

/** a mover that has not got this much closer for this long is stuck (ticks) */
const STALL_TICKS = TICK_HZ;
const STALL_PX = 1;
/** give up rather than stall a scene (ticks) */
const MAX_TICKS = TICK_HZ * 12;

export type Mover = {
  x: number;
  z: number;
  run: boolean;
  tick: number;
  /** the closest the actor has come, and the ticks since it last got closer */
  best: number;
  stall: number;
};

export const newMover = (x: number, z: number, run: boolean): Mover => ({
  x,
  z,
  run,
  tick: 0,
  best: Number.POSITIVE_INFINITY,
  stall: 0,
});

/**
 * One tick of a mover: the input that steers `f` towards the point, and whether the move is
 * over (the actor is then stopped, and on the point unless it got there by itself).
 */
export function steer(f: Fighter, m: Mover, stage: Stage): { input: InputState; done: boolean } {
  const input = { ...EMPTY_INPUT };
  m.tick++;
  const dx = m.x - f.x;
  const dz = m.z - f.z;
  const doneX = Math.abs(dx) < (m.run ? 12 : 5);
  const doneZ = Math.abs(dz) < 4;
  const dist = Math.hypot(dx, dz);
  if (dist < m.best - STALL_PX) {
    m.best = dist;
    m.stall = 0;
  } else m.stall++;
  const stuck = m.stall > STALL_TICKS || m.tick > MAX_TICKS;
  if ((doneX && doneZ) || stuck) {
    if (stuck) {
      f.x = Math.max(stage.minX, Math.min(stage.maxX, m.x));
      f.z = Math.max(stage.minZ, Math.min(stage.maxZ, m.z));
    }
    f.vx = f.vz = 0;
    if (f.anim === "WALK" || f.anim === "RUN") f.goto(f.action("STAND"));
    return { input, done: true };
  }
  if (!doneX) {
    // a run starts with a double tap, then the direction is held
    const hold = !m.run || m.tick > 3 || m.tick === 1;
    input.right = dx > 0 && hold;
    input.left = dx < 0 && hold;
  }
  if (!doneZ) {
    input.down = dz > 0;
    input.up = dz < 0;
  }
  return { input, done: false };
}
