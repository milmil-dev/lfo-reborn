/*
  升級系統 — EXP, levels and stat growth.

  From the client: every character's .spt `att` row has a DEFAULT and a growth (MULT) value per
  stat (the API's stats_default / stats_growth / stats_max), each character has a LEVELUP action
  that spawns the level-up light (blaster 800), and story monsters carry a level and an exp value.
  From the original rules page (legacy/content/docs/system/exp.mdx): a monster's EXP follows its
  level; a player more than 5 levels above it gets proportionally less, a player below it more.

  The level curve and the monster EXP formula were server-side and never shipped with the client,
  so the numbers below are this remake's: a chapter of 第一章 takes a new character to about LV 3.
*/

export const MAX_LEVEL = 100;

export type Stats = { hp: number; mp: number; sp: number; str: number; def: number; agi: number };
export type StatTable = { default: Stats; growth: Stats; max: Stats };

/** EXP needed to go from `level` to `level + 1`. */
export const expToNext = (level: number) => 40 * level + 10 * level * level;

/** A monster's EXP: its own value when the story gives one, otherwise from its level. */
export const monsterExp = (level: number, exp = 0) => (exp > 0 ? exp : 8 + 4 * Math.max(1, level));

/** Level difference: −10 % per level beyond 5 above the monster (min 10 %), +10 % per level below it (max 2×). */
export function expScale(player: number, monster: number) {
  const d = player - monster;
  if (d > 5) return Math.max(0.1, 1 - 0.1 * (d - 5));
  if (d < 0) return Math.min(2, 1 + 0.1 * -d);
  return 1;
}

/*
  能力點 — the chara table's AP box and its up-arrow buttons (LFO.exe draws the free points at
  (370, 41) and an uparrowbutton beside HP / MP / SP and STR / DEF / AGI). What a level gives and
  what a point adds were the server's; the remake's: 3 points a level, a point +15 HP / MP / SP or
  +2 STR / DEF / AGI, never past the character's max. Equipment asks for these stats (items.req),
  and the street's 能力重設員 gives the points back.
*/
export const AP_PER_LEVEL = 3;
export const POINT_GAIN: Stats = { hp: 15, mp: 15, sp: 15, str: 2, def: 2, agi: 2 };
export type Points = Partial<Stats>;

/** Points earned by `level` and not yet spent. */
export function freePoints(level: number, points: Points = {}) {
  const spent = Object.values(points).reduce((n, v) => n + (v ?? 0), 0);
  return Math.max(0, AP_PER_LEVEL * (level - 1) - spent);
}

/**
 * Stats at a level: DEFAULT + growth × (level − 1) / 100, plus the points put into each,
 * capped at the character's max.
 */
export function statsAt(t: StatTable, level: number, points: Points = {}): Stats {
  const out = {} as Stats;
  for (const k of Object.keys(t.default) as (keyof Stats)[])
    out[k] = Math.min(
      t.max[k],
      Math.round(
        t.default[k] + (t.growth[k] * (level - 1)) / 100 + (points[k] ?? 0) * POINT_GAIN[k],
      ),
    );
  return out;
}

/** 能力重設: from this level, for this fee (system.tzw 1798 – 1802 name both; the values are the remake's). */
export const RESET_LEVEL = 10;
export const resetFee = (level: number) => 500 * level;

/** Add EXP; returns the new level / EXP-into-level and how many levels were gained. */
export function gainExp(level: number, exp: number, amount: number) {
  let lv = level;
  let e = exp + Math.max(0, Math.round(amount));
  while (lv < MAX_LEVEL && e >= expToNext(lv)) {
    e -= expToNext(lv);
    lv++;
  }
  if (lv >= MAX_LEVEL) e = 0;
  return { level: lv, exp: e, gained: lv - level };
}

/** The API's per-character tables (lib/api CharacterDetail) as a StatTable. */
export const statTable = (c: {
  stats_default: Stats;
  stats_growth: Stats;
  stats_max: Stats;
}): StatTable => ({ default: c.stats_default, growth: c.stats_growth, max: c.stats_max });

/**
 * Give a fighter the stats of `level`: HP / MP from the table, and STR / DEF as damage dealt /
 * taken multipliers relative to level 1 (square-rooted, so LV 100 hits about 3× as hard).
 */
export function applyLevel(
  f: {
    level: number;
    hpMax: number | null;
    mpMax: number | null;
    power: number;
    guard: number;
    hp: number;
    mp: number;
  },
  t: StatTable,
  level: number,
  /** worn equipment's bonus (inventory.equipBonus) */
  bonus?: Stats,
  /** the player's 能力點 */
  points?: Points,
) {
  const s = statsAt(t, level, points);
  if (bonus) for (const k of Object.keys(s) as (keyof Stats)[]) s[k] += bonus[k];
  const first = f.hpMax === null;
  const hpUp = s.hp - (f.hpMax ?? s.hp);
  const mpUp = s.mp - (f.mpMax ?? s.mp);
  f.level = level;
  f.hpMax = s.hp;
  f.mpMax = s.mp;
  f.power = Math.sqrt(s.str / Math.max(1, t.default.str));
  f.guard = Math.sqrt(s.def / Math.max(1, t.default.def));
  // first application fills up; a level-up adds the gained headroom
  f.hp = first ? s.hp : Math.min(s.hp, f.hp + Math.max(0, hpUp));
  f.mp = first ? s.mp : Math.min(s.mp, f.mp + Math.max(0, mpUp));
}
