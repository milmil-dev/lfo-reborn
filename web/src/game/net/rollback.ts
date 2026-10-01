/*
  Rollback over the room's frames (protocol.ts). The bout runs on the local clock: every tick
  the world steps with what is known — my own presses (sent for a tick INPUT_DELAY ahead, so
  they are always known by then), the COM presses this peer drives, the room's frame for the
  tick when it has arrived — and, for every other seat, the guess that they kept pressing what
  they pressed last. A snapshot is taken before each tick. When the room's frame for a tick
  already simulated arrives and differs from the guess, the world goes back to that tick's
  snapshot and replays up to the present, silently (no sounds twice). The local clock may run
  only MAX_AHEAD ticks past the room's latest frame, so a guess never gets older than the
  snapshots kept, and catches up when the room is ahead.
*/

export type Sim = {
  /** step the world with one input mask per seat; `silent` while replaying */
  step(masks: number[], silent: boolean): void;
  snapshot(): unknown;
  restore(snapshot: unknown): void;
  hash(): number;
};

/** how far the local clock may run past the room's latest frame */
export const MAX_AHEAD = 8;
/** snapshots kept; a correction further back than this cannot be made */
const WINDOW = 14;

export class Rollback {
  /** the next tick to simulate locally */
  tick = 0;
  /** every frame up to this tick has arrived */
  confirmed = -1;
  /** the highest frame tick received */
  latest = -1;
  /** a frame older than the snapshots kept arrived: the state cannot be corrected any more */
  lost = false;
  rollbacks = 0;

  private readonly frames = new Map<number, number[]>();
  /** inputs this peer produces (its own seat, the COM seats it drives), by tick then seat */
  private readonly known = new Map<number, Map<number, number>>();
  /** the masks each simulated tick used */
  private used: number[][] = [];
  /** the state before each tick in `used`, and its hash */
  private snaps: { k: number; s: unknown; h: number }[] = [];

  constructor(
    private readonly sim: Sim,
    readonly seats: number,
  ) {}

  /** An input this peer produced for `seat` at tick `k` (its own, or a COM it drives). */
  setLocal(seat: number, k: number, mask: number) {
    let row = this.known.get(k);
    if (!row) this.known.set(k, (row = new Map()));
    row.set(seat, mask);
  }

  /** What tick `k` is stepped with right now: the frame, else what this peer knows, else the guess. */
  inputsFor(k: number): number[] {
    const frame = this.frames.get(k);
    const row = this.known.get(k);
    const prev = this.used[k - 1];
    return Array.from(
      { length: this.seats },
      (_, s) => frame?.[s] ?? row?.get(s) ?? prev?.[s] ?? 0,
    );
  }

  /** Simulate the next local tick. */
  advance() {
    this.run(false);
  }

  private run(silent: boolean) {
    this.snaps.push({ k: this.tick, s: this.sim.snapshot(), h: this.sim.hash() });
    if (this.snaps.length > WINDOW) this.snaps.shift();
    const masks = this.inputsFor(this.tick);
    this.used[this.tick] = masks;
    this.sim.step(masks, silent);
    this.tick++;
  }

  /** The room's frame for tick `k`. True when it corrected the past (a rollback happened). */
  frame(k: number, masks: number[]): boolean {
    this.frames.set(k, masks);
    if (k > this.latest) this.latest = k;
    while (this.frames.has(this.confirmed + 1)) this.confirmed++;
    if (k >= this.tick) return false;
    const guess = this.used[k];
    if (guess && masks.every((m, s) => m === guess[s])) return false;
    return this.rewind(k);
  }

  private rewind(k: number): boolean {
    const i = this.snaps.findIndex((s) => s.k === k);
    if (i < 0) {
      this.lost = true;
      return false;
    }
    this.sim.restore(this.snaps[i].s);
    this.snaps.length = i;
    const end = this.tick;
    this.tick = k;
    this.used.length = k;
    while (this.tick < end) this.run(true);
    this.rollbacks++;
    return true;
  }

  /**
   * The hash of the state after tick `k`, once every tick up to `k` is confirmed — what every
   * peer reports to the room (HASH_EVERY); null while unconfirmed or already forgotten.
   */
  hashAfter(k: number): number | null {
    if (k > this.confirmed) return null;
    return this.snaps.find((s) => s.k === k + 1)?.h ?? null;
  }

  /** How many ticks the local clock is past the room's latest frame. */
  get ahead() {
    return this.tick - (this.latest + 1);
  }
}
