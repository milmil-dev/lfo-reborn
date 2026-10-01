/*
  Field items, as in the original client (PACKET_PICK* / THROW*): weapons, heavy objects,
  throwables, potions, shields and bows lie on the floor as their own sprites (ITEMGROUND), are
  picked up with 攻, ride on the holder's weapon point, swing with the holder, and fly when thrown.

  Everything an item does comes from the frame data:
    · the holder's frame `wpn` row places it (x, y), layers it (z), turns it (o), picks the item's
      action to show (aid: 0 held, 100 / 110 its attack frames with hit boxes …) and, on a throw
      frame, gives it its velocity (dx, dy, dz);
    · the item's own .spt has ITEMHELD (0), ITEMSKY (50), ITEMGROUND (60), ITEMATTACK1… (100…),
      ITEMTHW (200) with the hit boxes, and its hp as durability.
*/
import type { Fighter, FighterEvent, Stage } from "./fighter";
import type { InputState } from "./types";

export const ITEM_ACT = { held: 0, sky: 50, ground: 60, thrown: 200 } as const;
const REACH_X = 44;
const REACH_Z = 16;
/** durability lost per landed hit (weapons have 500 hp in their .spt: ~10 hits) */
const WEAR = 50;
/** bottle hp drunk per tick of DRINK (a 1500 hp soda lasts two seconds) */
const SIP = 25;

/** Start frame of an item action id, falling back to held. */
export function itemFrame(item: Fighter, aid: number) {
  const id = item.data.acts?.[String(aid)] ?? item.data.acts?.["0"] ?? 0;
  if (item.frameAt(id)) return id;
  // some items number their frames from 1: the first frame of that action name
  const name = { 0: "ITEMHELD", 50: "ITEMSKY", 60: "ITEMGROUND", 200: "ITEMTHROW" }[aid];
  const found = Object.entries(item.data.frames).find(
    ([, f]) => f.n === name || (aid === 200 && f.n === "ITEMTHW"),
  );
  return found ? Number(found[0]) : Number(Object.keys(item.data.frames)[0]);
}
export function setItemAction(item: Fighter, aid: number, events?: FighterEvent[]) {
  item.heldAid = aid;
  item.goto(itemFrame(item, aid), events);
}

/** The team an item fights for: its holder's, or its thrower's while it flies. */
export const teamOf = (f: Fighter) => f.heldBy?.team ?? f.thrownBy?.team ?? f.team;
/** Who gets the credit (and the knock-back direction) for a hit. */
export const ownerOf = (f: Fighter) => f.heldBy ?? f.thrownBy ?? f;

/** Does this item hurt what it touches right now? */
export const itemArmed = (f: Fighter) =>
  (f.itemState === "held" && !f.hidden && f.heldAid !== 0) || f.itemState === "thrown";

/** 攻 on the floor next to an item picks it up (instead of attacking). */
export function tryPickups(
  fighters: Fighter[],
  inputs: Map<number, InputState>,
  events: FighterEvent[],
) {
  for (const f of fighters) {
    if (f.isItem || f.effect || f.team === 0) continue;
    const input = inputs.get(f.id);
    if (!input || !f.fresh(input, "attack") || !f.idle) continue;
    let best: Fighter | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const it of fighters) {
      if (!it.isItem || it.itemState !== "ground" || it.dead) continue;
      // hands full: only a key can still be taken (it goes on the ring)
      if (f.holding && it.itemType !== KEY_TYPE) continue;
      const dx = Math.abs(it.x - f.x);
      const dz = Math.abs(it.z - f.z);
      if (dx > REACH_X || dz > REACH_Z) continue;
      if (dx + dz < bestD) {
        bestD = dx + dz;
        best = it;
      }
    }
    if (!best) continue;
    if (best.itemType === KEY_TYPE) takeKey(f, best, events);
    else pickUp(f, best, events);
    // the press was the pick-up, not a punch
    inputs.set(f.id, { ...input, attack: false });
  }
}

