import {
  AP_PER_LEVEL,
  applyLevel,
  expScale,
  expToNext,
  freePoints,
  gainExp,
  POINT_GAIN,
  statsAt,
  type StatTable,
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
    const f = { level: 1, hpMax: null, mpMax: null, power: 1, guard: 1, hp: 1100, mp: 700 };
    applyLevel(f, stinky, 1);
    f.hp = 500;
    applyLevel(f, stinky, 11);
    expect(f.hpMax).toBe(1170);
    expect(f.hp).toBe(570);
    expect(f.power).toBeGreaterThan(1);
  });
});
