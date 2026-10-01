import {
  AP_PER_LEVEL,
  applyLevel,
  expScale,
  expToNext,
  freePoints,
  gainExp,
  levelCap,
  POINT_GAIN,
  statsAt,
  type StatTable,
  withTranCaps,
} from "./leveling";

// stinky's att row
const stinky: StatTable = {
  default: { hp: 1100, mp: 700, sp: 1050, str: 19, def: 15, agi: 14 },
  growth: { hp: 700, mp: 600, sp: 650, str: 190, def: 150, agi: 140 },
  max: { hp: 5000, mp: 5000, sp: 5000, str: 400, def: 400, agi: 400 },
};

describe("leveling", () => {
  it("carries EXP over several levels", () => {
    const r = gainExp(1, 0, expToNext(1) + expToNext(2) + 5);
    expect(r).toEqual({ level: 3, exp: 5, gained: 2 });
  });

  it("stops at LV 150, or LV 300 with 異轉", () => {
    expect(gainExp(150, 0, 1e9)).toEqual({ level: 150, exp: 0, gained: 0 });
    expect(gainExp(149, 0, 1e9, levelCap(false)).level).toBe(150);
    expect(gainExp(149, 0, 1e9, levelCap(true)).level).toBe(300);
  });

  it("grows stats from the att row", () => {
    expect(statsAt(stinky, 1)).toEqual(stinky.default);
    expect(statsAt(stinky, 11).hp).toBe(1170);
  });

  it("gives 能力點 each level and spends them on the stats, up to the max", () => {
    expect(freePoints(1)).toBe(0);
    expect(freePoints(11)).toBe(10 * AP_PER_LEVEL);
    expect(freePoints(11, { str: 5, hp: 4 })).toBe(10 * AP_PER_LEVEL - 9);
    const lv11 = statsAt(stinky, 11);
    const put = statsAt(stinky, 11, { str: 5, hp: 4 });
    expect(put.str).toBe(lv11.str + 5 * POINT_GAIN.str);
    expect(put.hp).toBe(lv11.hp + 4 * POINT_GAIN.hp);
    expect(statsAt(stinky, 11, { str: 9999 }).str).toBe(stinky.max.str);
  });

  it("scales EXP by the level difference", () => {
    expect(expScale(10, 7)).toBe(1);
    expect(expScale(12, 5)).toBeCloseTo(0.8);
    expect(expScale(3, 8)).toBeCloseTo(1.5);
  });

  it("a level-up raises max HP and adds the headroom", () => {
    const f = {
      level: 1,
      hpMax: null as number | null,
      mpMax: null as number | null,
      spMax: null as number | null,
      power: 1,
      guard: 1,
      hp: 1100,
      mp: 700,
      sp: 0,
    };
    applyLevel(f, stinky, 1);
    expect(f.sp).toBe(1050);
    f.hp = 500;
    applyLevel(f, stinky, 11);
    expect(f.hpMax).toBe(1170);
    expect(f.hp).toBe(570);
    expect(f.spMax).toBe(1115);
    expect(f.power).toBeGreaterThan(1);
  });

  it("異轉 lifts the caps to the form's (星奇 STR 400 → 新生星奇 600)", () => {
    const form = { ...stinky, max: { ...stinky.max, str: 600, def: 600, agi: 600 } };
    expect(statsAt(stinky, 300).str).toBe(400);
    expect(statsAt(withTranCaps(stinky, form), 300).str).toBe(587);
    expect(withTranCaps(stinky, null)).toBe(stinky);
  });
});