/** item type of the stage keys */
export const KEY_TYPE = 700;

/** A key off the floor: gone from the field, onto the picker's key ring. */
function takeKey(f: Fighter, key: Fighter, events: FighterEvent[]) {
  key.dead = true;
  events.push({ type: "sound", name: "getkey.wav", x: f.x });
  events.push({ type: "key", fighter: f.id, key: key.data.attrs.id });
}

export function pickUp(f: Fighter, item: Fighter, events: FighterEvent[]) {
  f.holding = item;
  item.heldBy = f;
  item.thrownBy = null;
  item.itemState = "held";
  item.power = f.power;
  item.vx = item.vy = item.vz = 0;
  setItemAction(item, ITEM_ACT.held, events);
  events.push({ type: "sound", name: "pick.wav", x: f.x });
  events.push({ type: "pick", fighter: f.id, item: item.id });
  f.vx = f.vz = 0;
  if (item.itemType === 200 && f.data.actions.HEAVYPICKST !== undefined)
    f.goto(f.action("HEAVYPICKST"), events);
}

function release(item: Fighter, state: "sky" | "thrown", vx: number, vy: number, vz: number) {
  const holder = item.heldBy;
  if (holder && holder.holding === item) holder.holding = null;
  item.heldBy = null;
  item.thrownBy = state === "thrown" ? holder : null;
  item.itemState = state;
  item.hidden = false;
  item.angle = 0;
  item.vx = vx;
  item.vy = vy;
  item.vz = vz;
  if (item.y >= 0) item.y = -1;
  setItemAction(item, state === "thrown" ? ITEM_ACT.thrown : ITEM_ACT.sky);
}

/** Let go of what a fighter carries: it drops at its feet (the 丟 key). */
export function dropHeld(f: Fighter) {
  const item = f.holding;
  if (!item) return;
  release(item, "sky", f.facing * 2, -4, 0);
}

const knockedDown = (f: Fighter) => /^(B_)?(FALL|BOUNCE|LIEDOWN)/.test(f.anim);

/**
 * After everyone has stepped: carried items follow their holder's weapon point, fly off on a
 * throw frame, drop when the holder is knocked down, and potions are drunk sip by sip.
 * `use` applies one sip of the item to the holder.
 */
export function syncHeld(
  fighters: Fighter[],
  events: FighterEvent[],
  use: (holder: Fighter, item: Fighter) => void,
) {
  for (const item of fighters) {
    if (!item.isItem || item.itemState !== "held") continue;
    const h = item.heldBy;
    if (!h || h.dead || h.holding !== item || !fighters.includes(h)) {
      release(item, "sky", 0, -3, 0);
      continue;
    }
    if (knockedDown(h) || h.hp <= 0) {
      release(item, "sky", h.vx * 0.5 + h.facing * -2, -6, 0);
      continue;
    }
    // drinking: every tick of DRINK takes a sip; the item's hp is how much is in the bottle
    if (h.anim === "DRINK" && !h.hitStop) {
      item.hp -= SIP;
      use(h, item);
      if (item.hp <= 0) h.goto(h.action("DRINK2STAND"), events);
    }
    if (h.anim === "DRINK2STAND" && item.hp <= 0) {
      h.holding = null;
      item.heldBy = null;
      item.dead = true;
      continue;
    }
    const w = h.frame.wpn;
    // canvas point on the holder's frame -> world, like a spawned effect
    item.x = w ? h.x + h.facing * (w.x - h.frame.cx) : h.x;
    item.y = w ? h.y + (w.y - h.frame.cy) : h.y;
    item.z = h.z + (w && w.z < 0 ? -0.5 : 0.5);
    item.facing = (w?.facing ? -h.facing : h.facing) as 1 | -1;
    item.hidden = !w;
    if (!w) continue;
    item.angle = w.o;
    if (w.dx || w.dy || w.dz) {
      release(item, "thrown", w.dx * h.facing, w.dy, w.dz);
      events.push({ type: "sound", name: "weaponattack.wav", x: h.x });
      continue;
    }
    // each swing starts from aid 0, so a change of aid is a new swing: restart the item's frames
    // (and with them its hit serial, so it can hit the same target again)
    if (w.aid !== item.heldAid) setItemAction(item, w.aid, events);
  }
}

