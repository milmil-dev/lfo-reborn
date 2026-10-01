/*
  The room's clock. Peers send the input they want landed on tick k; when the room's own tick
  reaches k it emits a frame with one mask per seat — what arrived, or for a seat that was late
  its last known input. Nobody waits for anybody, so one slow connection costs only that player
  (their presses land a tick late) and never stalls the room. The frames are kept: a peer that
  reconnects or joins to watch replays them, and the log is the match.
*/

export class Sequencer {
  /** the next tick to emit */
  tick = 0;
  readonly log: number[][] = [];
  private readonly pending = new Map<number, number[]>();
  private last: number[];
  /** World.hash() reports by tick, one slot per seat (-1 = not yet) */
  private readonly hashes = new Map<number, number[]>();

  constructor(readonly seats: number) {
    this.last = new Array<number>(seats).fill(0);
  }

  /** A seat's input for `tick`; false when that tick has already gone out. */
  put(seat: number, tick: number, mask: number): boolean {
    if (seat < 0 || seat >= this.seats || tick < this.tick || !Number.isInteger(tick)) return false;
    let row = this.pending.get(tick);
    if (!row) this.pending.set(tick, (row = new Array<number>(this.seats).fill(-1)));
    row[seat] = mask & 0x1ff;
    return true;
  }

  /** Emit the frame for the current tick and move on. */
  next(): number[] {
    const row = this.pending.get(this.tick);
    this.pending.delete(this.tick);
    const frame = this.last.map((l, s) => (row && row[s] >= 0 ? row[s] : l));
    this.last = frame;
    this.log.push(frame);
    this.tick++;
    return frame;
  }

  /**
   * A seat's state hash after `tick`. Once every seat has reported that tick, true when they
   * all agree, false on a desync; null while reports are still outstanding.
   */
  hash(seat: number, tick: number, x: number): boolean | null {
    if (seat < 0 || seat >= this.seats) return null;
    let row = this.hashes.get(tick);
    if (!row) this.hashes.set(tick, (row = new Array<number>(this.seats).fill(-1)));
    row[seat] = x >>> 0;
    if (row.includes(-1)) return null;
    this.hashes.delete(tick);
    // older outstanding reports can never complete once a later tick has: drop them
    for (const k of [...this.hashes.keys()]) if (k < tick) this.hashes.delete(k);
    return row.every((h) => h === row[0]);
  }
}
