import type { Bla, Button, CharData, Frame, InputState, Move } from "./types";
import type { Hasher } from "./hash";
import { stepLoose } from "./items";
import { skillBonus } from "./skills";
import { isHeld, type StatusKind, tickStatus } from "./status";
import { EMPTY_INPUT } from "./types";

/*
  Movement rules follow the Little Fighter family the .spt data was authored for:
  - a frame shows for (d + 1) ticks at 30 Hz; nx = -1 returns to the default action
  - entering a frame sets vx = dvx * facing / vy = dvy when they are non-zero
  - basic control (walk, run, jump, attack, guard) is driven by the action table
    (STAND 0, WALK 10, RUN 40, JUMPSTU 400, JUMPU 450, ATTACK1 500 ...)
  - special moves come from the `spm` table: G/F/B/U/D/A/J sequences, F/B relative to facing
*/

export const GRAVITY = 1.7;
/**
 * .spt types of things that lie in the field and can be picked up (100 weapon, 200 heavy, 300 long
 * weapon, 400 throwable, 500 potion, 600 shield, 900 bow, 1000 arrow). Skill effects carry types
 * too (800 …), so "has a type" is not "is an item".
 */
/** 700: the stage keys (金 / 藍 / 橙 / 綠 / 紫鑰匙 and the script keys), picked up onto the key ring */
export const FIELD_ITEM_TYPES = new Set([100, 200, 300, 400, 500, 600, 700, 900, 1000]);
/** frame states that loop in the air until touching the floor */
const AIR_WAIT = new Set([103, 2151]);
/**
 * ticks allowed between one command key and the next (a whole 防 防 ← ↑ → 攻 can take its time;
 * the client gives its double taps the same 15 frames, LFO.exe 0x531437)
 */
const KEY_GAP = 15;
/** ticks between two taps of a direction that count as a double tap (LFO.exe 0x5312d5 / 0x531437) */
const DOUBLE_TAP = 15;
const ROLL_SPEED = 4; // px per tick along the depth while rolling on the floor
const BUTTONS = Object.keys(EMPTY_INPUT) as Button[];
/** SP (體力) without a level table: the att row's usual default */
const DEFAULT_SP = 1000;
const SP_REFILL_TICKS = 20 * 30; // empty to full in 20 s while not guarding

export type Key = "G" | "F" | "B" | "U" | "D" | "A" | "J";

export type FighterEvent =
  | { type: "sound"; name: string; x: number }
  | { type: "move"; fighter: number; move: Move; name: string }
  | {
      type: "hit";
      attacker: number;
      target: number;
      damage: number;
      x: number;
      y: number;
      blocked: boolean;
    }
  | { type: "land"; fighter: number }
  | { type: "pick"; fighter: number; item: number }
  /** a key picked up: it goes on the key ring (the director's), not into the hands */
  | { type: "key"; fighter: number; key: number }
  | { type: "spawn"; fighter: number; bla: Bla }
  /** an element took hold of (on) or let go of (off) a fighter */
  | { type: "status"; fighter: number; kind: StatusKind; on: boolean };

const EFFECT_LIFE = 150; // ticks: a safety net for effects that loop forever

/**
 * A frame name reduced to its family: letters only, lower case, the back-fall prefix kept as a
 * leading b (`BOU0NCE1` → `bounce`, `B_LIEDOWN` → `bliedown`). The .spt data spells the fall
 * chain a dozen ways — lower case, a stray digit, a numbered step — and they all mean the same.
 */
const family = (n: string) =>
  n
    .replace(/[^A-Za-z_]/g, "")
    .toLowerCase()
    .replace("_", "");

/** What a frame name says it is: a fall, a bounce, a lie-down, and whether it is the B_ (on the back) one. */
type Kin = { fall: boolean; bounce: boolean; lie: boolean; back: boolean };
const kins = new Map<string, Kin>();
function kin(n: string): Kin {
  let k = kins.get(n);
  if (!k) {
    const f = family(n);
    k = {
      fall: /^b?fall/.test(f),
      bounce: /^b?bounce/.test(f),
      lie: /^b?liedown$/.test(f),
      back: /^b(bounce|fall|liedown)/.test(f),
    };
    kins.set(n, k);
  }
  return k;
}

/**
 * Does a frame belong to the animation an action asks for? Compared on the family's stem — its
 * letters up to the step number — so FALL1A may start on FALL2C, BOUNCE1 on a `BOU0NCE1`, but a
 * FALL1A never starts on FALLRECOVERY (a different animation that merely shares the prefix).
 */
function frameMatches(action: string, frame: string) {
  const stem = (s: string) => family(s).match(/^[a-z]+/)![0];
  return stem(frame) === stem(action);
}

/** Resolved action → frame lookups per sprite, memoised (a pure function of the data). */
const resolved = new WeakMap<CharData, Map<string, number | undefined>>();

/**
 * The frame a fall-chain action should really start on. `.spt` tables point some actions at
 * frames they do not have, or at a frame of another animation altogether (a FALL1A on STAND);
 * a name that does not match falls back to the first frame whose name does, so the chain runs.
 */
function actionFrame(data: CharData, name: string): number | undefined {
  let memo = resolved.get(data);
  if (!memo) resolved.set(data, (memo = new Map()));
  if (memo.has(name)) return memo.get(name);
  let id: number | undefined = data.actions[name];
  const f = id === undefined ? undefined : data.frames[String(id)];
  if (!f || !frameMatches(name, f.n)) {
    id = undefined;
    for (const [key, frame] of Object.entries(data.frames))
      if (frameMatches(name, frame.n)) {
        id = Number(key);
        break;
      }
  }
  memo.set(name, id);
  return id;
}

export type Stage = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Everything a fighter is at one tick (World.snapshot): rollback netcode restores it and
 * re-simulates. Other fighters are referred to by id; `data` is the shared sprite data.
 */
