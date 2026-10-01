import { charge, drain, GAUGE_MAX, NO_TRAN, press, ready, unlocked } from "./transform";

describe("異轉", () => {
  it("needs LV 150 and the 信物", () => {
    expect(unlocked(149, true)).toBe(false);
    expect(unlocked(150, false)).toBe(false);
    expect(unlocked(150, true)).toBe(true);
  });

  it("fills on hits, transforms when full, drains and ends", () => {
    let t = charge(NO_TRAN, 700);
    expect(ready(t)).toBe(false);
    expect(press(t)).toBe(t);
    t = charge(t, 10_000);
    expect(t.gauge).toBe(GAUGE_MAX);
    t = press(t);
    expect(t.active).toBe(true);
    // hits don't refill a transformed character
    expect(charge(t, 5000)).toBe(t);
    // a fresh form can't be cancelled straight away
    expect(press(t)).toBe(t);
    for (let i = 0; i < 45 * 30 - 1; i++) t = drain(t);
    expect(t.active).toBe(true);
    t = drain(t);
    expect(t).toEqual(NO_TRAN);
  });

  it("can be cancelled once part of the gauge is spent", () => {
    let t = press(charge(NO_TRAN, 10_000));
    for (let i = 0; i < 45 * 30 * 0.4; i++) t = drain(t);
    expect(press(t)).toEqual(NO_TRAN);
  });
});
