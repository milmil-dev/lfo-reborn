import { SKILL_MAX, skillBonus, skillLevel, skillToNext } from "./skills";

describe("招式等級", () => {
  it("levels with use and stops at the top", () => {
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(9)).toBe(1);
    expect(skillLevel(10)).toBe(2);
    expect(skillLevel(5000)).toBe(SKILL_MAX);
    expect(skillToNext(12)).toBe(28);
    expect(skillToNext(5000)).toBe(0);
  });

  it("adds damage per level past the first", () => {
    expect(skillBonus(1)).toBe(1);
    expect(skillBonus(5)).toBeCloseTo(1.24);
  });
});
