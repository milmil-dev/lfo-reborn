import { MAX_AHEAD, Rollback, type Sim } from "./rollback";

/*
  A toy world: each seat's total is the sum of its masks, weighted by the tick they landed on,
  so a mask moved to another tick changes the state. Its history is kept to compare the
  rollback's end state with a straight run of the same inputs.
*/
function toy() {
  const state = { totals: [0, 0], ticks: 0 };
  const log: number[][] = [];
  const sim: Sim = {
    step(masks, silent) {
      state.ticks++;
      masks.forEach((m, s) => {
        state.totals[s] += m * state.ticks;
      });
      if (!silent) log.push([...masks]);
    },
    snapshot: () => structuredClone(state),
    restore(s) {
      Object.assign(state, structuredClone(s as typeof state));
    },
    hash: () => state.totals[0] * 1000 + state.totals[1] + state.ticks * 1_000_000,
  };
  return { state, sim, log };
}

/** The state a straight run of `masks` (one row per tick, one mask per seat) ends in. */
function straight(masks: number[][]) {
  const t = toy();
  for (const row of masks) t.sim.step(row, false);
  return t.sim.hash();
}

describe("rollback", () => {
  it("guesses a quiet seat keeps its last input, then corrects the past when the frame says otherwise", () => {
    const t = toy();
    const rb = new Rollback(t.sim, 2);
    // my presses are known ahead of time; the other seat is guessed from tick 0 (nothing → 0)
    for (let k = 0; k < 6; k++) rb.setLocal(0, k, 1);
    rb.frame(0, [1, 4]); // the other seat pressed 4 at tick 0
    for (let k = 0; k < 4; k++) rb.advance();
    // guess so far: seat 1 kept pressing 4
    expect(rb.inputsFor(3)).toEqual([1, 4]);
    expect(rb.tick).toBe(4);
    // the room says seat 1 let go at tick 1: ticks 1–3 were simulated wrong
    expect(rb.frame(1, [1, 0])).toBe(true);
    expect(rb.rollbacks).toBe(1);
    expect(rb.tick).toBe(4);
    expect(t.sim.hash()).toBe(
      straight([
        [1, 4],
        [1, 0],
        [1, 0],
        [1, 0],
      ]),
    );
    // a frame that matches the guess changes nothing
    expect(rb.frame(2, [1, 0])).toBe(false);
    expect(rb.confirmed).toBe(2);
  });

  it("the replay is silent and only the live ticks were heard", () => {
    const t = toy();
    const rb = new Rollback(t.sim, 2);
    for (let k = 0; k < 4; k++) rb.setLocal(0, k, 2);
    for (let k = 0; k < 3; k++) rb.advance();
    rb.frame(0, [2, 7]);
    expect(t.log.length).toBe(3);
  });

  it("reports a confirmed tick's hash and nothing for an unconfirmed one", () => {
    const t = toy();
    const rb = new Rollback(t.sim, 1);
    for (let k = 0; k < 5; k++) {
      rb.setLocal(0, k, 1);
      rb.advance();
    }
    expect(rb.hashAfter(1)).toBeNull();
    rb.frame(0, [1]);
    rb.frame(1, [1]);
    expect(rb.confirmed).toBe(1);
    // the state after tick 1 = two ticks of mask 1: totals 1·1 + 1·2 = 3, ticks 2
    expect(rb.hashAfter(1)).toBe(3 * 1000 + 2_000_000);
    expect(rb.hashAfter(2)).toBeNull();
  });

  it("knows how far it runs ahead of the room, and gives up on a correction past its snapshots", () => {
    const t = toy();
    const rb = new Rollback(t.sim, 2);
    expect(rb.ahead).toBe(0);
    for (let k = 0; k < 30; k++) {
      rb.setLocal(0, k, 1);
      rb.advance();
    }
    expect(rb.ahead).toBe(30);
    expect(MAX_AHEAD).toBeLessThan(14);
    // a frame for tick 0 contradicting the guess, with the snapshot long gone
    rb.frame(0, [1, 9]);
    expect(rb.lost).toBe(true);
    expect(rb.ahead).toBe(29);
  });
});
