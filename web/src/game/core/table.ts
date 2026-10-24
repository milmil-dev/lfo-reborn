/*
  出招表 (gameinterface/default/skilltable): which specials the table lists.

  The client's table has nine cells — three rows of three, tier 1 at the bottom. The remake takes
  the rows from the client's own skill table (`skills` in data/lfo.db: the skill.tzw.bin records,
  whose slot, tier, MP and icon are the client's) and falls back to the sprite's `spm` commands
  for a character the client's table has no row for. A move that is in the sprite's commands but
  not in the client's table still gets a cell, under the sprite's own key command, so nothing a
  player can type goes unlisted — unless the grid is full, in which case the client's rows win and
  the rest are reported rather than dropped in silence.
*/
import type { CharData, Move } from "./types";

/** The directions and buttons a command is made of: 防 攻 跳 前 後 上 下. */
const COMMAND = /^[GABFJUD]+$/;

/** A move the player can start: a special (not a chain), with a frame, on a real command. */
export const performable = (data: CharData, m: Move) =>
  !m.from && !!data.frames[String(m.to)] && m.keys.some((k) => k.length > 1 && COMMAND.test(k));

/** Every special the player can start, one per slot (the first command listed wins). */
export function specials(data: CharData): Move[] {
  const bySlot = new Map<number, Move>();
  for (const m of data.moves)
    if (performable(data, m) && !bySlot.has(m.slot)) bySlot.set(m.slot, m);
  return [...bySlot.values()];
}

/** One cell of the table: the move, its row and column, and whether the client's own table lists it. */
export type Cell = { move: Move; tier: number; col: number; listed: boolean };

/** Fill the nine cells, tier 1 first; returns the cells and the moves that found no room. */
function place(moves: Move[], tierOf: (m: Move) => number, listed: boolean) {
  const out: Cell[] = [];
  const taken = new Set<string>();
  const dropped: Move[] = [];
  for (const move of moves) {
    let tier = Math.min(3, Math.max(1, tierOf(move)));
    let col = [0, 1, 2].find((c) => !taken.has(`${tier}:${c}`));
    // a full tier spills into the next free cell, as the client's own table does
    for (let r = 1; col === undefined && r <= 3; r++) {
      tier = r;
      col = [0, 1, 2].find((c) => !taken.has(`${r}:${c}`));
    }
    if (col === undefined) {
      dropped.push(move);
      continue;
    }
    taken.add(`${tier}:${col}`);
    out.push({ move, tier, col, listed });
  }
  return { out, dropped, taken };
}

/**
 * The table's cells. The client's own rows go in first, in their tiers; the sprite's extra
 * specials fill what is left, lowest tier first.
 */
export function cells(
  data: CharData,
  skillTiers: Map<number, number>,
): { cells: Cell[]; dropped: Move[] } {
  const all = specials(data);
  const listed = all
    .filter((m) => skillTiers.has(m.slot))
    .sort((a, b) => skillTiers.get(a.slot)! - skillTiers.get(b.slot)! || a.slot - b.slot);
  const extra = all.filter((m) => !skillTiers.has(m.slot)).sort((a, b) => a.slot - b.slot);
  const first = place(listed, (m) => skillTiers.get(m.slot)!, true);
  // the extras continue on the grid the client's rows already took
  const taken = new Set(first.taken);
  const rest: Cell[] = [];
  const dropped = [...first.dropped];
  for (const move of extra) {
    const free = (tier: number) => [0, 1, 2].find((c) => !taken.has(`${tier}:${c}`));
    const tier =
      free(1) !== undefined ? 1 : free(2) !== undefined ? 2 : free(3) !== undefined ? 3 : 0;
    if (!tier) {
      dropped.push(move);
      continue;
    }
    const col = free(tier)!;
    taken.add(`${tier}:${col}`);
    rest.push({ move, tier, col, listed: false });
  }
  return { cells: [...first.out, ...rest], dropped };
}
