import { DURATION, inflict, isHeld, tickStatus, type StatusKind } from "./status";

const victim = (hp = 1000) => ({ hp, maxHp: 1000, status: new Map<StatusKind, number>() });

describe("elements", () => {
  it("reads the element bits of a hit", () => {
    const v = victim();
    expect(inflict(v, 8 | 1024)).toEqual(["burn", "poison"]);
    expect(inflict(v, 2)).toEqual([]); // wind is just the knock-back
  });

  it("burns a little HP while it lasts, then ends", () => {
    const v = victim();
    inflict(v, 8);
    let ended: StatusKind[] = [];
    for (let i = 0; i < DURATION.burn; i++) ended = tickStatus(v);
    expect(ended).toEqual(["burn"]);
    expect(v.hp).toBeLessThan(1000);
    expect(v.hp).toBeGreaterThan(900);
  });

  it("poison never finishes anyone", () => {
    const v = victim(2);
    inflict(v, 1024);
    for (let i = 0; i < DURATION.poison; i++) tickStatus(v);
    expect(v.hp).toBe(1);
  });

  it("holds in ice until it melts or another hit shatters it", () => {
    const v = victim();
    inflict(v, 4);
    expect(isHeld(v)).toBe(true);
    inflict(v, 0);
    expect(isHeld(v)).toBe(false);
  });
});
