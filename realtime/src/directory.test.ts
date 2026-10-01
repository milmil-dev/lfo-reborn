import { describe, expect, it } from "vitest";
import { summarize } from "../../web/src/game/net/protocol";
import { listing } from "./listing";

const room = (code: string, phase: "lobby" | "fight", seats: number) =>
  summarize(
    {
      code,
      phase,
      build: "dev",
      rules: { stage: "vs_school", level: 10, name: "", listed: true },
      seats: Array.from({ length: seats }, (_, i) => ({
        name: i ? `P${i + 1}` : "阿強",
        key: "stinky",
        team: 1,
        ready: false,
        com: false,
        online: true,
      })),
    },
    0,
  );

describe("directory", () => {
  it("lists rooms still waiting first, newest first within each group", () => {
    const a = { ...room("AAAA", "fight", 2), updatedAt: 300 };
    const b = { ...room("BBBB", "lobby", 1), updatedAt: 100 };
    const c = { ...room("CCCC", "lobby", 3), updatedAt: 200 };
    expect(listing([a, b, c]).map((r) => r.code)).toEqual(["CCCC", "BBBB", "AAAA"]);
  });

  it("names a room after its host when the host typed none", () => {
    const s = room("DDDD", "lobby", 2);
    expect(s.name).toBe("阿強的遊戲室");
    expect(s.host).toBe("阿強");
    expect(s.seats).toBe(2);
  });
});
