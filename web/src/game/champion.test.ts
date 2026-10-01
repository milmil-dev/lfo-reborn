import { newBracket, pairs, playRound, yourMatch, yourTeam } from "./champion";

// a seeded generator, so draws are repeatable
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

describe("王者爭霸", () => {
  const roster = ["davis", "stinky", "cutie", "dennis", "woody"];
  const fresh = () => newBracket({ name: "星仔", key: "stinky", lv: 30 }, "davis", roster, rng(3));

  it("draws eight teams of two, yours among them", () => {
    const b = fresh();
    expect(b.teams).toHaveLength(8);
    expect(b.teams.every((t) => t.members.length === 2)).toBe(true);
    expect(yourTeam(b).members[0].key).toBe("stinky");
    expect(pairs(b)).toHaveLength(4);
    expect(yourMatch(b)).not.toBeNull();
  });

  it("winning three rounds makes you champion", () => {
    let b = fresh();
    for (let r = 0; r < 3; r++) b = playRound(b, true, rng(r));
    expect(b.champion).toBe(yourTeam(b).id);
    expect(b.rounds.map((r) => r.length)).toEqual([8, 4, 2, 1]);
  });

  it("losing knocks you out; the cup plays on without you", () => {
    let b = playRound(fresh(), false, rng(1));
    expect(yourMatch(b)).toBeNull();
    b = playRound(b, null, rng(2));
    b = playRound(b, null, rng(3));
    expect(b.champion).not.toBeNull();
    expect(b.champion).not.toBe(yourTeam(b).id);
  });
});