export type FighterSnapshot = {
  data: CharData;
  team: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: 1 | -1;
  frameId: number;
  ticksLeft: number;
  hp: number;
  mp: number;
  sp: number;
  hitStop: number;
  attackSerial: number;
  hitBy: string[];
  fallAcc: number;
  dizzyAcc: number;
  infiniteMp: boolean;
  effect: boolean;
  dead: boolean;
  knockedOut: boolean;
  level: number;
  reward: number;
  rewardScale: number;
  hpMax: number | null;
  mpMax: number | null;
  spMax: number | null;
  power: number;
  guard: number;
  holding: number;
  heldBy: number;
  thrownBy: number;
  itemState: "ground" | "sky" | "held" | "thrown";
  angle: number;
  hidden: boolean;
  heldAid: number;
  showBars: boolean;
  pendingLevelUp: boolean;
  status: [StatusKind, number][];
  skillLevels: Record<number, number>;
  moveBonus: number;
  prev: InputState;
  queued: number | null;
  buffer: { key: Key; t: number }[];
  lastTap: { dir: -1 | 1; t: number } | null;
  altAttack: boolean;
  jumpDir: number;
  jumpRun: boolean;
  t: number;
};

export class Fighter {
  x = 0;
  y = 0; // height; negative is up
  z = 0; // depth on the floor
  vx = 0;
  vy = 0;
  vz = 0;
  facing: 1 | -1 = 1;
  frameId = 0;
  frame: Frame;
  ticksLeft = 1;
  hp: number;
  mp: number;
  /** 體力: blocking a hit spends it, and with none left a hit can't be blocked */
  sp = 0;
  hitStop = 0;
  /** increments every time a frame with hit boxes is entered, so one swing hits each target once */
  attackSerial = 0;
  readonly hitBy = new Set<string>();
  fallAcc = 0;
  dizzyAcc = 0;
  infiniteMp = false;
  /** a spawned effect/projectile: no gravity, no control, removed when its frame chain ends */
  effect = false;
  dead = false;
  /** the 0-HP fall has been started (knockOut), so it is never launched a second time */
  knockedOut = false;
  /** level (a story monster's, or the player's profile) and the EXP a KO is worth */
  level = 1;
  reward = 0;
  /** share of that EXP a KO pays: half for an endless spawner's monsters (system/exp.mdx) */
  rewardScale = 1;
  /** stat overrides from the player's level; null = the .spt values */
  hpMax: number | null = null;
  mpMax: number | null = null;
  spMax: number | null = null;
  /** damage dealt / taken multipliers from STR and DEF */
  power = 1;
  guard = 1;
  /* ── items (core/items.ts) ── */
  /** the item this fighter carries, or for an item: who carries / threw it */
  holding: Fighter | null = null;
  heldBy: Fighter | null = null;
  thrownBy: Fighter | null = null;
  /** an item's state: lying on the floor, falling, carried, flying after a throw */
  itemState: "ground" | "sky" | "held" | "thrown" = "sky";
  /** a carried item's rotation (radians, from the holder's wpn.o) and whether it is drawn */
  angle = 0;
  hidden = false;
  /** the item action currently shown while carried (the holder's wpn.aid) */
  heldAid = -1;
  /** draw the HP / MP / SP bars under the feet (every enemy in the client) */
  showBars = false;
  /** a level-up waiting for the next neutral moment to play the LEVELUP pose */
  pendingLevelUp = false;
  /** elements on this fighter and the ticks each has left (core/status.ts) */
  readonly status = new Map<StatusKind, number>();
  /** 招式等級 by skill slot (a missing slot is LV 1); the game layer fills it from the save */
  skillLevels: Record<number, number> = {};
  /** damage multiplier of the special being performed (1 outside one) */
  moveBonus = 1;

  private prev: InputState = { ...EMPTY_INPUT };
  /** a special asked for by slot through cast(), tried on the next tick */
  private queued: number | null = null;
  private buffer: { key: Key; t: number }[] = [];
  private lastTap: { dir: -1 | 1; t: number } | null = null;
  /** when each direction was last tapped, and the directions double-tapped this tick */
  private lastPress: Partial<Record<Button, number>> = {};
  private doubleTap = new Set<Button>();
  /** a 防 sidestep's way along the depth (-1 into the screen, 1 out), set as it starts */
  private sidestep = 0;
  private altAttack = false;
  private jumpDir = 0;
  private jumpRun = false;
  private t = 0;

  constructor(
    readonly id: number,
    /** the sprite data; swapped by morph() (異轉) */
    public data: CharData,
    public team: number,
  ) {
    this.hp = data.attrs.hp;
    this.mp = data.attrs.mp;
    this.sp = this.maxSp;
    // most sprites start at frame 0; some items (potions) start at 1
    this.frame = this.frameAt(0) ?? Object.values(data.frames)[0];
    this.goto(this.action("STAND"));
  }

  get maxHp() {
    return this.hpMax ?? this.data.attrs.hp;
  }
  get maxMp() {
    return Math.max(this.mpMax ?? this.data.attrs.mp, ...this.data.moves.map((m) => m.mp));
  }
  get maxSp() {
    return this.spMax ?? DEFAULT_SP;
  }
  /** rolling (DODGE) and rolling on the floor: the client's [Dodge Pick] body — hits miss it */
  get dodging() {
    return this.anim === "DODGE" || /LIEDOWNROLL[UD]$/.test(this.anim);
  }
  get airborne() {
    return this.y < 0 || this.vy < 0;
  }
  /** Animation family of the current frame, e.g. "WALK", "ATTACK1". */
  get anim() {
    return this.frame.n;
  }

  frameAt(id: number): Frame | undefined {
    return this.data.frames[String(id)];
  }
  action(name: string): number {
    return this.data.actions[name] ?? 0;
  }

