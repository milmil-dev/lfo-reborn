import { type Brain, newBrain, think } from "../ai";
import { pickUp } from "../core/items";
import { segmentAt, type StitchedRoom, stitch, stripOf } from "./stitch";
import { crossesWall, type Point, type Segment, slide, wallSegments } from "./walls";
import type { Fighter, FighterEvent } from "../core/fighter";
import type { Effects } from "../effects";
import { type CharData, EMPTY_INPUT, type InputState, TICK_HZ } from "../core/types";
import { World } from "../core/world";
import type { Command, DialogueLine, Room, StoryData } from "./types";

/*
  Replays a story the way the original client did:
  - a story is a map of rooms (backgrounds) linked by exits; the player walks between them
  - each room runs numbered phases; a phase's events (from the .sty) spawn enemy groups,
    move the right-hand bound, trigger drama scripts, warp the player or end the story
  - a phase ends when its drama has played and every enemy it spawned is down
  - drama scripts are the original command lists (add / move / run / talk / camera_* …)
*/

/**
 * The `evt` ops of the client's .sty files, named by the comment rows above them in the files
 * (//evt BGID PHASE <NAME> …).
 */
export const EVENT = {
  BGM: 1,
  SPAWN: 2,
  BOUND: 6,
  DRAMA: 7,
  WARP: 9,
  /** set a room (often another one) to a phase: TARGETBGID TARGETPHASE TIMES */
  CHANGEPHASE: 10,
  /** the room waits at this phase until a CHANGEPHASE moves it on */
  HALT: 11,
  BOSS: 13,
  ADDKEY: 14,
  REMOVEKEY: 15,
  COMPLETE: 20,
  GAMEOVER: 23,
  /** a teleport that also ends the room's phase play (p9s1: on to the last room) */
  TELEPORT: 31,
  /** another spawn row (same columns as SPAWN) */
  SPAWN_ALT: 35,
  /** re-route a door while this phase lasts: DOOR TOBG TODOOR; to itself = locked */
  CH_DOOR: 36,
  /** a random door: TOBG TODOOR WEIGHT, several rows to choose from */
  RAN_DOOR: 38,
} as const;

type Kind = "enemy" | "npc" | "item" | "player" | "com";

const PLAYER_HANDLE = 9000;
/** a defeated enemy lies still this long, then blinks this long before it is gone (ticks) */
const DEATH_LIE = 30;
const DEATH_BLINK = 36;
const VIEW_H = 600; // the original client ran at 800 × 600
// sprite id bands: 1–99 players, 100–999 items, 3000+ creatures, 5000+ special objects
const isItem = (sprite: number) => sprite >= 100 && sprite < 1000;
const ms = (n: number) => Math.round((n / 1000) * TICK_HZ);

export type StoryUI = {
  load(path: string): Promise<{ data: CharData }>;
  added(f: Fighter, path: string): void;
  removed(f: Fighter): void;
  /** show a room (in the lobby: a stitched strip of rooms) */
  room(room: Room): Promise<void>;
  /** the player has arrived in a room (its own id, even inside a stitched strip) */
  entered?(bg: number): void;
  /** load a room's art ahead of time */
  preload?(room: Room): Promise<void>;
  /** door transition: push in towards a world point (out) and ease back out in the new room (in) */
  door?(phase: "out" | "in", x: number, y: number): Promise<void>;
  talk(lines: DialogueLine[]): Promise<void>;
  title(text: { top: string; bottom: string } | null): void;
  fade(to: 0 | 1, durationMs: number): Promise<void>;
  music(file: string | null): void;
  sound(file: string): void;
  shake(amount: number): void;
  status(s: StoryStatus): void;
  fx(events: FighterEvent[]): void;
};

export type StoryStatus = {
  kind: "playing" | "drama" | "complete" | "gameover";
  bg: number;
  phase: number;
  enemies: number;
  clear: boolean;
};

type Spawner = {
  loading: number;
  group: number;
  x: number;
  z: number;
  interval: number;
  left: number;
  timer: number;
  random: number;
  alive: Set<Fighter>;
  boss: boolean;
};
type RoomState = { phase: number; done: boolean; played: Set<number> };
type Mover = { x: number; z: number; run: boolean; tick: number };
type Waiter = { test: () => boolean; resolve: () => void };

export class Director {
  readonly world: World;
  bg = -1;
  room!: Room;
  private walls: Segment[] = [];
  /** the lobby (a map without a story script) joins its street rooms into seamless strips */
  private get seamless() {
    return this.story.scripts.length === 0;
  }
  private strip: StitchedRoom | null = null;
  /** strips already built (and their art preloaded), by any room in them */
  private strips = new Map<number, StitchedRoom>();
  private preloaded = new Set<number>();

