import { beastLevel, downLine, raidLine, rollRaid } from "./beasts";

const beasts = [
  { sprite: 4001, stone: 5136, name: "狄加．奧比亞" },
  { sprite: 4002, stone: 5137, name: "杜巴．菲樂" },
];

describe("兇獸突襲", () => {
  it("meets a beast now and then", () => {
    expect(rollRaid(beasts, () => 0.5)).toBeNull();
    expect(rollRaid(beasts, () => 0.01)?.sprite).toBe(4001);
    expect(rollRaid([], () => 0)).toBeNull();
  });

  it("speaks the client's lines", () => {
    expect(raidLine("學校")).toBe("謎之敵人在「學校」出現了！");
    expect(downLine("杜巴．菲樂", "星仔")).toBe("杜巴．菲樂被星仔擊倒了！");
    expect(beastLevel(1)).toBe(20);
    expect(beastLevel(50)).toBe(55);
  });
});
