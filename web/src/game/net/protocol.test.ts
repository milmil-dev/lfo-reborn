import { EMPTY_INPUT } from "../core/types";
import { BUTTON_BITS, canStart, packInput, type Seat, unpackInput } from "./protocol";

describe("protocol", () => {
  it("packs the nine buttons into a mask and back", () => {
    expect(packInput(EMPTY_INPUT)).toBe(0);
    const all = { ...EMPTY_INPUT };
    for (const b of BUTTON_BITS) all[b] = true;
    expect(packInput(all)).toBe(0x1ff);
    const some = { ...EMPTY_INPUT, left: true, attack: true, drop: true };
    expect(unpackInput(packInput(some))).toEqual(some);
  });

  it("starts only with two ready sides of picked characters", () => {
    const seat = (p: Partial<Seat>): Seat => ({
      name: "x",
      key: "stinky",
      team: 1,
      ready: true,
      com: false,
      online: true,
      ...p,
    });
    expect(canStart([seat({})])).toBe(false);
    expect(canStart([seat({}), seat({ team: 1 })])).toBe(false);
    expect(canStart([seat({}), seat({ team: 2 })])).toBe(true);
    expect(canStart([seat({}), seat({ team: 2, ready: false })])).toBe(false);
    expect(canStart([seat({}), seat({ team: 2, online: false })])).toBe(false);
    expect(canStart([seat({}), seat({ team: 2, key: null })])).toBe(false);
    // a COM needs no ready and no socket; 獨立 is a side of its own
    expect(canStart([seat({}), seat({ team: 1, com: true, ready: false, online: false })])).toBe(
      false,
    );
    expect(canStart([seat({}), seat({ team: 0, com: true, ready: false })])).toBe(true);
  });
});
