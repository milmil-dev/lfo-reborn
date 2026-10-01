/*
  Computer-controlled fighters: story enemies and the waiting room's COM players. A brain
  presses the same buttons a player does, one tick at a time, so everything it does goes through
  the engine's own rules (MP, chains, guard, items):
  - closes in on the nearest fighter of another team (team 0 is neutral) and punches in reach;
  - types a special now and then — 防 then the rest of the command, a key a tick — when it has
    the MP, facing its target first so 前 / 後 mean what they should;
  - holds 防 for a moment when the target is mid-attack close by.
  `skill` (0 … 1) scales how often it uses specials and guards: story enemies sit low, COM
  players rise with the level they are given.
*/
import type { Fighter } from "./core/fighter";
import { EMPTY_INPUT, type InputState } from "./core/types";

export type Brain = {
  skill: number;
  cooldown: number;
  pause: number;
  press: boolean;
  guard: number;
  queue: Partial<InputState>[];
};

export const newBrain = (skill: number, rand = Math.random): Brain => ({
  skill,
  cooldown: 20 + rand() * 30,
  pause: 0,
  press: false,
  guard: 0,
  queue: [],
});

const REACH = 55;
const KEY: Record<string, keyof InputState | "F" | "B"> = {
  G: "defend",
  A: "attack",
  J: "jump",
  U: "up",
  D: "down",
  F: "F",
  B: "B",
};

/** The nearest standing fighter of another team. */
export function nearestFoe(f: Fighter, fighters: Fighter[]) {
  let best: Fighter | null = null;
  let d = Number.POSITIVE_INFINITY;
  for (const o of fighters) {
    if (o === f || o.effect || o.isItem || o.team === 0 || o.team === f.team || o.hp <= 0) continue;
    const dd = Math.abs(o.x - f.x) + Math.abs(o.z - f.z) * 2;
    if (dd < d) {
      d = dd;
      best = o;
    }
  }
  return best;
}

/** One tick of a computer player's buttons. */
export function think(f: Fighter, fighters: Fighter[], b: Brain, rand = Math.random): InputState {
  const input = { ...EMPTY_INPUT };
  const queued = b.queue.shift();
  if (queued) return { ...input, ...queued };
  const foe = nearestFoe(f, fighters);
  if (!foe || f.hp <= 0) return input;
  if (b.pause > 0) {
    b.pause--;
    return input;
  }
  if (rand() < 0.005) b.pause = 15 + rand() * 25;

  const dx = foe.x - f.x;
  const dz = foe.z - f.z;
  const toward = dx > 0 ? 1 : -1;

  // guard against an attack about to land
  if (b.guard > 0) {
    b.guard--;
    return { ...input, defend: true };
  }
  if (
    foe.frame.atk?.length &&
    Math.abs(dx) < 100 &&
    Math.abs(dz) < 20 &&
    toward === f.facing &&
    rand() < b.skill * 0.15
  ) {
    b.guard = 8 + Math.floor(rand() * 8);
    return { ...input, defend: true };
  }

  b.cooldown--;
  // a special: face the target, then type the command a key a tick
  if (b.cooldown <= 0 && Math.abs(dz) < 24 && Math.abs(dx) < 320 && rand() < 0.04 + b.skill * 0.3) {
    const moves = f.data.moves.filter(
      (m) =>
        !m.from &&
        m.keys[0].length >= 2 &&
        m.keys[0].startsWith("G") &&
        m.keys[0].split("").every((k) => k in KEY) &&
        f.mp >= m.mp &&
        f.frameAt(m.to),
    );
    const m = moves[Math.floor(rand() * moves.length)];
    if (m) {
      b.cooldown = 40 + rand() * 50;
      if (f.facing !== toward) b.queue.push({ [toward > 0 ? "right" : "left"]: true }, {});
      for (const k of m.keys[0]) {
        const key = KEY[k];
        const button =
          key === "F"
            ? toward > 0
              ? "right"
              : "left"
            : key === "B"
              ? toward > 0
                ? "left"
                : "right"
              : key;
        b.queue.push({ [button]: true }, {});
      }
      return input;
    }
  }

  // close in, then punch
  if (Math.abs(dx) > REACH) {
    input.right = dx > 0;
    input.left = dx < 0;
  } else if (toward !== f.facing) {
    input.right = dx > 0;
    input.left = dx < 0;
  }
  if (Math.abs(dz) > 8) {
    input.down = dz > 0;
    input.up = dz < 0;
  }
  if (Math.abs(dx) <= REACH + 10 && Math.abs(dz) <= 12 && b.cooldown <= 0) {
    b.press = !b.press;
    input.attack = b.press;
    if (!b.press) b.cooldown = 18 + rand() * 30 * (1 - b.skill * 0.5);
  }
  return input;
}
