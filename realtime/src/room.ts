/*
  A game room: the people in it, their seats and the rules while they wait, and once the host
  starts, the sequencer that stamps every tick's inputs (sequencer.ts). The room never runs the
  game — every peer steps its own World — so one object serves a room on a few messages a second.

  Sockets use the hibernation API: the object sleeps between lobby messages, so the line-up lives
  in storage and each socket carries its seat index as its attachment. A fight keeps a 30 Hz
  timer, which keeps the object awake for its duration; the input log stays in memory and ends
  with the fight.
*/
import { DurableObject } from "cloudflare:workers";
import {
  canStart,
  type ClientMsg,
  type ErrorCode,
  MAX_SEATS,
  parse,
  type RoomState,
  type ServerMsg,
} from "../../web/src/game/net/protocol";
import type { Env } from "./index";
import { Sequencer } from "./sequencer";

const TICK_MS = 1000 / 30;
/** a fight that runs this long ends on its own (the result board came and went long ago) */
const MAX_FIGHT_TICKS = 30 * 60 * 20;
/** the clock starts when every person has loaded, or this long after the start at the latest */
const LOAD_GRACE_MS = 15_000;
const MAX_CHAT = 120;

type Attachment = { seat: number };

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  private seq: Sequencer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** seats whose sprites are in, between start and the first tick */
  private loaded = new Set<number>();
  private grace: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>("room")) ?? null;
      // woken mid-fight (the object was evicted): the sequencer is gone, so is the fight
      if (this.room?.phase === "fight") {
        this.room.phase = "lobby";
        for (const s of this.room.seats) s.ready = false;
        await this.save();
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/exists") return new Response(this.room ? "1" : "0");
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("websocket only", { status: 426 });
    const code = url.pathname.split("/").pop() ?? "";
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // the seat is taken on hello; until then the socket is a visitor
    server.serializeAttachment({ seat: -1 } satisfies Attachment);
    this.ctx.acceptWebSocket(server);
    if (!this.room) {
      this.room = {
        code,
        phase: "lobby",
        seats: [],
        rules: { stage: "vs_school", level: 10 },
        build: "",
      };
      await this.save();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ───────── sockets ───────── */

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = parse<ClientMsg>(raw);
    const room = this.room;
    if (!msg || !room) return;
    const { seat } = ws.deserializeAttachment() as Attachment;

    if (msg.t === "hello") {
      if (seat >= 0) return;
      if (room.phase !== "lobby") return this.fail(ws, "started");
      if (room.seats.length >= MAX_SEATS) return this.fail(ws, "full");
      // the host's build is the room's; everyone else must run the same one
      if (!room.seats.length) room.build = String(msg.build ?? "");
      else if (room.build !== msg.build) return this.fail(ws, "version");
      const index = room.seats.length;
      room.seats.push({
        name: String(msg.name ?? "").slice(0, 16) || `P${index + 1}`,
        key: null,
        team: index % 2 === 0 ? 1 : 2,
        ready: false,
        com: false,
        online: true,
      });
      ws.serializeAttachment({ seat: index } satisfies Attachment);
      await this.save();
      return this.broadcastRoom();
    }
    if (seat < 0 || seat >= room.seats.length) return;
    const host = seat === 0;

    switch (msg.t) {
      case "loaded": {
        if (!this.seq || this.timer) return;
        this.loaded.add(seat);
        if (room.seats.every((s, i) => s.com || !s.online || this.loaded.has(i))) this.begin();
        return;
      }
      case "i": {
        if (!this.seq) return;
        const s = msg.s ?? seat;
        // a seat's own input, or the host's for a COM seat
        if (s !== seat && !(host && room.seats[s]?.com)) return;
        this.seq.put(s, msg.k, msg.m);
        return;
      }
      case "h": {
        if (!this.seq) return;
        if (this.seq.hash(seat, msg.k, msg.x) === false) this.broadcast({ t: "desync", k: msg.k });
        return;
      }
      case "chat": {
        const text = String(msg.text ?? "")
          .trim()
          .slice(0, MAX_CHAT);
        if (text) this.broadcast({ t: "chat", seat, text });
        return;
      }
      case "end":
        // the host's result board came up: the clock stops and everyone sits down again
        if (!host || room.phase !== "fight") return;
        return this.finish();
    }

    if (room.phase !== "lobby") return;
    switch (msg.t) {
      case "seat": {
        const me = room.seats[seat];
        if (typeof msg.key === "string") me.key = msg.key.slice(0, 32);
        if (typeof msg.team === "number") me.team = clampTeam(msg.team);
        me.ready = false;
        break;
      }
      case "ready":
        room.seats[seat].ready = !!msg.on && !!room.seats[seat].key;
        break;
      case "rules": {
        if (!host) return this.fail(ws, "not-host");
        const { stage, level } = msg.rules ?? {};
        if (typeof stage === "string") room.rules.stage = stage.slice(0, 32);
        if (typeof level === "number") room.rules.level = Math.max(1, Math.min(300, level | 0));
        for (const s of room.seats) if (!s.com) s.ready = false;
        break;
      }
      case "com": {
        if (!host) return this.fail(ws, "not-host");
        if (room.seats.length >= MAX_SEATS) return this.fail(ws, "full");
        room.seats.push({
          name: "COM",
          key: String(msg.key ?? "").slice(0, 32),
          team: clampTeam(msg.team),
          ready: true,
          com: true,
          online: true,
        });
        break;
      }
      case "kick": {
        if (!host) return this.fail(ws, "not-host");
        const target = room.seats[msg.seat];
        if (!target || msg.seat === 0) return;
        for (const sock of this.ctx.getWebSockets()) {
          const a = sock.deserializeAttachment() as Attachment;
          if (a.seat === msg.seat) sock.close(4000, "kicked");
          else if (a.seat > msg.seat) sock.serializeAttachment({ seat: a.seat - 1 });
        }
        room.seats.splice(msg.seat, 1);
        break;
      }
      case "start": {
        if (!host) return this.fail(ws, "not-host");
        if (!canStart(room.seats)) return this.fail(ws, "not-ready");
        room.phase = "fight";
        this.seq = new Sequencer(room.seats.length);
        this.loaded.clear();
        await this.save();
        this.broadcastRoom();
        this.broadcast({ t: "start", seed: (Math.random() * 0x100000000) >>> 0 });
        // the clock waits for everyone's sprites (loaded), but not forever
        this.grace = setTimeout(() => this.begin(), LOAD_GRACE_MS);
        return;
      }
      default:
        return;
    }
    await this.save();
    this.broadcastRoom();
  }

  async webSocketClose(ws: WebSocket) {
    const room = this.room;
    const { seat } = ws.deserializeAttachment() as Attachment;
    if (!room || seat < 0 || seat >= room.seats.length) return;
    if (room.phase === "fight") {
      // the sequencer repeats their last input; the room says who dropped
      room.seats[seat].online = false;
      if (!room.seats.some((s) => !s.com && s.online)) return this.finish();
      await this.save();
      return this.broadcastRoom();
    }
    // in the lobby a leaver's seat closes up; the host's COM seats go with the host
    const gone = seat === 0 ? room.seats.map((s, i) => (i === 0 || s.com ? i : -1)) : [seat];
    const left = new Set(gone.filter((i) => i >= 0));
    room.seats = room.seats.filter((_, i) => !left.has(i));
    for (const sock of this.ctx.getWebSockets()) {
      const a = sock.deserializeAttachment() as Attachment;
      if (a.seat < 0 || left.has(a.seat)) continue;
      const below = [...left].filter((i) => i < a.seat).length;
      sock.serializeAttachment({ seat: a.seat - below });
    }
    if (!room.seats.length) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.save();
    this.broadcastRoom();
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  /* ───────── the fight ───────── */

  private begin() {
    if (this.grace) clearTimeout(this.grace);
    this.grace = null;
    if (!this.seq || this.timer) return;
    // a plain interval: Workers freeze Date.now() between I/O events, so pacing ticks against
    // the wall clock stalls whenever the room is quiet (tried; the room stopped between inputs)
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  private step() {
    const seq = this.seq;
    if (!seq) return;
    const m = seq.next();
    this.broadcast({ t: "f", k: seq.tick - 1, m });
    if (seq.tick >= MAX_FIGHT_TICKS) void this.finish();
  }

  private async finish() {
    if (this.timer) clearInterval(this.timer);
    if (this.grace) clearTimeout(this.grace);
    this.timer = this.grace = null;
    this.seq = null;
    const room = this.room;
    if (!room) return;
    room.phase = "lobby";
    // whoever dropped mid-fight is gone for good; the rest sit down again
    room.seats = room.seats.filter((s) => s.com || s.online);
    for (const s of room.seats) if (!s.com) s.ready = false;
    if (!room.seats.some((s) => !s.com)) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      for (const sock of this.ctx.getWebSockets()) sock.close(1000, "over");
      return;
    }
    await this.save();
    this.broadcastRoom();
  }

  /* ───────── plumbing ───────── */

  private save() {
    return this.room ? this.ctx.storage.put("room", this.room) : Promise.resolve();
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const sock of this.ctx.getWebSockets()) {
      try {
        sock.send(data);
      } catch {
        // closing: webSocketClose follows
      }
    }
  }

  /** The line-up to everyone, each told which seat is theirs. */
  private broadcastRoom() {
    const room = this.room;
    if (!room) return;
    for (const sock of this.ctx.getWebSockets()) {
      const { seat } = sock.deserializeAttachment() as Attachment;
      try {
        sock.send(JSON.stringify({ t: "room", room, you: seat } satisfies ServerMsg));
      } catch {
        // closing
      }
    }
  }

  private fail(ws: WebSocket, code: ErrorCode) {
    ws.send(JSON.stringify({ t: "error", code } satisfies ServerMsg));
  }
}

const clampTeam = (n: number) => Math.max(0, Math.min(4, n | 0));