  /** The room a travel to `bg` will show: its strip in the lobby, else the room itself. */
  private shownFor(bg: number): Room {
    const room = this.story.rooms[String(bg)];
    if (!this.seamless) return room;
    let strip = this.strips.get(bg);
    if (!strip) {
      strip = stitch(this.story, stripOf(this.story, bg));
      for (const g of strip.segments) this.strips.set(g.bg, strip);
    }
    return strip;
  }
  player: Fighter | null = null;
  readonly handles = new Map<number, Fighter>();
  readonly camera = { x: 0, target: 0, follow: null as Fighter | null, viewW: 800 };
  bound = Number.POSITIVE_INFINITY;
  effects: Effects | null = null;
  drama = false;
  status: StoryStatus["kind"] = "playing";

  private readonly paths = new Map<Fighter, string>();
  private readonly kind = new Map<Fighter, Kind>();
  private readonly rooms = new Map<number, RoomState>();
  /** CH_DOOR: doors re-routed (or locked) while the phase that set them lasts, by `bg:door` */
  private readonly doorOverride = new Map<
    string,
    { toBg: number; toLink: number; phase: number }
  >();
  /** RAN_DOOR: a room's random way out, chosen when its door is used */
  private readonly randomDoors = new Map<
    number,
    { toBg: number; toLink: number; weight: number }[]
  >();
  /** CHANGEPHASE rows already used up (their TIMES), by row */
  private readonly phaseChanges = new Map<string, number>();
  private spawners: Spawner[] = [];
  private pendingDrama: { script: number; x1: number; x2: number; once: boolean; key: number }[] =
    [];
  private waiters: Waiter[] = [];
  private movers = new Map<Fighter, Mover>();
  private ai = new Map<Fighter, Brain>();
  private tick = 0;
  // after a scene hands control back, enemies wait a beat so the player is never hit before they can act
  private aiGrace = 0;
  /** someone is already bringing the player in (the lobby, a VS bout, a script's add 9000) */
  private playerPending = false;
  /** the last script left the screen faded to black */
  private faded = false;
  /** defeated enemies on their way out, and the ticks since they lay down */
  private readonly dying = new Map<Fighter, number>();
  private busy = false;

  constructor(
    readonly story: StoryData,
    private readonly ui: StoryUI,
    /**
     * The player's own character ("chars/<key>"). A story's scripts add player 1 (handle 9000)
     * with the line's lead as a stand-in; whoever enters the story plays it as themselves.
     */
    private readonly playerPath?: string,
  ) {
    this.world = new World({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 });
  }

  /* ───────── lifecycle ───────── */

  async start() {
    let { bg, x } = this.story.start;
    // a few maps' start rows point at a room they no longer have (p5s4 → 19, mission_p6m1 → 36);
    // begin in the map's first room instead
    if (!this.story.rooms[String(bg)]) {
      bg = Math.min(...Object.keys(this.story.rooms).map(Number));
      x = 100;
    }
    if (this.story.bgm) this.ui.music(this.story.bgm);
    await this.enterRoom(bg, null, x);
  }

