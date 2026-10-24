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
  MAX_ROOM_NAME,
  MAX_SEATS,
  parse,
  type RoomState,
  type ServerMsg,
  summarize,
} from "../../web/src/game/net/protocol";
import type { Env } from "./index";
import { Sequencer } from "./sequencer";

const TICK_MS = 1000 / 30;
/** a fight that runs this long ends on its own (the result board came and went long ago) */
const MAX_FIGHT_TICKS = 30 * 60 * 20;
/** the clock starts when every person has loaded, or this long after the start at the latest */
const LOAD_GRACE_MS = 15_000;
const MAX_CHAT = 120;
/**
 * A seat whose socket dropped keeps its place this long, so a refreshed tab comes back to it
 * (the browser sends its seat's token with the next hello). Leaving on purpose frees it at once.
 */
const SEAT_GRACE_MS = 30_000;
/** a bout nobody is left in waits this long for someone to come back before it is called off */
const ABANDON_TICKS = 30 * 60;
/** frames sent per message when a peer resumes a bout (30 a second, so this is 4 seconds of play) */
const RESUME_CHUNK = 120;

type Attachment = { seat: number };

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  private seq: Sequencer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** seats whose sprites are in, between start and the first tick */
  private loaded = new Set<number>();
  private grace: ReturnType<typeof setTimeout> | null = null;
  /**
   * Each seat's secret, one per seat: the browser that holds it comes back to that seat after a
   * refresh (SEAT_GRACE_MS). Never broadcast — only the seat's own socket is told its token.
   */
  private tokens: string[] = [];
  /** lobby seats whose socket has gone, and when: dropped once the grace runs out */
  private readonly gone = new Map<number, ReturnType<typeof setTimeout>>();
  /** the tick the bout was first left with nobody in it (see step()) */
  private abandonedAt: number | null = null;
  /** sockets being sent the frame log after a refresh; live frames wait until it is done */
  private readonly resuming = new Set<WebSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>("room")) ?? null;
      this.tokens = (await ctx.storage.get<string[]>("tokens")) ?? [];
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
    // "0" = no room here; else what the list should say (null for a room that is not listed)
    if (url.pathname === "/exists")
      return new Response(
        !this.room
          ? "0"
          : JSON.stringify(this.room.rules.listed ? summarize(this.room, Date.now()) : null),
      );
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
        rules: { stage: "vs_school", level: 10, name: "", listed: true },
        build: "",
      };
      this.tokens = [];
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
      // a refreshed tab comes back to the seat it held, whatever the phase
      const back = typeof msg.token === "string" ? this.tokens.indexOf(msg.token) : -1;
      if (back >= 0 && back < room.seats.length) return this.reclaim(ws, back, room);
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
      this.tokens[index] = newToken();
      ws.serializeAttachment({ seat: index } satisfies Attachment);
      await this.save();
      return this.broadcastRoom();
    }
    if (seat < 0 || seat >= room.seats.length) return;
    const host = seat === 0;

    switch (msg.t) {
      case "bye": {
        // leaving on purpose: no grace, the seat goes now
        await this.webSocketClose(ws, 1000, "left", true);
        return;
      }
      case "resume": {
        if (!this.seq || room.phase !== "fight") return;
        await this.replay(ws);
        return;
      }
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
        // the speaker's name goes out with the line: seats renumber as people leave, so the
        // clients cannot look it up later (they would credit the line to whoever took the index)
        if (text) this.broadcast({ t: "chat", seat, name: room.seats[seat]?.name ?? `P${seat + 1}`, text });
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
        const { stage, level, name, listed } = msg.rules ?? {};
        if (typeof stage === "string") room.rules.stage = stage.slice(0, 32);
        if (typeof level === "number") room.rules.level = Math.max(1, Math.min(300, level | 0));
        if (typeof name === "string") room.rules.name = name.trim().slice(0, MAX_ROOM_NAME);
        if (typeof listed === "boolean") room.rules.listed = listed;
        // the name and the listing change nothing about the bout: nobody has to say 準備 again
        if (stage !== undefined || level !== undefined)
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
        this.tokens.push(newToken());
        break;
      }
      case "kick": {
        if (!host) return this.fail(ws, "not-host");
        const target = room.seats[msg.seat];
        if (!target || msg.seat === 0) return;
        for (const sock of this.ctx.getWebSockets()) {
          const a = sock.deserializeAttachment() as Attachment;
          if (a.seat === msg.seat) {
            // its seat is about to belong to someone else: the close event must not take that one
            sock.serializeAttachment({ seat: -1 } satisfies Attachment);
            sock.close(4000, "kicked");
          } else if (a.seat > msg.seat) sock.serializeAttachment({ seat: a.seat - 1 });
        }
        room.seats.splice(msg.seat, 1);
        this.tokens.splice(msg.seat, 1);
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

  async webSocketClose(ws: WebSocket, _code = 1000, _reason = "", byPlayer = false) {
    const room = this.room;
    const { seat } = ws.deserializeAttachment() as Attachment;
    if (!room || seat < 0 || seat >= room.seats.length) return;
    this.resuming.delete(ws);
    // a stale socket: the seat has since been reclaimed by a refreshed tab, and this one's close
    // event (which the runtime delivers after the fact) must not take the seat away from it
    if (this.heldBy(seat, ws)) return;
    if (room.phase === "fight") {
      // the sequencer repeats their last input; the room says who dropped, and keeps the seat
      // for them to come back to (a refresh), since the line-up cannot change mid-bout
      room.seats[seat].online = false;
      // nobody left at all: step() starts counting down to calling the bout off
      if (!room.seats.some((s) => !s.com && s.online)) this.abandonedAt = this.seq?.tick ?? 0;
      await this.save();
      return this.broadcastRoom();
    }
    // the lobby: the seat waits SEAT_GRACE_MS for its browser to come back
    room.seats[seat].online = false;
    if (byPlayer) {
      this.dropSeat(seat);
      await this.save();
      return this.broadcastRoom();
    }
    const pending = this.gone.get(seat);
    if (pending) clearTimeout(pending);
    this.gone.set(
      seat,
      setTimeout(() => void this.expire(seat), SEAT_GRACE_MS),
    );
    await this.save();
    this.broadcastRoom();
  }

  /** Another socket is on `seat` now (it was reclaimed), so `ws` is the stale one. */
  private heldBy(seat: number, ws: WebSocket) {
    return this.ctx
      .getWebSockets()
      .some(
        (sock) =>
          sock !== ws &&
          sock.readyState === 1 &&
          (sock.deserializeAttachment() as Attachment).seat === seat,
      );
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  /** A seat's browser did not come back in time: it leaves, closing the gap as before. */
  private async expire(seat: number) {
    this.gone.delete(seat);
    const room = this.room;
    if (!room || room.phase !== "lobby") return;
    if (seat < room.seats.length && room.seats[seat].online) return;
    this.dropSeat(seat);
    await this.save();
    this.broadcastRoom();
  }

  /** The line-up without `seat` (and, for the host, its COM seats), sockets renumbered. */
  private dropSeat(seat: number) {
    const room = this.room;
    if (!room || seat < 0 || seat >= room.seats.length) return;
    // the host's COM seats go with the host
    const gone = seat === 0 ? room.seats.map((s, i) => (i === 0 || s.com ? i : -1)) : [seat];
    const left = new Set(gone.filter((i) => i >= 0));
    // the grace timers are keyed by seat index, and every index above a leaver shifts down: drop
    // them all (their seat's socket is gone anyway) rather than let one fire at the wrong seat
    for (const t of this.gone.values()) clearTimeout(t);
    this.gone.clear();
    const kept: number[] = [];
    room.seats = room.seats.filter((_, i) => {
      if (left.has(i)) return false;
      kept.push(i);
      return true;
    });
    this.tokens = kept.map((i) => this.tokens[i]);
    for (const sock of this.ctx.getWebSockets()) {
      const a = sock.deserializeAttachment() as Attachment;
      if (a.seat < 0 || left.has(a.seat)) continue;
      const below = [...left].filter((i) => i < a.seat).length;
      sock.serializeAttachment({ seat: a.seat - below });
    }
    if (!room.seats.length) {
      this.report(null, room.code);
      this.room = null;
      void this.ctx.storage.deleteAll();
      return;
    }
    // a COM seat can be the only thing left (the host is gone, the seat waits): nobody to play
    if (!room.seats.some((s) => !s.com)) {
      this.report(null, room.code);
      this.room = null;
      for (const sock of this.ctx.getWebSockets()) sock.close(1000, "over");
      void this.ctx.storage.deleteAll();
    }
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
    // nobody left in the bout: give them a while to come back, then call it off. Checked on the
    // clock rather than in a timer of its own, because a socket-less object may be evicted between
    // ticks and a pending setTimeout would go with it.
    const room = this.room;
    if (room && !room.seats.some((s) => !s.com && s.online)) {
      if (this.abandonedAt === null) this.abandonedAt = seq.tick;
      else if (seq.tick - this.abandonedAt >= ABANDON_TICKS) return void this.finish();
    } else this.abandonedAt = null;
    const m = seq.next();
    this.broadcast({ t: "f", k: seq.tick - 1, m }, this.resuming);
    if (seq.tick >= MAX_FIGHT_TICKS) void this.finish();
  }

  /**
   * Send a socket that came back mid-bout the frames from tick 0, then hand it live frames. They
   * go out in chunks so a long bout does not fill the socket's buffer in one message; live frames
   * are held back (step() skips `resuming`) until the log is through, or they would interleave.
   */
  private async replay(ws: WebSocket) {
    this.resuming.add(ws);
    let sent = 0;
    while (ws.readyState === 1) {
      const log = this.seq?.log;
      if (!log || sent >= log.length) break;
      const end = Math.min(log.length, sent + RESUME_CHUNK);
      for (let i = sent; i < end; i++)
        ws.send(JSON.stringify({ t: "f", k: i, m: log[i] } satisfies ServerMsg));
      sent = end;
      // let the socket drain before the next chunk (no await between the last check and the
      // hand-over below, so no frame can slip into the gap)
      if (sent < (this.seq?.log.length ?? 0)) await scheduler.wait(1);
    }
    if (this.resuming.delete(ws) && ws.readyState === 1)
      ws.send(JSON.stringify({ t: "resume-end", k: this.seq?.tick ?? sent } satisfies ServerMsg));
  }

  private async finish() {
    if (this.timer) clearInterval(this.timer);
    if (this.grace) clearTimeout(this.grace);
    this.timer = this.grace = null;
    this.abandonedAt = null;
    this.seq = null;
    for (const ws of this.resuming)
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: "resume-end", k: 0 } satisfies ServerMsg));
    this.resuming.clear();
    const room = this.room;
    if (!room) return;
    room.phase = "lobby";
    // whoever dropped mid-fight is gone for good; the rest sit down again
    const kept: number[] = [];
    const dropped = new Set<number>();
    room.seats = room.seats.filter((s, i) => {
      if (!s.com && !s.online) {
        dropped.add(i);
        return false;
      }
      kept.push(i);
      return true;
    });
    this.tokens = kept.map((i) => this.tokens[i]);
    // the sockets that stayed are renumbered to their new seats
    for (const sock of this.ctx.getWebSockets()) {
      const a = sock.deserializeAttachment() as Attachment;
      if (a.seat < 0 || dropped.has(a.seat)) continue;
      const below = [...dropped].filter((i) => i < a.seat).length;
      if (below) sock.serializeAttachment({ seat: a.seat - below });
    }
    for (const s of room.seats) if (!s.com) s.ready = false;
    if (!room.seats.some((s) => !s.com)) {
      this.report(null, room.code);
      this.room = null;
      await this.ctx.storage.deleteAll();
      for (const sock of this.ctx.getWebSockets()) sock.close(1000, "over");
      return;
    }
    await this.save();
    this.broadcastRoom();
  }

  /* ───────── plumbing ───────── */

  /**
   * A socket presenting a seat's token takes that seat over: the old socket (a tab left open, or
   * a connection that has not timed out yet) is closed, and the seat is the newcomer's.
   */
  private async reclaim(ws: WebSocket, seat: number, room: RoomState) {
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === ws) continue;
      const a = sock.deserializeAttachment() as Attachment;
      if (a.seat === seat) sock.close(4000, "replaced");
    }
    const t = this.gone.get(seat);
    if (t) clearTimeout(t);
    this.gone.delete(seat);
    const s = room.seats[seat];
    if (!s.com) s.online = true;
    ws.serializeAttachment({ seat } satisfies Attachment);
    // back mid-bout: no live frame may reach this socket before its replay is over (it would
    // step a world that is still at tick 0 on a guess, and the log can no longer take it back)
    if (room.phase === "fight" && this.seq) this.resuming.add(ws);
    // the seat's own socket is the only one told its token
    ws.send(
      JSON.stringify({
        t: "room",
        room,
        you: seat,
        token: this.tokens[seat],
      } satisfies ServerMsg),
    );
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === ws) continue;
      const a = sock.deserializeAttachment() as Attachment;
      try {
        sock.send(JSON.stringify({ t: "room", room, you: a.seat } satisfies ServerMsg));
      } catch {
        // closing
      }
    }
    // back in a bout: the frames come when the peer asks (it has to build the world first)
    if (room.phase === "fight" && this.seq)
      ws.send(JSON.stringify({ t: "resume", k: 0 } satisfies ServerMsg));
    await this.save();
  }

  private save() {
    const room = this.room;
    if (!room) return Promise.resolve();
    this.report(room);
    return Promise.all([
      this.ctx.storage.put("room", room),
      this.ctx.storage.put("tokens", this.tokens),
    ]).then(() => undefined);
  }

  /** Tell the directory (directory.ts) what the list should say about this room — or to forget it. */
  private report(room: RoomState | null, code = room?.code ?? "") {
    const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName("rooms"));
    const listed = room && room.rules.listed && room.seats.length > 0;
    const req = listed
      ? new Request("https://directory/report", {
          method: "POST",
          body: JSON.stringify(summarize(room, Date.now())),
        })
      : new Request("https://directory/remove", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
    this.ctx.waitUntil(dir.fetch(req).catch(() => {}));
  }

  private broadcast(msg: ServerMsg, skip?: Set<WebSocket>) {
    const data = JSON.stringify(msg);
    for (const sock of this.ctx.getWebSockets()) {
      if (skip?.has(sock)) continue;
      try {
        sock.send(data);
      } catch {
        // closing: webSocketClose follows
      }
    }
  }

  /** The line-up to everyone, each told which seat is theirs — and its token, which is its own. */
  private broadcastRoom() {
    const room = this.room;
    if (!room) return;
    for (const sock of this.ctx.getWebSockets()) {
      const { seat } = sock.deserializeAttachment() as Attachment;
      const token = seat >= 0 ? this.tokens[seat] : undefined;
      try {
        sock.send(
          JSON.stringify({ t: "room", room, you: seat, ...(token ? { token } : {}) } satisfies ServerMsg),
        );
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

/** A seat's secret: 16 random bytes, hex. */
const newToken = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