  /* ───────── per tick ───────── */

  /** field item (weapon, heavy object, potion …) rather than a character */
  get isItem() {
    return !this.effect && FIELD_ITEM_TYPES.has(this.data.attrs.type ?? 0);
  }
  get itemType() {
    return this.data.attrs.type ?? 0;
  }
  /** Is the current frame one of this action's (its start frame and the next few)? */
  private inAction(name: string) {
    const start = this.data.actions[name];
    return start !== undefined && this.frameId >= start && this.frameId < start + 10;
  }
  /** Falling, bouncing or lying on the floor. */
  get down() {
    const k = kin(this.anim);
    return k.fall || k.bounce || k.lie || this.lieDown;
  }
  /**
   * Out of HP but still on its feet (the last point went to chip damage, a potion misfire …): fall
   * now. Only once — a sprite whose fall chain cannot reach LIEDOWN (no BOUNCE1, a FALL1A that is
   * really its STAND) would otherwise be relaunched every time it lands, and never be seen as dead.
   */
  knockOut() {
    if (this.hp > 0 || this.knockedOut || this.down || this.airborne || this.effect || this.isItem)
      return;
    this.hp = 0;
    this.knockedOut = true;
    this.vy = -6;
    this.y = Math.min(this.y, -1);
    // no fall and no lie-down to go to: it simply drops where it stands, and lands
    this.goto(this.fallFrame(false) ?? this.frameId);
  }
  /**
   * The frame a knock-down starts on. Some sprites' FALL1A points at their STAND (or their HIT):
   * with no fall of their own they go straight to the floor.
   */
  fallFrame(back: boolean): number | undefined {
    return actionFrame(this.data, back ? "B_FALL1A" : "FALL1A") ?? this.lieFrame(back);
  }
  /**
   * Out of the fight for good: it has lain down, or it never had a lie-down to reach and has
   * come to rest. What the story waits for before it clears a wave, and what tells it the player
   * has lost. (A sprite with no LIEDOWN still has to land: a fighter in mid-air is not finished
   * just because its animation has nowhere to go.)
   */
  get finished() {
    if (this.hp > 0) return false;
    if (this.lieDown) return true;
    // a sprite with no lie-down at all is out once it is back on the floor
    return actionFrame(this.data, "LIEDOWN") === undefined && !this.airborne;
  }
  /** Lying on the floor, by frame name or by the action table (chars/karl names its frames in lower case). */
  private get lieDown() {
    if (kin(this.anim).lie) return true;
    // an action table may point LIEDOWN at a frame named something else; never at frame 0 by
    // default (a sprite with no LIEDOWN would otherwise read its STAND as a lie-down)
    const lie = actionFrame(this.data, "LIEDOWN");
    return lie !== undefined && this.frameId === lie;
  }
  /**
   * The frame to lie down on, or undefined for a sprite that has no lie-down at all (it stays
   * where it fell, and `finished` counts it out on HP and rest).
   */
  private lieFrame(back = false): number | undefined {
    return (
      actionFrame(this.data, back ? "B_LIEDOWN" : "LIEDOWN") ?? actionFrame(this.data, "LIEDOWN")
    );
  }
  /** Go and lie down, or — with no lie-down to go to — stay where it is. */
  private lieOrStay(back: boolean, events: FighterEvent[]) {
    const lie = this.lieFrame(back);
    return this.goto(lie ?? this.frameId, events);
  }
  /**
   * 異轉: become another form in place — same fighter, HP, level and position, the new form's
   * frames and moves — entering its `action` (the transformed form's TRANSFORM burst) or STAND.
   */
  morph(data: CharData, action = "TRANSFORM") {
    this.data = data;
    this.hitStop = 0;
    this.goto(data.actions[action] ?? this.action("STAND"));
  }
  /** An action, swapped for its HEAVY* twin while carrying a heavy object. */
  act(name: string) {
    if (this.holding?.itemType === 200) {
      const heavy = this.data.actions[`HEAVY${name}`];
      if (heavy !== undefined) return heavy;
    }
    return this.action(name);
  }
  /** Standing / walking on the floor with nothing going on (the moment a pick-up can happen). */
  get idle() {
    return this.groundNeutral();
  }
  /** a new press of this button this tick */
  fresh(input: InputState, b: Button) {
    return input[b] && !this.prev[b];
  }

  step(input: InputState, stage: Stage, events: FighterEvent[]) {
    this.t++;
    if (this.effect) return this.stepEffect(events);
    if (this.isItem) return stepLoose(this, stage, GRAVITY, events);
    if (this.status.size) {
      for (const kind of tickStatus(this))
        events.push({ type: "status", fighter: this.id, kind, on: false });
      // 混亂: left is right and right is left
      if (this.status.has("confuse")) input = { ...input, left: input.right, right: input.left };
      // in ice or stone: nothing moves but gravity
      if (isHeld(this)) {
        this.physics(EMPTY_INPUT, stage, events);
        this.prev = { ...input };
        return;
      }
    }
    const pressed = (b: Button) => input[b] && !this.prev[b];
    this.recordKeys(input, pressed);

    if (this.hitStop > 0) {
      this.hitStop--;
      this.prev = { ...input };
      return;
    }

    if (
      !this.recover(input, pressed, events) &&
      !this.castQueued(events) &&
      !this.tryMove(pressed, events)
    )
      this.control(input, pressed);
    // a roll carries its fighter along the depth for as long as it lasts
    if (/LIEDOWNROLL[UD]$/.test(this.anim))
      this.vz = this.anim.endsWith("U") ? -ROLL_SPEED : ROLL_SPEED;

    // frame timer
    if (--this.ticksLeft <= 0) this.advance(events, input);
    // back on its feet with nothing going on: the special is over
    if (this.moveBonus !== 1 && this.idle) this.moveBonus = 1;

    this.physics(input, stage, events);
    if (this.fallAcc > 0) this.fallAcc = Math.max(0, this.fallAcc - 0.5);
    if (this.dizzyAcc > 0) this.dizzyAcc = Math.max(0, this.dizzyAcc - 0.5);
    if (this.mp < this.maxMp && !this.airborne) this.mp = Math.min(this.maxMp, this.mp + 1);
    if (this.sp < this.maxSp && !this.anim.startsWith("GUARD"))
      this.sp = Math.min(this.maxSp, this.sp + this.maxSp / SP_REFILL_TICKS);
    this.prev = { ...input };
  }