  /** One fixed tick: inputs, world, then story logic. */
  step(playerInput: InputState) {
    this.tick++;
    if (this.aiGrace > 0 && !this.drama) this.aiGrace--;
    const inputs = new Map<number, InputState>();
    for (const f of this.world.fighters) {
      const mover = this.movers.get(f);
      if (mover) inputs.set(f.id, this.moverInput(f, mover));
      else if (f === this.player && !this.drama && this.status === "playing")
        inputs.set(f.id, playerInput);
      else if (
        (this.kind.get(f) === "enemy" || this.kind.get(f) === "com") &&
        !this.drama &&
        this.aiGrace <= 0
      )
        inputs.set(f.id, this.aiInput(f));
    }
    const before = this.world.fighters.map((f) => [f, f.x, f.z] as const);
    const events = this.world.step(inputs);
    this.effects?.update(events);
    // the room's walls are lines on the floor nothing crosses (story/walls.ts); a move that would
    // cross one slides along it instead
    // (the client's ObstaclePool blocks Player, Enemy, Item and Blaster alike: a projectile that
    // reaches a wall is spent)
    for (const [f, x, z] of before) {
      if (f.itemState === "held") continue;
      if (f.effect) {
        if (crossesWall(this.walls, x, z, f.x, f.z)) f.dead = true;
        continue;
      }
      [f.x, f.z] = slide(this.walls, x, z, f.x, f.z);
    }
    this.ui.fx(events);

    this.preloadNearby();
    // walking along a strip: the room under the player gives the floor band and the room id
    if (this.strip && this.player && this.room === this.strip) {
      const seg = segmentAt(this.strip, this.player.x);
      this.bg = seg.bg;
      this.world.stage.minZ = seg.room.upper;
      this.world.stage.maxZ = seg.room.lower;
    }
    // the player may not walk past the phase bound
    if (this.player && this.player.x > this.bound - 30) this.player.x = this.bound - 30;
    this.followCamera();
    // a stage whose script never adds player 1 (the 死亡之塔 begin straight in the first room):
    // put the player in once the opening has had its chance
    if (
      !this.player &&
      !this.playerPending &&
      this.tick > 30 &&
      !this.drama &&
      !this.busy &&
      !this.pendingDrama.length
    )
      void this.addPlayer(this.playerPath ?? "chars/stinky");
    this.cleanup();
    if (!this.drama && this.status === "playing") {
      this.runSpawners();
      this.checkDrama();
      this.checkPhase();
      this.checkExits();
      this.checkDeath();
    }
    for (const w of [...this.waiters])
      if (w.test()) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve();
      }
  }

  /** Puts a controllable fighter into the current room: maps with no story script (the lobby). */
  async addPlayer(path: string, x = this.story.start.x, z?: number) {
    this.playerPending = true;
    // the map's start point has no depth: stand near the front of the floor, which is open
    // ground in every room (mid-depth can land on the far side of a fence, e.g. the lobby's
    // left rail), and step off any wall that happens to pass right there
    const { maxZ } = this.world.stage;
    // x is in the room's own coordinates; a stitched strip puts that room further along
    x += this.strip?.segments.find((g) => g.bg === this.bg)?.dx ?? 0;
    let sz = z ?? maxZ - 40;
    for (let i = 0; i < 20 && crossesWall(this.walls, x, sz, x, sz + 1); i++) sz -= 4;
    const f = await this.spawn(path, 1, x, sz, "player");
    if (f) {
      this.player = f;
      this.handles.set(PLAYER_HANDLE, f);
      this.camera.x = this.camera.target = f.x - this.camera.viewW / 2;
    }
    this.report();
    return f;
  }

  /* ───────── rooms + phases ───────── */

  private async enterRoom(bg: number, link: number | null, x?: number) {
    const room = this.story.rooms[String(bg)];
    if (!room) throw new Error(`room ${bg} missing`);
    this.busy = true;
    // the lobby: the strip this room belongs to (already on screen if we are only walking along it)
    let seg = this.strip?.segments.find((g) => g.bg === bg);
    const sameStrip = !!seg;
    if (this.seamless && !seg) {
      this.strip = this.shownFor(bg) as StitchedRoom;
      seg = this.strip.segments.find((g) => g.bg === bg);
    }
    const shown: Room = this.seamless && this.strip ? this.strip : room;
    const dx = seg?.dx ?? 0;
    // everyone but the player (and what they carry) leaves with the old room
    if (!sameStrip)
      for (const f of [...this.world.fighters])
        if (f !== this.player && f !== this.player?.holding) this.despawn(f);
    this.spawners = [];
    this.pendingDrama = [];
    this.bg = bg;
    this.room = shown;
    this.walls = wallSegments(shown.walls as Point[][]);
    this.world.stage.minX = 20;
    this.world.stage.maxX = shown.width - 20;
    // the room's own floor band; its wall lines (story/walls.ts) fence off the rest, as in the client
    this.world.stage.minZ = room.upper;
    this.world.stage.maxZ = room.lower;
    if (!sameStrip) await this.ui.room(shown);

    if (this.player) {
      const entries = shown.entries as (Room["entries"][number] & { bg?: number })[];
      const entry =
        entries.find((e) => (e.bg ?? bg) === bg && e.link === link) ??
        entries.find((e) => (e.bg ?? bg) === bg);
      this.player.x = x !== undefined ? x + dx : (entry?.x ?? dx + 100);
      this.player.z = Math.min(
        this.world.stage.maxZ,
        Math.max(this.world.stage.minZ, entry?.z ?? 450),
      );
      this.player.facing = this.player.x - dx > room.width / 2 ? -1 : 1;
      this.player.vx = this.player.vz = 0;
    }
    this.camera.x = this.camera.target = (this.player?.x ?? x ?? 0) - this.camera.viewW / 2;
    const state = this.roomState(bg);
    this.bound = state.done ? shown.width : Number.POSITIVE_INFINITY;
    if (!state.done) {
      this.runPhaseEvents(0);
      this.runPhaseEvents(state.phase);
    }
    this.busy = false;
    this.report();
    this.ui.entered?.(bg);
  }

  private roomState(bg: number) {
    let s = this.rooms.get(bg);
    if (!s) {
      s = { phase: 1, done: false, played: new Set() };
      this.rooms.set(bg, s);
    }
    return s;
  }

  private eventsFor(phase: number, bg = this.bg) {
    return this.story.events.filter((e) => e[0] === bg && e[1] === phase);
  }

  /** CHANGEPHASE: put a room at a phase — played now if it is this room, else on arrival. */
  private setPhase(bg: number, phase: number) {
    const s = this.roomState(bg);
    s.phase = phase;
    s.done = false;
    this.dropDoors(bg, phase);
    if (bg !== this.bg) return;
    this.spawners = this.spawners.filter((sp) => !Number.isFinite(sp.left));
    this.bound = Number.POSITIVE_INFINITY;
    this.runPhaseEvents(phase);
  }

  /** A room moving to `phase` lets go of the door changes of its earlier phases. */
  private dropDoors(bg: number, phase: number) {
    for (const [k, o] of this.doorOverride)
      if (k.startsWith(`${bg}:`) && o.phase < phase) this.doorOverride.delete(k);
    if (phase > 0) this.randomDoors.delete(bg);
  }

  /**
   * Where a door leads now: a CH_DOOR re-route (null while it is locked — sent back to itself),
   * one of several ways when the stage lists more than one for a door (the mazes), else the link.
   */
  private exitTo(from: number, door: number): { toBg: number; toLink: number } | null {
    const o = this.doorOverride.get(`${from}:${door}`);
    if (o) return o.toBg === from && o.toLink === door ? null : o;
    // RAN_DOOR: while the phase that set them lasts, the room's ways out are a weighted draw
    const draw = this.randomDoors.get(from);
    if (draw?.length) {
      let r = Math.random() * draw.reduce((n, d) => n + d.weight, 0);
      for (const d of draw) if ((r -= d.weight) <= 0) return d;
      return draw[draw.length - 1];
    }
    const ways = this.story.links[String(from)]?.filter((l) => l.link === door) ?? [];
    if (!ways.length) return null;
    return ways[Math.floor(Math.random() * ways.length)];
  }

  private runPhaseEvents(phase: number) {
    const state = this.roomState(this.bg);
    for (const [, , type, ...a] of this.eventsFor(phase)) {
      switch (type) {
        case EVENT.BOUND:
          this.bound = a[0] > 0 ? a[0] : this.room.width;
          break;
        case EVENT.SPAWN:
        case EVENT.SPAWN_ALT:
        case EVENT.BOSS: {
          // x y z interval maxAlive maxOutput group randomPos spawnAtZero
          const [x, , z, interval, , output, group, random] = a;
          this.spawners.push({
            group,
            x,
            z,
            interval: ms(interval * 1000) || 1,
            left: output >= 99 ? Number.POSITIVE_INFINITY : output,
            loading: 0,
            timer: 0,
            random,
            alive: new Set(),
            boss: type === EVENT.BOSS,
          });
          break;
        }
        case EVENT.DRAMA: {
          // player enemy cond scriptIndex once host x1 x2
          const [, , , script, once, , x1, x2] = a;
          const key = phase * 100 + script;
          if (!(once && state.played.has(key)))
            this.pendingDrama.push({ script, x1, x2, once: !!once, key });
          break;
        }
        case EVENT.WARP:
        case EVENT.TELEPORT: {
          const [bg, x, , z] = a;
          if (bg === this.bg && this.player) {
            this.player.x = x;
            this.player.z = z;
          } else if (this.story.rooms[String(bg)]) void this.enterRoom(bg, null, x);
          break;
        }
        case EVENT.CHANGEPHASE: {
          // TARGETBGID TARGETPHASE TIMES: how a stage opens its next room (p10s4: clearing
          // room 9 moves the halted room 6 on); a row with TIMES runs at most that often
          const [bg, to, times] = a;
          const row = `${this.bg}:${phase}:${bg}:${to}`;
          const used = this.phaseChanges.get(row) ?? 0;
          if (times > 0 && used >= times) break;
          this.phaseChanges.set(row, used + 1);
          if (this.story.rooms[String(bg)]) this.setPhase(bg, to);
          break;
        }
        case EVENT.CH_DOOR: {
          // DOOR TOBG TODOOR, while this phase lasts; a door sent back to itself is locked
          const [door, toBg, toLink] = a;
          this.doorOverride.set(`${this.bg}:${door}`, { toBg, toLink, phase });
          break;
        }
        case EVENT.RAN_DOOR: {
          const [toBg, toLink, weight] = a;
          const list = this.randomDoors.get(this.bg) ?? [];
          list.push({ toBg, toLink, weight: weight || 1 });
          this.randomDoors.set(this.bg, list);
          break;
        }
        case EVENT.COMPLETE:
          this.status = "complete";
          this.report();
          break;
        case EVENT.GAMEOVER:
          this.status = "gameover";
          this.report();
          break;
      }
    }
  }

  private checkPhase() {
    const state = this.roomState(this.bg);
    if (state.done || this.busy || this.pendingDrama.length) return;
    // a HALT holds the room at this phase until a CHANGEPHASE moves it
    if (this.eventsFor(state.phase).some((e) => e[2] === EVENT.HALT)) return;
    const blocking = this.spawners.some(
      (s) => Number.isFinite(s.left) && (s.left > 0 || s.loading > 0 || s.alive.size > 0),
    );
    if (blocking) return;
    // advance until a phase has something to do
    for (;;) {
      state.phase++;
      this.dropDoors(this.bg, state.phase);
      const events = this.eventsFor(state.phase);
      if (!events.length) {
        state.done = true;
        this.bound = this.room.width;
        this.spawners = this.spawners.filter((s) => !Number.isFinite(s.left));
        break;
      }
      this.spawners = this.spawners.filter((s) => !Number.isFinite(s.left));
      this.runPhaseEvents(state.phase);
      // phases holding only bookkeeping (music, door and phase changes) pass straight on
      if (
        events.some(
          (e) => e[2] !== EVENT.BGM && e[2] !== EVENT.CHANGEPHASE && e[2] !== EVENT.CH_DOOR,
        )
      )
        break;
    }
    this.report();
  }

  private runSpawners() {
    for (const s of this.spawners) {
      if (s.left <= 0) continue;
      if (Number.isFinite(s.left) === false && s.alive.size > 0) continue; // endless spawners keep one wave alive
      if (--s.timer > 0) continue;
      s.timer = s.interval;
      s.left--;
      s.loading++;
      void this.spawnGroup(s).finally(() => s.loading--);
    }
  }

  private async spawnGroup(s: Spawner) {
    const members = this.story.groups[String(s.group)] ?? [];
    for (const m of members) {
      for (let i = 0; i < m.qty; i++) {
        const path = this.story.sprites[String(m.sprite)];
        if (!path) continue;
        const item = isItem(m.sprite);
        let x = s.x;
        if (s.random) {
          // arrive from just outside the view, or anywhere on screen for pickups
          const left = this.camera.x;
          const right = this.camera.x + this.camera.viewW;
          x = item
            ? left + 100 + Math.random() * (this.camera.viewW - 200)
            : Math.random() < 0.5
              ? left - 40
              : right + 40;
        }
        const z = Math.min(
          this.world.stage.maxZ,
          Math.max(this.world.stage.minZ, s.z + (Math.random() - 0.5) * 60),
        );
        const f = await this.spawn(path, item ? 0 : 2, x, z, item ? "item" : "enemy");
        if (!f) continue;
        if (!item) {
          f.hp = Math.round(f.data.attrs.hp * (m.hpMul || 1));
          f.level = m.level || 1;
          f.reward = m.exp;
          f.showBars = true;
          s.alive.add(f);
        }
      }
    }
  }

  private checkDrama() {
    if (this.busy) return;
    const px = this.player?.x;
    const d = this.pendingDrama.find(
      (p) => !p.x2 || (px !== undefined && px >= p.x1 && px <= p.x2),
    );
    if (!d) return;
    this.pendingDrama.splice(this.pendingDrama.indexOf(d), 1);
    this.roomState(this.bg).played.add(d.key);
    void this.runScript(d.script);
  }

  private checkExits() {
    const p = this.player;
    if (!p || this.busy) return;
    for (const e of this.room.exits) {
      // a little slack around the box: a door's box often sits half behind the shop front,
      // leaving only a thin strip of it on the walkable side
      const inside =
        p.x >= e.x - 10 && p.x <= e.x + e.w + 10 && p.z >= e.z - 10 && p.z <= e.z + e.h + 14;
      if (!inside) continue;
      // only walking into it counts (1 up, 2 down, 3 left, 4 right): arriving on an exit —
      // a shop's way out is right where you come in — must not send you straight back
      const into =
        e.dir === 1
          ? p.vz < 0
          : e.dir === 2
            ? p.vz > 0
            : e.dir === 3
              ? p.vx < 0
              : e.dir === 4
                ? p.vx > 0
                : true;
      if (!into) continue;
      const from = (e as { bg?: number }).bg ?? this.bg;
      const link = this.exitTo(from, e.link);
      if (!link || !this.story.rooms[String(link.toBg)]) continue;
      void this.travel(link.toBg, link.toLink);
      return;
    }
  }

  private async travel(bg: number, link: number) {
    this.busy = true;
    const p = this.player;
    if (this.ui.door && p) {
      // no black screen: push into the doorway, swap the (preloaded) room, ease out of the new one
      await this.ui.door("out", p.x, p.z - 60);
      await this.enterRoom(bg, link);
      this.busy = true;
      this.followCamera(true);
      await this.ui.door("in", this.player?.x ?? 0, (this.player?.z ?? 400) - 60);
      this.busy = false;
      return;
    }
    await this.ui.fade(1, 250);
    await this.enterRoom(bg, link);
    await this.ui.fade(0, 250);
  }

  /** Preload what lies behind any exit the player is walking up to. */
  private preloadNearby() {
    const p = this.player;
    if (!p || !this.ui.preload) return;
    for (const e of this.room.exits) {
      const cx = e.x + e.w / 2;
      const cz = e.z + e.h / 2;
      if (Math.abs(p.x - cx) > 350 || Math.abs(p.z - cz) > 250) continue;
      const from = (e as { bg?: number }).bg ?? this.bg;
      const link =
        this.doorOverride.get(`${from}:${e.link}`) ??
        this.story.links[String(from)]?.find((l) => l.link === e.link);
      if (!link || this.preloaded.has(link.toBg) || !this.story.rooms[String(link.toBg)]) continue;
      this.preloaded.add(link.toBg);
      void this.ui.preload(this.shownFor(link.toBg));
    }
  }

  private checkDeath() {
    if (this.player && this.player.hp <= 0 && this.player.anim.includes("LIEDOWN")) {
      this.status = "gameover";
      this.report();
    }
  }

  /**
   * A defeated enemy stays on the floor for a second, blinks out, then leaves. It stops counting
   * as soon as it lies down, so the room's next wave and its exits don't wait for the blinking.
   */
  private cleanup() {
    for (const f of [...this.world.fighters]) {
      if (this.kind.get(f) !== "enemy" || f.hp > 0) continue;
      const t = this.dying.get(f);
      if (t === undefined) {
        if (f.anim === "LIEDOWN" || f.anim === "B_LIEDOWN" || !f.data.actions.LIEDOWN) {
          this.dying.set(f, 0);
          for (const s of this.spawners) s.alive.delete(f);
          this.report();
        }
        continue;
      }
      this.dying.set(f, t + 1);
      if (t >= DEATH_LIE) f.hidden = Math.floor((t - DEATH_LIE) / 3) % 2 === 0;
      if (t >= DEATH_LIE + DEATH_BLINK) {
        this.dying.delete(f);
        this.despawn(f);
      }
    }
  }

  private report() {
    this.ui.status({
      kind: this.status === "playing" && this.drama ? "drama" : this.status,
      bg: this.bg,
      phase: this.roomState(this.bg).phase,
      clear: this.roomState(this.bg).done,
      enemies: [...this.world.fighters].filter(
        (f) => this.kind.get(f) === "enemy" && !this.dying.has(f),
      ).length,
    });
  }

  /* ───────── actors ───────── */

  private async spawn(
    path: string,
    team: number,
    x: number,
    z: number,
    kind: Kind,
    facing: 1 | -1 = 1,
  ) {
    const assets = await this.ui.load(path).catch(() => null);
    if (!assets) return null;
    const f = this.world.spawn(assets.data, team, x, z, facing);
    this.effects?.preload(assets.data);
    this.paths.set(f, path);
    this.kind.set(f, kind);
    this.ui.added(f, path);
    return f;
  }

  /**
   * 兇獸突襲: a beast breaks in at the far edge of the view and goes for the player — an enemy
   * like the stage's own, only stronger and worth more.
   */
  async spawnBeast(path: string, level: number) {
    const { minZ, maxZ, maxX } = this.world.stage;
    const x = Math.min(maxX - 60, this.camera.x + this.camera.viewW - 80);
    const f = await this.spawn(path, 2, x, (minZ + maxZ) / 2, "enemy", -1);
    if (!f) return null;
    f.showBars = true;
    f.level = level;
    f.reward = 300;
    this.ai.set(f, newBrain(0.7));
    this.report();
    return f;
  }

  /** x on the stitched strip, in the current room's own coordinates (its layers' space). */
  roomX(x: number) {
    return x - (this.strip?.segments.find((g) => g.bg === this.bg)?.dx ?? 0);
  }

  /**
   * A computer player (the waiting room's COM): fights for `team` against everyone else, with a
   * brain whose skill rises with its level.
   */
  async addCom(path: string, team: number, x: number, z: number, skill: number) {
    const f = await this.spawn(path, team, x, z, "com", x > this.world.stage.maxX / 2 ? -1 : 1);
    if (f) this.ai.set(f, newBrain(skill));
    this.report();
    return f;
  }

  /** Drop a field item (weapon, potion …) from the air at a spot, e.g. an enemy's loot. */
  async dropItem(sprite: number, x: number, z: number) {
    const f = await this.spawn(`sprites/${sprite}`, 0, x, z, "item");
    if (f) f.y = -60;
    return f;
  }

  /** Put an item straight into a fighter's hands (the weapon worn in the equipment box). */
  async giveItem(to: Fighter, sprite: number) {
    const f = await this.spawn(`sprites/${sprite}`, 0, to.x, to.z, "item");
    if (f && !to.holding) pickUp(to, f, []);
    return f;
  }

  private despawn(f: Fighter) {
    this.world.remove(f);
    this.ui.removed(f);
    this.movers.delete(f);
    this.ai.delete(f);
    this.dying.delete(f);
    for (const [h, g] of this.handles) if (g === f) this.handles.delete(h);
  }

  private aiInput(f: Fighter): InputState {
    let b = this.ai.get(f);
    if (!b) {
      b = newBrain(this.kind.get(f) === "com" ? 0.6 : 0.15);
      this.ai.set(f, b);
    }
    return think(f, this.world.fighters, b);
  }

  private moverInput(f: Fighter, m: Mover): InputState {
    const input = { ...EMPTY_INPUT };
    m.tick++;
    const dx = m.x - f.x;
    const dz = m.z - f.z;
    const doneX = Math.abs(dx) < (m.run ? 12 : 5);
    const doneZ = Math.abs(dz) < 4;
    if (doneX && doneZ) {
      this.movers.delete(f);
      f.vx = f.vz = 0;
      if (f.anim === "WALK" || f.anim === "RUN") f.goto(f.action("STAND"));
      return input;
    }
    if (!doneX) {
      // a run starts with a double tap, then the direction is held
      const hold = !m.run || m.tick > 3 || m.tick === 1;
      input.right = dx > 0 && hold;
      input.left = dx < 0 && hold;
    }
    if (!doneZ) {
      input.down = dz > 0;
      input.up = dz < 0;
    }
    if (m.tick > TICK_HZ * 12) {
      // give up rather than stall a scene
      f.x = m.x;
      f.z = m.z;
    }
    return input;
  }

  /* ───────── camera ───────── */

  setViewWidth(w: number) {
    this.camera.viewW = w;
  }

  /** Ease the camera towards its target (or jump straight there, e.g. after a door). */
  private followCamera(snap = false) {
    const c = this.camera;
    const f = c.follow ?? (this.drama ? null : this.player);
    if (f) c.target = f.x - c.viewW / 2;
    const max = Math.min(this.room?.width ?? 0, this.bound) - c.viewW;
    c.target = Math.max(0, Math.min(Math.max(0, max), c.target));
    c.x = snap ? c.target : c.x + (c.target - c.x) * 0.15;
  }

  get viewHeight() {
    return VIEW_H;
  }

  /* ───────── drama scripts ───────── */

  private until(test: () => boolean) {
    return new Promise<void>((resolve) => this.waiters.push({ test, resolve }));
  }

  private pending: Promise<unknown>[] = [];

  async runScript(index: number) {
    const script = this.story.scripts[index];
    if (!script) return;
    this.drama = true;
    this.report();
    // stop everyone in their tracks for the scene
    for (const f of this.world.fighters) if (!this.movers.has(f)) f.vx = f.vz = 0;
    // warm up every sprite the scene adds
    await Promise.all(
      script.cmds
        .filter((c) => c[0] === "add" || c[0] === "addex")
        .map((c) => this.story.sprites[String(c[2])])
        .filter((p): p is string => !!p)
        .map((p) => this.ui.load(p).catch(() => null)),
    );
    for (const cmd of script.cmds) {
      if (this.status !== "playing") break;
      await this.exec(cmd);
    }
    await Promise.all(this.pending);
    this.pending = [];
    // a scene that ends on a fade-out (the 死亡之塔 openings) hands back to play: the picture
    // comes back
    if (this.faded) {
      this.faded = false;
      await this.ui.fade(0, 500);
    }
    this.camera.follow = null;
    this.drama = false;
    this.aiGrace = Math.round(TICK_HZ * 1.2);
    this.ui.title(null);
    // the scene's player handle becomes the controllable player
    const hero = this.handles.get(PLAYER_HANDLE);
    if (hero) {
      this.player = hero;
      this.kind.set(hero, "player");
      hero.team = 1;
    }
    this.report();
  }

  private handle(h: string | number) {
    return this.handles.get(Number(h));
  }

  private async exec([cmd, ...a]: Command) {
    const n = (i: number) => Number(a[i] ?? 0);
    const s = (i: number) => String(a[i] ?? "");
    switch (cmd) {
      case "begin":
      case "end":
        return;
      case "wait_complete":
        await Promise.all(this.pending);
        this.pending = [];
        await this.until(() => this.movers.size === 0);
        return;
      case "wait_time":
      case "wait_timeex": {
        const until = this.tick + ms(n(0));
        await this.until(() => this.tick >= until);
        return;
      }
      case "background": {
        // 99 is the client's blank dummy.bg, a black backdrop behind a fade: nothing to show
        if (n(0) !== this.bg && this.story.rooms[String(n(0))]) await this.enterRoom(n(0), null);
        return;
      }
      case "background_offsetx":
        this.camera.x = this.camera.target = -n(0);
        return;
      case "camera_pos":
        this.camera.follow = null;
        this.camera.x = this.camera.target = n(0);
        return;
      case "camera_pan":
        this.camera.follow = null;
        this.camera.target = n(0) - this.camera.viewW / 2;
        this.pending.push(
          this.until(() => Math.abs(this.camera.x - Math.max(0, this.camera.target)) < 4),
        );
        return;
      case "camera_follow":
        this.camera.follow = this.handle(n(0)) ?? null;
        return;
      case "camera_shake":
      case "camera_shake_ex":
        this.ui.shake(10);
        return;
      case "add":
      case "addex": {
        const [h, sprite, x, , z] = [n(0), n(1), n(2), n(3), n(4)];
        const existing =
          this.handle(h) ?? (h === PLAYER_HANDLE && this.player ? this.player : undefined);
        if (existing) {
          existing.x = x;
          existing.z = z;
          this.handles.set(h, existing);
          return;
        }
        const path =
          h === PLAYER_HANDLE && this.playerPath
            ? this.playerPath
            : this.story.sprites[String(sprite)];
        if (!path) return;
        if (h === PLAYER_HANDLE) this.playerPending = true;
        const item = isItem(sprite);
        const f = await this.spawn(
          path,
          h === PLAYER_HANDLE ? 1 : 0,
          x,
          z,
          h === PLAYER_HANDLE ? "player" : item ? "item" : "npc",
          cmd === "addex" && n(5) ? -1 : 1,
        );
        if (f) this.handles.set(h, f);
        return;
      }
      case "remove": {
        const f = this.handle(n(0));
        if (f && f !== this.player) this.despawn(f);
        this.handles.delete(n(0));
        return;
      }
      case "character_pos": {
        const f = this.handle(n(0));
        if (f) {
          f.x = n(1);
          f.z = n(2);
        }
        return;
      }
      case "move":
      case "moveex":
      case "run":
      case "runex":
      case "walk": {
        const f = this.handle(n(0));
        if (f) this.movers.set(f, { x: n(1), z: n(2), run: cmd.startsWith("run"), tick: 0 });
        return;
      }
      case "faceleft":
      case "faceright": {
        const f = this.handle(n(0));
        if (f) f.facing = cmd === "faceleft" ? -1 : 1;
        return;
      }
      case "doaction": {
        const f = this.handle(n(0));
        if (f && f.frameAt(n(1))) f.goto(n(1));
        return;
      }
      case "changeteam": {
        const f = this.handle(n(0));
        if (f) {
          f.team = n(1) === 1 ? 2 : n(1);
          if (f.team === 2) this.kind.set(f, "enemy");
        }
        return;
      }
      case "changeholder": {
        // an item changes hands: keep it next to its new holder
        const item = this.handle(n(0));
        const holder = this.handle(n(1));
        if (item && holder) {
          item.x = holder.x + holder.facing * 18;
          item.z = holder.z + 1;
          item.y = -40;
        }
        return;
      }
      case "talk":
      case "talkex": {
        const lines = this.story.dialogue[String(n(0))] ?? [];
        const picked = cmd === "talkex" ? lines.slice(n(1), n(2) + 1) : lines;
        if (picked.length) this.pending.push(this.ui.talk(picked));
        return;
      }
      case "playmusic":
        this.ui.music(s(0).split(/[\\/]/).pop()!.toLowerCase());
        return;
      case "stopmusic":
        this.ui.music(null);
        return;
      case "playsound":
        this.ui.sound(s(0).split(/[\\/]/).pop()!.toLowerCase());
        return;
      case "fadeout":
        this.faded = true;
        this.pending.push(this.ui.fade(1, Math.max(200, n(1) * 150)));
        return;
      case "fadein":
        this.faded = false;
        this.pending.push(this.ui.fade(0, Math.max(200, n(1) * 150)));
        return;
      case "show_titlepic":
        this.ui.title({ top: s(0), bottom: s(1) });
        return;
      case "hide_titlepic":
      case "fadeout_titlepic":
        this.ui.title(null);
        return;
      default:
        // giveitem, showpicture, changesprite, credits …: not needed for the replay yet
        return;
    }
  }
}
