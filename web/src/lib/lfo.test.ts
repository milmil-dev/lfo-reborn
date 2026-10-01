import { characterGroup, parseKeys } from "./lfo";

describe("parseKeys", () => {
  it("maps .spt inputs to key caps", () => {
    expect(parseKeys("GFA").map((k) => k.label)).toEqual(["防", "→", "攻"]);
    expect(parseKeys("GUJ").map((k) => k.kind)).toEqual(["action", "direction", "action"]);
  });
  it("keeps unknown letters visible", () => {
    expect(parseKeys("X")[0]).toEqual({ label: "X", kind: "action" });
  });
});

describe("characterGroup", () => {
  it("splits heroes, 7xxx forms and the rest", () => {
    expect(characterGroup({ id: 2, base_id: null })).toBe("hero");
    expect(characterGroup({ id: 7002, base_id: 2 })).toBe("form");
    expect(characterGroup({ id: 263, base_id: null })).toBe("other");
  });
});