  goto(id: number, events?: FighterEvent[]) {
    const f = this.frameAt(id);
    if (!f) {
      // some props' STAND points at a frame they lack: fall back to frame 0, never loop
      const stand = this.action("STAND");
      if (id !== stand && this.frameAt(stand)) this.goto(stand, events);
      else if (id !== 0 && this.frameAt(0)) this.goto(0, events);
      return;
    }
    this.frameId = id;
    this.frame = f;
    this.ticksLeft = f.d + 1;
    if (f.dvx) this.vx = f.dvx * this.facing;
    if (f.dvy) this.vy = f.dvy;
    if (f.dvz) this.vz = f.dvz;
    if (f.atk) this.attackSerial++;
    if (f.snd && events) events.push({ type: "sound", name: f.snd, x: this.x });
    if (f.bla && events)
      for (const bla of f.bla) if (bla.type) events.push({ type: "spawn", fighter: this.id, bla });
  }

  private stepEffect(events: FighterEvent[]) {
    if (this.hitStop > 0) {
      this.hitStop--;
      return;
    }
    if (--this.ticksLeft <= 0) {
      const { nx, s } = this.frame;
      // the chain ends on -1, on a frame that does not exist, or parks on a "gone" frame (state 100)
      if (nx === -1 || !this.frameAt(nx) || (nx === this.frameId && s === 100)) this.dead = true;
      else this.goto(nx, events);
    }
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz;
    if (this.t > EFFECT_LIFE) this.dead = true;
  }

  /* ───────── input ───────── */

  private recordKeys(input: InputState, pressed: (b: Button) => boolean) {
    const push = (key: Key) => this.buffer.push({ key, t: this.t });
    if (pressed("defend")) push("G");
    if (pressed("up")) push("U");
    if (pressed("down")) push("D");
    for (const [b, dir] of [
      ["left", -1],
      ["right", 1],
    ] as const) {
      if (!pressed(b)) continue;
      // a neutral fighter turns first, so the tap reads as "forward" — except inside a 防 …
      // command, whose 前 / 後 are taken against the way the fighter faced when it began
      // (防 後 前 攻 could never be typed if 後 turned it round)
      if (this.canTurn() && !this.commandPending()) this.facing = dir;
      push(dir === this.facing ? "F" : "B");
    }
    if (pressed("attack")) push("A");
    if (pressed("jump")) push("J");
    // a command lives while its keys keep coming: each within KEY_GAP of the one before
    let keep = this.buffer.length;
    if (keep && this.t - this.buffer[keep - 1].t > KEY_GAP) keep = 0;
    while (keep > 1 && this.buffer[keep - 1].t - this.buffer[keep - 2].t <= KEY_GAP) keep--;
    this.buffer = this.buffer.slice(keep ? keep - 1 : this.buffer.length).slice(-8);
    // double taps of each direction (the client's 0x460 / 0x46c / 0x478 / 0x47c flags)
    this.doubleTap.clear();
    for (const b of ["left", "right", "up", "down"] as const) {
      if (!pressed(b)) continue;
      const last = this.lastPress[b];
      if (last !== undefined && this.t - last <= DOUBLE_TAP) {
        this.doubleTap.add(b);
        delete this.lastPress[b];
      } else this.lastPress[b] = this.t;
    }
    void input;
  }

