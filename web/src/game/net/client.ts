/*
  The game's end of the wire (protocol.ts): one WebSocket to a room on the realtime Worker. The
  line-up and the chat are kept as a snapshot React can subscribe to; frames and the other
  live messages go to whoever registered for them (the bout).
*/
import { BUILD } from "@/lib/version";
import type { ClientMsg, ErrorCode, RoomState, RoomSummary, ServerMsg } from "./protocol";
import { parse } from "./protocol";

export type NetStatus = "connecting" | "open" | "closed";
export type ChatLine = { seat: number; text: string };
export type NetSnapshot = {
  status: NetStatus;
  room: RoomState | null;
  /** my seat index, -1 before the room seated me */
  you: number;
  error: ErrorCode | "network" | null;
  chat: ChatLine[];
  /** the room is replaying a bout this peer came back into (it has frames to catch up on) */
  resuming: boolean;
};

const MAX_CHAT_LINES = 60;
/** The seat's secret, by room code: a refreshed tab sends it and gets its seat back. */
const TOKEN_KEY = (code: string) => `lfo-reborn.seat.${code}`;

function readToken(code: string): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY(code));
  } catch {
    return null;
  }
}
function writeToken(code: string, token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY(code), token);
    else localStorage.removeItem(TOKEN_KEY(code));
  } catch {
    // blocked storage: the tab cannot come back to its seat, and joins afresh
  }
}

/** Where the realtime Worker is: VITE_REALTIME_URL, or wrangler dev's port in development. */
export function realtimeUrl(): string | null {
  const url = import.meta.env.VITE_REALTIME_URL;
  if (url) return url.replace(/\/$/, "");
  return import.meta.env.DEV ? "ws://localhost:8787" : null;
}

const http = (base: string) => base.replace(/^ws/, "http");

/** Ask the Worker for a room code nobody is using. */
export async function newRoomCode(base: string): Promise<string> {
  const res = await fetch(`${http(base)}/rooms/new`);
  if (!res.ok) throw new Error(`rooms/new ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

/** The rooms anyone may join, waiting ones first. */
export async function listRooms(base: string): Promise<RoomSummary[]> {
  const res = await fetch(`${http(base)}/rooms`, { cache: "no-store" });
  if (!res.ok) throw new Error(`rooms ${res.status}`);
  return ((await res.json()) as { rooms: RoomSummary[] }).rooms;
}

export class RoomClient {
  private ws: WebSocket | null = null;
  private snap: NetSnapshot = {
    status: "connecting",
    room: null,
    you: -1,
    error: null,
    chat: [],
    resuming: false,
  };
  private readonly subs = new Set<() => void>();
  private readonly handlers = new Set<(m: ServerMsg) => void>();

  constructor(
    readonly base: string,
    readonly code: string,
    name: string,
  ) {
    const ws = new WebSocket(`${base}/rooms/${code}`);
    this.ws = ws;
    ws.onopen = () => {
      this.set({ status: "open" });
      const token = readToken(code);
      this.send(
        token ? { t: "hello", name, build: BUILD, token } : { t: "hello", name, build: BUILD },
      );
    };
    ws.onmessage = (e) => {
      const msg = parse<ServerMsg>(e.data as string);
      if (msg) this.receive(msg);
    };
    ws.onerror = () => this.set({ error: this.snap.error ?? "network" });
    ws.onclose = () => this.set({ status: "closed" });
  }

  private receive(msg: ServerMsg) {
    if (msg.t === "room") {
      if (msg.token) writeToken(this.code, msg.token);
      this.set({ room: msg.room, you: msg.you });
    } else if (msg.t === "resume") this.set({ resuming: true });
    else if (msg.t === "resume-end") this.set({ resuming: false });
    else if (msg.t === "chat")
      this.set({
        chat: [...this.snap.chat, { seat: msg.seat, text: msg.text }].slice(-MAX_CHAT_LINES),
      });
    else if (msg.t === "error") this.set({ error: msg.code });
    for (const h of this.handlers) h(msg);
  }

  private set(patch: Partial<NetSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const s of this.subs) s();
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Every message as it arrives (the bout reads frames, start and desync this way). */
  onMessage(fn: (m: ServerMsg) => void) {
    this.handlers.add(fn);
    return () => void this.handlers.delete(fn);
  }

  /* useSyncExternalStore */
  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  };
  getSnapshot = () => this.snap;

  /** The replay of a resumed bout is through: the clock may run. */
  setResumed() {
    this.set({ resuming: false });
  }

  /** Leave the room for good: the seat goes now, and this tab keeps no claim on it. */
  close() {
    if (this.ws?.readyState === WebSocket.OPEN) this.send({ t: "bye" });
    writeToken(this.code, null);
    this.ws?.close(1000, "left");
    this.ws = null;
  }

  /**
   * Drop the socket without giving up the seat (the effect unmounting: a refresh, StrictMode's
   * second mount, a route change). The room keeps the seat for SEAT_GRACE_MS.
   */
  dispose() {
    this.ws?.close(1000, "away");
    this.ws = null;
  }
}
