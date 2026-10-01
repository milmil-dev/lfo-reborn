import { describe, expect, it } from "vitest";
import { Sequencer } from "./sequencer";

describe("sequencer", () => {
  it("stamps what arrived for the tick and repeats a late seat's last input", () => {
    const s = new Sequencer(3);
    expect(s.put(0, 0, 0b1)).toBe(true);
    expect(s.put(1, 0, 0b10)).toBe(true);
    expect(s.next()).toEqual([1, 2, 0]);
    // seat 1 is late for tick 1: its tick-0 input stands in
    s.put(0, 1, 0b100);
    s.put(2, 1, 0b1000);
    expect(s.next()).toEqual([4, 2, 8]);
    expect(s.tick).toBe(2);
    expect(s.log).toEqual([
      [1, 2, 0],
      [4, 2, 8],
    ]);
  });

  it("refuses inputs for ticks already emitted, bad seats and non-integer ticks", () => {
    const s = new Sequencer(2);
    s.next();
    expect(s.put(0, 0, 1)).toBe(false);
    expect(s.put(2, 1, 1)).toBe(false);
    expect(s.put(0, 1.5, 1)).toBe(false);
    expect(s.put(0, 1, 1)).toBe(true);
  });

  it("keeps only the nine button bits of a mask", () => {
    const s = new Sequencer(1);
    s.put(0, 0, 0xffff);
    expect(s.next()).toEqual([0x1ff]);
  });

  it("compares the peers' hashes once every seat has reported a tick", () => {
    const s = new Sequencer(2);
    expect(s.hash(0, 30, 123)).toBeNull();
    expect(s.hash(1, 30, 123)).toBe(true);
    expect(s.hash(0, 60, 1)).toBeNull();
    // a stale report for an earlier tick never completes once a later one has
    expect(s.hash(0, 45, 7)).toBeNull();
    expect(s.hash(1, 60, 2)).toBe(false);
    expect(s.hash(1, 45, 7)).toBeNull();
  });
});
