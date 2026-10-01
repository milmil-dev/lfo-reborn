/*
  The wire between the game and a Room (realtime/src/room.ts): JSON messages over one WebSocket.
  A room is a line-up of seats (seat 0 is the host; a COM seat belongs to the host, who runs its
  brain), the rules everyone fights under (stage, one level for all), and once started a
  sequencer: every tick the room stamps one input per seat into a frame and every peer steps the
  same World with it — lockstep, so nothing but inputs ever crosses the wire.

  Inputs travel as a bitmask of the nine buttons, one number per seat. This file has no DOM and
  no "@/" imports: realtime/ compiles it too.
*/
import type { Button, InputState } from "../core/types";
import { EMPTY_INPUT } from "../core/types";

export const PROTOCOL = 1;
/** Ticks between sampling a press and the tick the room lands it on (≈ 100 ms at 30 Hz). */
export const INPUT_DELAY = 3;
/** Every peer reports its World.hash() this often; the room compares them. */
export const HASH_EVERY = 30;
export const MAX_SEATS = 4;

export const BUTTON_BITS: Button[] = [
  "up",
  "down",
  "left",
  "right",
  "attack",
  "jump",
  "defend",
  "item",
  "drop",
];

export function packInput(s: InputState): number {
  let m = 0;
  for (let i = 0; i < BUTTON_BITS.length; i++) if (s[BUTTON_BITS[i]]) m |= 1 << i;
  return m;
}

export function unpackInput(m: number): InputState {
  const s: InputState = { ...EMPTY_INPUT };
  for (let i = 0; i < BUTTON_BITS.length; i++) if (m & (1 << i)) s[BUTTON_BITS[i]] = true;
  return s;
}

export type Seat = {
  name: string;
  /** sprite key (chars/<key>); null until picked */
  key: string | null;
  /** 0 獨立, 1 – 4 the badges */
  team: number;
  ready: boolean;
  /** a computer player the host added (and whose inputs the host sends) */
  com: boolean;
  /** a person whose socket is open */
  online: boolean;
};

/** What everyone fights under: the stage and one level for all (no save data enters a bout). */
export type Rules = { stage: string; level: number };

export type RoomState = {
  code: string;
  phase: "lobby" | "fight";
  seats: Seat[];
  rules: Rules;
  /** the build the host joined with; everyone else has to match it */
  build: string;
};

/** Every person picked a character and is ready, and there are two sides. */
export function canStart(seats: Seat[]) {
  if (seats.length < 2) return false;
  if (seats.some((s) => !s.key || (!s.com && (!s.ready || !s.online)))) return false;
  const teams = seats.map((s) => s.team);
  return teams.includes(0) || new Set(teams).size > 1;
}

export type ClientMsg =
  | { t: "hello"; name: string; build: string }
  | { t: "seat"; key?: string; team?: number }
  | { t: "ready"; on: boolean }
  | { t: "rules"; rules: Partial<Rules> }
  | { t: "com"; key: string; team: number }
  | { t: "kick"; seat: number }
  | { t: "chat"; text: string }
  | { t: "start" }
  /** my sprites are in; the room's clock starts once every person has said so */
  | { t: "loaded" }
  /** my (or, from the host, a COM seat's) input for tick k */
  | { t: "i"; k: number; m: number; s?: number }
  /** my World.hash() after tick k */
  | { t: "h"; k: number; x: number }
  | { t: "end" };

export type ErrorCode = "version" | "full" | "started" | "not-host" | "bad" | "not-ready";

export type ServerMsg =
  | { t: "room"; room: RoomState; you: number }
  | { t: "chat"; seat: number; text: string }
  | { t: "start"; seed: number }
  /** the inputs of tick k, one mask per seat */
  | { t: "f"; k: number; m: number[] }
  | { t: "desync"; k: number }
  | { t: "error"; code: ErrorCode };

export const parse = <T>(raw: string | ArrayBuffer): T | null => {
  try {
    return JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as T;
  } catch {
    return null;
  }
};
