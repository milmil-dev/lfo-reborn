/*
  VS mode: the waiting room's line-up (you, the other players at this machine and up to three
  COM players, four fighters in all) and what a bout earns.

  Teams: 0 is 獨立 (everyone for themselves), 1 – 4 the badges' colours. The engine treats team 0
  as neutral, so a free-for-all gives each fighter a team of its own.

  勳銜 (system.tzw 1773–1780 / medal01–08): 嘍囉 初心者 修行士 高手 俠客 元鬥士 戰將 尊者. The client's
  honor points and rank thresholds lived on the server; the remake's reading: a win is 12 points,
  every KO 3, a loss costs 6, and the ranks start at 0 / 30 / 100 / 250 / 500 / 900 / 1500 / 2500.
*/
import type { Device } from "./input";

export const MAX_FIGHTERS = 4;
export const TEAM_COUNT = 4;
export const COM_LEVELS = [1, 10, 30, 60, 100, 150] as const;

export type Com = { key: string; team: number; lv: number };
/** Another player at this machine: their character, team, level and the device they hold. */
export type Guest = { key: string; team: number; lv: number; device: Device };
/** You are seat 0 (on "kb"), then the guests, then the COM players. */
export type RoomSetup = {
  stage: string;
  name: string;
  team: number;
  coms: Com[];
  guests?: Guest[];
};

export const guestsOf = (setup: RoomSetup) => setup.guests ?? [];
export const seatCount = (setup: RoomSetup) => 1 + guestsOf(setup).length + setup.coms.length;

/** The engine team for a line-up slot: badges as they are, 獨立 fighters each on their own. */
export const engineTeam = (team: number, slot: number) => (team > 0 ? team : 10 + slot);

/** The next COM level above (1) or below (-1) `lv`, for the room's ▲ ▼; the ends hold. */
export function stepLevel(lv: number, dir: 1 | -1): number {
  if (dir > 0) return COM_LEVELS.find((l) => l > lv) ?? COM_LEVELS[COM_LEVELS.length - 1];
  return [...COM_LEVELS].reverse().find((l) => l < lv) ?? COM_LEVELS[0];
}

/** Teams still standing (a fighter at 0 HP is out). */
export function standing(fighters: { team: number; hp: number }[]) {
  return new Set(fighters.filter((f) => f.hp > 0).map((f) => f.team));
}

/** The winning team once only one is left, else null (still fighting) — or -1 for a wipe-out. */
export function decided(fighters: { team: number; hp: number }[]): number | null {
  const left = standing(fighters);
  if (left.size > 1) return null;
  return left.size === 1 ? [...left][0] : -1;
}

/** A line-up needs someone on another side (two teams at least) and fits the room. */
export function canLaunch(setup: RoomSetup) {
  const others = [...guestsOf(setup), ...setup.coms];
  if (!others.length || seatCount(setup) > MAX_FIGHTERS) return false;
  const teams = [setup.team, ...others.map((c) => c.team)];
  // anyone 獨立 is a side of their own
  return teams.includes(0) || new Set(teams).size > 1;
}

/** COM skill from its level: a stronger computer player specials and guards more often. */
export const comSkill = (lv: number) => Math.min(0.95, 0.25 + lv / 200);

/* ───────── 勳銜 ───────── */

export const RANKS = [
  "嘍囉",
  "初心者",
  "修行士",
  "高手",
  "俠客",
  "元鬥士",
  "戰將",
  "尊者",
] as const;
export const RANK_HONOR = [0, 30, 100, 250, 500, 900, 1500, 2500];

export function rankOf(honor: number) {
  let r = 0;
  for (let i = 0; i < RANK_HONOR.length; i++) if (honor >= RANK_HONOR[i]) r = i;
  return r;
}

export const honorFor = (won: boolean, kos: number) => (won ? 12 : -6) + kos * 3;

/** Honor after a bout and, when the rank moves, the client's own line for it. */
export function settleHonor(honor: number, won: boolean, kos: number) {
  const next = Math.max(0, honor + honorFor(won, kos));
  const from = rankOf(honor);
  const to = rankOf(next);
  const line =
    to > from
      ? `恭喜！您的勳銜從「${RANKS[from]}」升級到「${RANKS[to]}」了！`
      : to < from
        ? `您的勳銜從「${RANKS[from]}」降至「${RANKS[to]}」。`
        : null;
  return { honor: next, rank: to, line };
}