  /** The newest special whose input sequence ends the buffer and whose conditions hold. */
  private tryMove(pressed: (b: Button) => boolean, events: FighterEvent[]) {
    if (!pressed("attack") && !pressed("jump")) return false;
    if (!this.canSpecial()) return false;
    const seq = this.buffer.map((k) => k.key).join("");
    const candidates = [...this.data.moves].sort(
      (a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length)),
    );
    for (const m of candidates) {
      if (!m.keys.some((k) => seq.endsWith(k))) continue;
      if (m.from) {
        const src = this.frameAt(m.from);
        if (!src || src.n !== this.frame.n) continue;
      } else if (m.keys.every((k) => k.length === 1)) {
        continue; // bare A / J only ever work as chains
      }
      if (this.perform(m, events)) return true;
    }
    return false;
  }

  /**
   * 出招表: perform the special in `slot` on the next tick, as if its command had been typed
   * (clicking a skill icon). Dropped if the fighter can't start a special then.
   */
  cast(slot: number) {
    this.queued = slot;
  }

  private castQueued(events: FighterEvent[]) {
    const slot = this.queued;
    this.queued = null;
    if (slot === null || !this.canSpecial()) return false;
    const m = this.data.moves.find(
      (m) => m.slot === slot && !m.from && m.keys.some((k) => k.length > 1),
    );
    return !!m && this.perform(m, events);
  }

  /** Start a special: its frame must exist and its MP be there; pays the MP. */
  private perform(m: Move, events: FighterEvent[]) {
    if (!this.frameAt(m.to)) return false;
    if (!this.infiniteMp && this.mp < m.mp) return false;
    if (!this.infiniteMp) this.mp -= m.mp;
    this.buffer = [];
    this.vx = 0;
    this.moveBonus = skillBonus(this.skillLevels[m.slot] ?? 1);
    this.goto(m.to, events);
    events.push({ type: "move", fighter: this.id, move: m, name: this.frame.n });
    return true;
  }

  private groundNeutral() {
    const a = this.anim.replace(/^HEAVY/, "");
    return !this.airborne && (a === "STAND" || a === "WALK");
  }
  /** A 防-led command is being typed (a recent 防 in the buffer). */
  private commandPending() {
    return this.buffer.some((k) => k.key === "G");
  }

  /**
   * The keys typed so far begin a longer special (防 攻 of 防 攻 攻, 防 跳 of 防 跳 跳 …): the
   * normal attack / jump holds off so the command can be finished.
   */
  private commandPrefix() {
    const seq = this.buffer.map((k) => k.key).join("");
    const g = seq.lastIndexOf("G");
    if (g < 0) return false;
    const typed = seq.slice(g);
    return this.data.moves.some(
      (m) => !m.from && m.keys.some((k) => k.length > typed.length && k.startsWith(typed)),
    );
  }

  private canTurn() {
    return this.groundNeutral() || this.anim === "JUMPU";
  }
  private canSpecial() {
    const a = this.anim;
    return (
      this.groundNeutral() ||
      a === "RUN" ||
      a.startsWith("GUARD") ||
      a === "JUMPU" ||
      a === "DODGE" ||
      this.data.moves.some((m) => m.from && this.frameAt(m.from)?.n === a)
    );
  }

  /* ───────── basic control ───────── */

  /**
   * Getting out of a knock-down, from the frames the client ships for it: 跳 on the way down
   * flips back onto the feet (FALLRECOVERY); ↑ / ↓ while bouncing or lying on the floor rolls
   * along the depth (LIEDOWNROLLU / D, B_ for a fall on the back) and comes up at the end.
   */
  private recover(
    input: InputState,
    pressed: (b: Button) => boolean,
    events: FighterEvent[],
  ): boolean {
    if (this.hp <= 0) return false;
    const k = kin(this.anim);
    if (
      k.fall &&
      this.airborne &&
      this.vy > 0 &&
      pressed("jump") &&
      this.data.actions.FALLRECOVERY !== undefined
    ) {
      this.vx *= 0.5;
      this.fallAcc = 0;
      this.goto(this.action("FALLRECOVERY"), events);
      return true;
    }
    // not from a roll already under way (LIEDOWNROLL…): a held ↑ / ↓ would restart it every tick
    if ((k.lie || k.bounce) && !this.airborne && (input.up || input.down)) {
      const roll = `${k.back ? "B_" : ""}LIEDOWNROLL${input.up ? "U" : "D"}`;
      if (this.data.actions[roll] === undefined) return false;
      this.vx = 0;
      this.goto(this.action(roll), events);
      return true;
    }
    return false;
  }

  private control(input: InputState, pressed: (b: Button) => boolean) {
    // a carried heavy object swaps the move set for its HEAVY* twin; compare on the plain name
    const a = this.anim.replace(/^HEAVY/, "");
    const h = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const v = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const heavy = this.holding?.itemType === 200;
    const walk = this.data.attrs.walk * (heavy ? 0.6 : 1);
    const run = this.data.attrs.run * (heavy ? 0.6 : 1);

    // attack / jump / guard repeat while held, like the original client
    if (this.groundNeutral()) {
      if (this.pendingLevelUp && this.data.actions.LEVELUP !== undefined && !this.holding) {
        this.pendingLevelUp = false;
        this.vx = this.vz = 0;
        return this.goto(this.action("LEVELUP"));
      }
      if ((input.attack || input.jump) && this.commandPrefix()) return;
      if (input.attack) {
        this.vx = 0;
        if (this.holding) return this.itemAttack(h !== 0 && h === this.facing, "ground");
        this.altAttack = !this.altAttack;
        return this.goto(this.action(this.altAttack ? "ATTACK1" : "ATTACK2"));
      }
      if (input.jump) return this.startJump(h, false);
      // no SP, no guard ("你現時的 SP 不足")
      if (input.defend && !heavy && this.sp > 0) {
        this.vx = this.vz = 0;
        if (this.holding?.itemType === 600 && this.data.actions.SHIELDUSE !== undefined)
          return this.goto(this.action("SHIELDUSE"));
        return this.goto(this.action("GUARDST"));
      }
      // double tap to run
      for (const [b, dir] of [
        ["left", -1],
        ["right", 1],
      ] as const) {
        if (!pressed(b)) continue;
        if (
          this.lastTap &&
          this.lastTap.dir === dir &&
          this.t - this.lastTap.t <= DOUBLE_TAP &&
          !this.commandPending()
        ) {
          this.lastTap = null;
          this.facing = dir;
          return this.goto(this.act("RUN"));
        }
        this.lastTap = { dir, t: this.t };
      }
      if (h || v) {
        // inside a 防 command the fighter keeps its facing (後 is a key, not a turn)
        if (h && !this.commandPending()) this.facing = h > 0 ? 1 : -1;
        this.vx = h * walk;
        this.vz = v * walk * 0.5;
        if (a !== "WALK") this.goto(this.act("WALK"));
      } else if (a === "WALK") {
        this.vx = this.vz = 0;
        this.goto(this.act("STAND"));
      }
      return;
    }

    if (a === "RUN") {
      this.vx = run * this.facing;
      this.vz = v * walk * 0.5;
      if ((this.facing > 0 && pressed("left")) || (this.facing < 0 && pressed("right")))
        return this.goto(this.act("RUNEN"));
      if (pressed("attack"))
        return this.holding ? this.itemAttack(true, "run") : this.goto(this.action("ATTACKRUN"));
      if (pressed("jump")) return this.startJump(this.facing, true);
      if (pressed("defend") && !heavy) return this.goto(this.action("DODGE"));
      return;
    }

    if (a === "JUMPU" && input.attack)
      return this.holding
        ? this.itemAttack(h !== 0 && h === this.facing, "air")
        : this.goto(this.action("ATTACKJUMP"));

    // 防 held (LFO.exe 0x533e33, the GUARD state): a double tap of ← / → rolls that way, of
    // ↑ / ↓ sidesteps along the depth
    if ((a === "GUARD" || a === "GUARDST") && !heavy) {
      for (const [b, dir] of [
        ["left", -1],
        ["right", 1],
      ] as const)
        if (this.doubleTap.has(b) && this.data.actions.DODGE !== undefined) {
          this.facing = dir;
          this.buffer = [];
          return this.goto(this.action("DODGE"));
        }
      for (const [b, way, name] of [
        ["up", -1, "DODGEUPST"],
        ["down", 1, "DODGEDNST"],
      ] as const)
        if (this.doubleTap.has(b) && this.data.actions[name] !== undefined) {
          this.sidestep = way;
          this.buffer = [];
          this.vx = 0;
          return this.goto(this.action(name));
        }
    }
    // a roll keeps its speed (LFO.exe 0x533a3b): the run speed along the facing, or 0.7 of it
    // with ↑ / ↓ held, which also carries it along the depth at speed / 2.8
    if (a === "DODGE") {
      this.vx = run * this.facing * (v ? 0.7 : 1);
      this.vz = (v * run) / 2.8;
      return;
    }
    if (a === "GUARD" && (!input.defend || this.sp <= 0)) return this.goto(this.action("GUARDEN"));
    // a charge (…POWERUP) loops while 攻 is held and lets go into its …POWERUP2
    if (
      /POWERUP$/.test(this.anim) &&
      !input.attack &&
      this.data.actions[`${this.anim}2`] !== undefined
    )
      return this.goto(this.action(`${this.anim}2`));
    // stop drinking (the rest stays in the bottle)
    if (a === "DRINK" && (pressed("defend") || pressed("jump")))
      return this.goto(this.action("DRINK2STAND"));
  }

  /**
   * 攻 with an item in hand. Swords and long weapons swing (SWORD* / SPEAR* sets) or, pushed
   * forward / from a run, are thrown (*THW*); throwables and heavy objects are always thrown;
   * potions are drunk; bows shoot.
   */
  private itemAttack(forward: boolean, where: "ground" | "run" | "air") {
    const t = this.holding!.itemType;
    const sky = where === "air";
    const pick = (...names: string[]) => {
      for (const n of names)
        if (this.data.actions[n] !== undefined) return this.goto(this.action(n));
    };
    if (t === 200) return pick(sky ? "HEAVYTHWSKYST" : "HEAVYTHWST");
    if (t === 500)
      return sky ? pick("POTIONTHWSKYST") : forward ? pick("POTIONTHWST") : pick("STAND2DRINK");
    if (t === 900) return pick(sky ? "JUMPBOWSHOOT" : "BOWSHOOT");
    const set = t === 300 ? "SPEAR" : "SWORD";
    if (t === 400 || forward || where === "run")
      return pick(sky ? `${set}THWSKYST` : `${set}THWST`, sky ? "THWSKYST" : "THWST");
    return pick(sky ? `${set}ATTACKJUMP` : `${set}ATTACK`);
  }

  private startJump(dir: number, fromRun: boolean) {
    this.jumpDir = dir;
    this.jumpRun = fromRun;
    this.goto(this.act("JUMPSTU"));
  }

  private launch() {
    const { jumpH, jumpD, runJumpH, runJumpD } = this.data.attrs;
    this.vy = -(this.jumpRun ? runJumpH : jumpH);
    this.vx = this.jumpDir * (this.jumpRun ? runJumpD : jumpD);
    this.goto(this.act("JUMPU"));
    this.y = -1;
  }

  /* ───────── frame chain ───────── */

  private advance(events: FighterEvent[], input: InputState = this.prev) {
    const f = this.frame;
    // the take-off ends: leave the floor (by frame number, not name: some characters label their
    // airborne JUMPU frames "JUMPSTU")
    if (/^(HEAVY)?JUMPST/.test(f.n) && f.nx === -1 && !this.inAction("JUMPU")) return this.launch();
    // a 防 sidestep (DODGEUPST / DODGEDNST, one frame) hops along the depth as DODGEUP / DODGEDN,
    // an airborne state that ends on landing
    if (f.n === "DODGEUPST" || f.n === "DODGEDNST") {
      const name = this.sidestep < 0 ? "DODGEUP" : "DODGEDN";
      if (this.data.actions[name] !== undefined) {
        this.goto(this.action(name), events);
        this.vz = this.sidestep * this.data.attrs.run * 0.8;
        this.vy = -this.data.attrs.jumpH * 0.5;
        this.y = -1;
        return;
      }
    }
    if (f.nx === -1) {
      // the client's stage convention: XST → X → XEN (THWST → THW → THWEN, HEAVYPICKST …),
      // and STAND2X → X (STAND2DRINK → DRINK)
      const n = f.n;
      const next = n.startsWith("STAND2")
        ? n.slice(6)
        : n.endsWith("ST") && !/^(HEAVY)?JUMPST|GUARDST/.test(n)
          ? n.slice(0, -2)
          : !n.endsWith("EN") && /THW|PICK/.test(n)
            ? `${n}EN`
            : null;
      if (next && next !== "STAND" && this.data.actions[next] !== undefined)
        return this.goto(this.action(next), events);
    }
    // states 103 / 2151 = hang in the air until landing (the end of an aerial special); a move that is
    // already back on the floor when it gets there lands at once instead of spinning forever
    const target = f.nx !== -1 ? this.frameAt(f.nx) : undefined;
    if (
      !this.airborne &&
      (AIR_WAIT.has(f.s) || (target && AIR_WAIT.has(target.s) && target.nx === f.nx))
    )
      return this.goto(this.act("JUMPLAND"), events);
    // a bounce that ends on the floor goes down rather than on to whatever its nx points at: some
    // point it at a HIT frame (Tower2Boss1's BOUNCE1 → HIT2), which would stand a 0-HP fighter up.
    // A bounce that goes on to another bounce (BOUNCE1 → BOUNCE2 → BOUNCE3) still bounces.
    if (kin(f.n).bounce && !this.airborne && !(target && kin(target.n).bounce))
      return this.lieOrStay(kin(f.n).back, events);
    if (f.nx !== -1) return this.goto(f.nx, events);
    // default action
    // a fall frame that ends in mid-air holds until the landing (some creatures' FALL frames
    // have no loop of their own)
    // (a hard landing's bounce, too, holds until it comes back down)
    if ((kin(f.n).fall || kin(f.n).bounce) && this.airborne) return this.goto(this.frameId);
    // at 0 HP a fighter stays down: it is out (the story removes it, training revives it)
    if (this.lieDown && this.hp <= 0) return this.goto(this.frameId);
    // the raised shield stays up while 防 is held
    if (f.n === "SHIELDUSE" && input.defend && this.holding?.itemType === 600)
      return this.goto(this.frameId, events);
    // a sprite with no GETUP gets up on its default action (the client's own fallback)
    if (this.lieDown) {
      const up = actionFrame(this.data, kin(f.n).back ? "B_GETUP" : "GETUP");
      return this.goto(up ?? this.act("STAND"), events);
    }
    // a roll ends getting up
    if (/LIEDOWNROLL[UD]$/.test(f.n)) {
      this.vz = 0;
      return this.goto(this.action(f.n.startsWith("B_") ? "B_GETUP" : "GETUP"), events);
    }
    // GUARDST ends in the default action; with 防 still held the client settles into GUARD,
    // which loops until 防 is let go (control() then plays GUARDEN)
    if (f.n === "GUARDST" || f.n === "GUARD")
      return this.goto(
        input.defend && this.sp > 0
          ? this.action("GUARD")
          : this.action(f.n === "GUARD" ? "GUARDEN" : "STAND"),
        events,
      );
    if (f.n.startsWith("DIZZY")) return this.goto(this.action("STAND"), events);

    // the act table's next action: where an action's frames run out, the client enters the one
    // its row names (SUPER2START → SUPER2LOOP_R: 散彈氣功波's wind-up continues into its loop).
    // Last, so the rules above — a held 防, a landing, a knock-down — keep their say.
    const cont = this.data.cont?.[String(this.frameId)];
    if (!this.airborne && cont !== undefined && this.frameAt(cont)) return this.goto(cont, events);

    this.goto(this.act(this.airborne ? "JUMPU" : "STAND"), events);
  }

  /* ───────── physics ───────── */

  private physics(input: InputState, stage: Stage, events: FighterEvent[]) {
    if (this.airborne) {
      this.vy += GRAVITY;
      this.y += this.vy;
      if (this.y >= 0) this.land(events);
    }
    this.x += this.vx;
    this.z += this.vz;

    const controlled = this.anim === "WALK" || this.anim === "RUN";
    if (!this.airborne && !controlled) {
      this.vx = Math.sign(this.vx) * Math.max(0, Math.abs(this.vx) - 1);
      this.vz = Math.sign(this.vz) * Math.max(0, Math.abs(this.vz) - 1);
    }
    if (this.x < stage.minX || this.x > stage.maxX) {
      this.x = Math.min(stage.maxX, Math.max(stage.minX, this.x));
      this.vx = 0;
    }
    this.z = Math.min(stage.maxZ, Math.max(stage.minZ, this.z));
    void input;
  }

  private land(events: FighterEvent[]) {
    this.y = 0;
    const falling = this.vy;
    this.vy = 0;
    events.push({ type: "land", fighter: this.id });
    const n = this.anim;
    // flipped back upright in the air (跳 on the way down): lands on its feet
    if (/^(B_)?FALLRECOVERY$/.test(n)) return this.goto(this.act("JUMPLAND"), events);
    if (n.startsWith("FALL") || n.startsWith("B_FALL")) {
      this.vx *= 0.5;
      this.fallAcc = 0;
      // a hard landing bounces once before lying down
      if (falling > 9) {
        this.vy = -falling * 0.35;
        this.y = -1;
      }
      const back = kin(n).back;
      // not every creature ships a bounce: without one it goes straight to lying down (a bounce
      // frame that is really its STAND would drop it into the 0-HP loop knockOut() guards against)
      const bounce = actionFrame(this.data, back ? "B_BOUNCE1" : "BOUNCE1");
      return bounce === undefined ? this.lieOrStay(back, events) : this.goto(bounce, events);
    }
    if (kin(n).bounce) return this.lieOrStay(kin(n).back, events);
    // a special that loops in the air has its own landing frame right after it
    const next = this.frameAt(this.frameId + 1);
    if (next && /land/i.test(next.n)) return this.goto(this.frameId + 1, events);
    if (
      /^(HEAVY)?JUMPU$/.test(n) ||
      this.inAction("JUMPU") ||
      /ATTACKJUMP|BOWSHOOT|THWSKY/.test(n) ||
      this.frame.nx === this.frameId ||
      this.frame.s === 103
    )
      return this.goto(this.act("JUMPLAND"), events);
  }

  /* ───────── netcode ───────── */

  /**
   * Feeds every field that drives the simulation into `h`, always in the same order, so two
   * fighters with the same history hash alike and any divergence shows — position, timers,
   * the input buffer, what is held. Drawing-only state (showBars) and the frame data stay out;
   * the data is pinned by its key.
   */
  hash(h: Hasher) {
    h.num(this.id).num(this.team).str(this.data.key);
    h.num(this.x).num(this.y).num(this.z).num(this.vx).num(this.vy).num(this.vz);
    h.num(this.facing).num(this.frameId).num(this.ticksLeft).num(this.hp).num(this.mp).num(this.sp);
    h.num(this.hitStop).num(this.attackSerial).num(this.fallAcc).num(this.dizzyAcc);
    h.bool(this.infiniteMp)
      .bool(this.effect)
      .bool(this.dead)
      .bool(this.knockedOut)
      .num(this.level)
      .num(this.reward);
    h.num(this.rewardScale)
      .num(this.hpMax ?? -1)
      .num(this.mpMax ?? -1)
      .num(this.spMax ?? -1);
    h.num(this.power).num(this.guard);
    h.num(this.holding?.id ?? 0)
      .num(this.heldBy?.id ?? 0)
      .num(this.thrownBy?.id ?? 0);
    h.str(this.itemState).num(this.angle).bool(this.hidden).num(this.heldAid);
    h.bool(this.pendingLevelUp).num(this.moveBonus);
    for (const [kind, left] of this.status) h.str(kind).num(left);
    for (const tag of this.hitBy) h.str(tag);
    for (const slot of Object.keys(this.skillLevels))
      h.num(Number(slot)).num(this.skillLevels[Number(slot)]);
    for (const b of BUTTONS) h.bool(this.prev[b]);
    h.num(this.queued ?? -1);
    for (const k of this.buffer) h.str(k.key).num(k.t);
    h.num(this.lastTap?.dir ?? 0).num(this.lastTap?.t ?? -1);
    h.bool(this.altAttack).num(this.jumpDir).bool(this.jumpRun).num(this.t);
  }

  /** The whole state, copied: what hash() reads, plus the sprite data and team to come back to. */
  save(): FighterSnapshot {
    return {
      data: this.data,
      team: this.team,
      x: this.x,
      y: this.y,
      z: this.z,
      vx: this.vx,
      vy: this.vy,
      vz: this.vz,
      facing: this.facing,
      frameId: this.frameId,
      ticksLeft: this.ticksLeft,
      hp: this.hp,
      mp: this.mp,
      sp: this.sp,
      hitStop: this.hitStop,
      attackSerial: this.attackSerial,
      hitBy: [...this.hitBy],
      fallAcc: this.fallAcc,
      dizzyAcc: this.dizzyAcc,
      infiniteMp: this.infiniteMp,
      effect: this.effect,
      dead: this.dead,
      knockedOut: this.knockedOut,
      level: this.level,
      reward: this.reward,
      rewardScale: this.rewardScale,
      hpMax: this.hpMax,
      mpMax: this.mpMax,
      spMax: this.spMax,
      power: this.power,
      guard: this.guard,
      holding: this.holding?.id ?? 0,
      heldBy: this.heldBy?.id ?? 0,
      thrownBy: this.thrownBy?.id ?? 0,
      itemState: this.itemState,
      angle: this.angle,
      hidden: this.hidden,
      heldAid: this.heldAid,
      showBars: this.showBars,
      pendingLevelUp: this.pendingLevelUp,
      status: [...this.status],
      skillLevels: { ...this.skillLevels },
      moveBonus: this.moveBonus,
      prev: { ...this.prev },
      queued: this.queued,
      buffer: this.buffer.map((k) => ({ ...k })),
      lastTap: this.lastTap ? { ...this.lastTap } : null,
      altAttack: this.altAttack,
      jumpDir: this.jumpDir,
      jumpRun: this.jumpRun,
      t: this.t,
    };
  }

  /** Become `s` again; `byId` resolves the fighters it refers to (the one held, the holder …). */
  load(s: FighterSnapshot, byId: ReadonlyMap<number, Fighter>) {
    this.data = s.data;
    this.team = s.team;
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.vx = s.vx;
    this.vy = s.vy;
    this.vz = s.vz;
    this.facing = s.facing;
    this.frameId = s.frameId;
    this.frame = this.frameAt(s.frameId) ?? this.frame;
    this.ticksLeft = s.ticksLeft;
    this.hp = s.hp;
    this.mp = s.mp;
    this.sp = s.sp;
    this.hitStop = s.hitStop;
    this.attackSerial = s.attackSerial;
    this.hitBy.clear();
    for (const tag of s.hitBy) this.hitBy.add(tag);
    this.fallAcc = s.fallAcc;
    this.dizzyAcc = s.dizzyAcc;
    this.infiniteMp = s.infiniteMp;
    this.effect = s.effect;
    this.dead = s.dead;
    this.knockedOut = s.knockedOut;
    this.level = s.level;
    this.reward = s.reward;
    this.rewardScale = s.rewardScale;
    this.hpMax = s.hpMax;
    this.mpMax = s.mpMax;
    this.spMax = s.spMax;
    this.power = s.power;
    this.guard = s.guard;
    this.holding = byId.get(s.holding) ?? null;
    this.heldBy = byId.get(s.heldBy) ?? null;
    this.thrownBy = byId.get(s.thrownBy) ?? null;
    this.itemState = s.itemState;
    this.angle = s.angle;
    this.hidden = s.hidden;
    this.heldAid = s.heldAid;
    this.showBars = s.showBars;
    this.pendingLevelUp = s.pendingLevelUp;
    this.status.clear();
    for (const [kind, left] of s.status) this.status.set(kind, left);
    this.skillLevels = { ...s.skillLevels };
    this.moveBonus = s.moveBonus;
    this.prev = { ...s.prev };
    this.queued = s.queued;
    this.buffer = s.buffer.map((k) => ({ ...k }));
    this.lastTap = s.lastTap ? { ...s.lastTap } : null;
    this.altAttack = s.altAttack;
    this.jumpDir = s.jumpDir;
    this.jumpRun = s.jumpRun;
    this.t = s.t;
  }
}
