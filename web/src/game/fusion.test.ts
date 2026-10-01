import { canFuse, FAIL_CHANCE, formula, fuse, nianyuanDrop, RECIPES } from "./fusion";

describe("合體", () => {
  it("knows the three fixed formulas and the players' table, in either order", () => {
    expect(formula("woody", "davis")).toBe("duncun");
    expect(formula("davis", "woody")).toBe("duncun");
    expect(formula("dilun", "zack")).toBe("karl");
    expect(formula("chiyuap", "kingp")).toBe("landon");
    expect(formula("louiss", "cutie")).toBe("code"); // 龍翼 + 米兒
    expect(formula("stinky", "yeachap")).toBe("xander"); // 星仔 + 夜剎
    expect(formula("davis", "anya")).toBe("olivia"); // 迪雲 + 安雅
    expect(formula("hector", "owen")).toBe("damian"); // 黑羅剎 + 奧龍
    expect(formula("davis", "dilun")).toBe("banick"); // 迪雲 + 迪倫
    expect(RECIPES.size).toBeGreaterThan(100);
  });

  it("a pair nobody wrote down still fuses, the same way every time, into an open one", () => {
    const a = formula("monk", "fox");
    expect(["banick", "xander", "olivia", "damian", "code"]).toContain(a);
    expect(formula("fox", "monk")).toBe(a);
  });

  it("a fusion can fail into 波加", () => {
    expect(fuse("woody", "davis", FAIL_CHANCE / 2)).toBe("pokai");
    expect(fuse("woody", "davis", 0.99)).toBe("duncun");
  });

  it("needs two different characters, neither a 合體戰神", () => {
    expect(canFuse("stinky", "stinky")).toBe(false);
    expect(canFuse("stinky", "duncun")).toBe(false);
    expect(canFuse("stinky", "cutie")).toBe(true);
  });

  it("hands out 念源體 where the players found them", () => {
    expect(nianyuanDrop({ mode: "story", chapter: 1 }, 0, 0.9)).toBe(5331); // 光
    expect(nianyuanDrop({ mode: "story", chapter: 6 }, 0, 0.9)).toBe(5333); // 地
    expect(nianyuanDrop({ mode: "mission" }, 0, 0)).toBe(5330); // 風
    expect(nianyuanDrop({ mode: "vs", dark: true }, 0, 0)).toBe(5334); // 冰
    expect(nianyuanDrop({ mode: "vs", dark: false }, 0, 0)).toBeNull();
    expect(nianyuanDrop({ mode: "story" }, 0.99, 0)).toBeNull();
  });
});
