/*
  The game's end of the wire (protocol.ts): one WebSocket to a room on the realtime Worker. The
  line-up and the chat are kept as a snapshot React can subscribe to; frames and the other
  live messages go to whoever registered for them (the bout).
*/
import { BUILD } from "@/lib/version";
import type { ClientMsg, ErrorCode, RoomState, ServerMsg } from "./protocol";
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
};

const MAX_CHAT_LINES = 60;

/** Where the realtime Worker is: VITE_REALTIME_URL, or wrangler dev's port in development. */
export function realtimeUrl(): string | null {
  const url = import.meta.env.VITE_REALTIME_URL;
  if (url) return url.replace(/\/$/, "");
  return import.meta.env.DEV ? "ws://localhost:8787" : null;
}

/** Ask the Worker for a room code nobody is using. */
export async function newRoomCode(base: string): Promise<string> {
  const res = await fetch(`${base.replace(/^ws/, "http")}/rooms/new`);
  if (!res.ok) throw new Error(`rooms/new ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export class RoomClient {
  private ws: WebSocket | null = null;
  private snap: NetSnapshot = { status: "connecting", room: null, you: -1, error: null, chat: [] };
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
      this.send({ t: "hello", name, build: BUILD });
    };
    ws.onmessage = (e) => {
      const msg = parse<ServerMsg>(e.data as string);
      if (msg) this.receive(msg);
    };
    ws.onerror = () => this.set({ error: this.snap.error ?? "network" });
    ws.onclose = () => this.set({ status: "closed" });
  }

  private receive(msg: ServerMsg) {
    if (msg.t === "room") this.set({ room: msg.room, you: msg.you });
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

  close() {
    this.ws?.close(1000, "left");
    this.ws = null;
  }
}