/** Items on their own: falling, flying and lying on the floor. */
export function stepLoose(item: Fighter, stage: Stage, gravity: number, events: FighterEvent[]) {
  if (item.itemState === "held") return;
  if (--item.ticksLeft <= 0) {
    const nx = item.frame.nx;
    if (nx !== -1 && item.frameAt(nx)) item.goto(nx, events);
    else item.ticksLeft = item.frame.d + 1;
  }
  if (item.itemState === "ground") return;
  item.vy += gravity * (item.itemState === "thrown" ? 0.5 : 1);
  item.x += item.vx;
  item.y += item.vy;
  item.z += item.vz;
  if (item.x < stage.minX || item.x > stage.maxX) {
    item.x = Math.min(stage.maxX, Math.max(stage.minX, item.x));
    item.vx = -item.vx * 0.3;
  }
  item.z = Math.min(stage.maxZ, Math.max(stage.minZ, item.z));
  if (item.y < 0) return;
  item.y = 0;
  // a hard landing hops once, then it lies where it fell
  if (item.vy > 8) {
    item.vy = -item.vy * 0.3;
    item.vx *= 0.5;
    item.y = -1;
    item.itemState = "sky";
    item.thrownBy = null;
    setItemAction(item, ITEM_ACT.sky, events);
  } else {
    item.vx = item.vy = item.vz = 0;
    item.itemState = "ground";
    item.thrownBy = null;
    setItemAction(item, ITEM_ACT.ground, events);
  }
  events.push({ type: "land", fighter: item.id });
}

/** Loose items (on the floor or falling) can be hit; carried and flying ones cannot. */
export const knockable = (f: Fighter) => f.itemState === "ground" || f.itemState === "sky";

/**
 * An attack connects with a loose item: it flies off along the blow, as in LF2 / LFO — a hard
 * hit turns it into a projectile of the one who hit it — and wears down like any other hit.
 */
export function knockItem(
  item: Fighter,
  by: Fighter,
  facing: number,
  atk: { hp: number; dx: number; dy: number },
  events: FighterEvent[],
) {
  const vx = (Math.abs(atk.dx) || 5) * facing * 0.9;
  const vy = atk.dy < 0 ? atk.dy : -7;
  const hard = Math.abs(vx) >= 8;
  item.vx = vx;
  item.vy = vy;
  item.vz = 0;
  if (item.y >= 0) item.y = -1;
  item.itemState = hard ? "thrown" : "sky";
  item.thrownBy = hard ? by : null;
  setItemAction(item, hard ? ITEM_ACT.thrown : ITEM_ACT.sky, events);
  item.hp -= Math.max(10, Math.round(atk.hp * 0.2));
  if (item.hp <= 0) item.dead = true;
  events.push({ type: "sound", name: "weaponattack.wav", x: item.x });
}

/** A landed hit wears the item down; a thrown one drops out of the air. */
export function afterItemHit(item: Fighter) {
  item.hp -= WEAR;
  if (item.itemState === "thrown") {
    item.itemState = "sky";
    item.thrownBy = null;
    item.vx *= -0.25;
    item.vy = -4;
    setItemAction(item, ITEM_ACT.sky);
  }
  if (item.hp <= 0) {
    if (item.heldBy?.holding === item) item.heldBy.holding = null;
    item.heldBy = null;
    item.dead = true;
  }
}

/** A shield takes a blocked hit out of its durability; at 0 it breaks and is gone. */
export function wearShield(shield: Fighter, damage: number) {
  shield.hp -= Math.max(1, damage);
  if (shield.hp > 0) return;
  if (shield.heldBy?.holding === shield) shield.heldBy.holding = null;
  shield.heldBy = null;
  shield.dead = true;
}
