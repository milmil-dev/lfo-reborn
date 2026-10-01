import { Fighter, type FighterEvent, type Stage } from "./fighter";
import { Hasher } from "./hash";
import { DURATION, HOLDS, inflict } from "./status";

/** 咀咒藥水 / 毒性藥水 / 解毒藥水 */
const CURSE = 506;
const TOXIN = 507;
const ANTIDOTE = 508;
import type { Bla, Box, CharData, InputState } from "./types";
import {
  afterItemHit,
  itemArmed,
  knockable,
  knockItem,
  ownerOf,
  syncHeld,
  wearShield,
  teamOf,
  tryPickups,
} from "./items";
import { EMPTY_INPUT } from "./types";

const DEPTH = 18; // how far apart on the floor two fighters can be and still connect
const HIT_STOP = 3;
const FALL_THRESHOLD = 60; // accumulated `fall` that knocks a fighter down

/** World-space rectangle of a canvas-space box on a fighter's current frame. */
export function worldBox(f: Fighter, [bx, by, bw, bh]: Box) {
  const { cx, cy } = f.frame;
  const x = f.facing > 0 ? f.x - cx + bx : f.x + cx - bx - bw;
  const y = f.z + f.y - cy + by; // screen-space vertical: floor depth plus height
  return { x, y, w: bw, h: bh };
}

const overlap = (a: ReturnType<typeof worldBox>, b: ReturnType<typeof worldBox>) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class World {
  readonly fighters: Fighter[] = [];
  tick = 0;
  private nextId = 1;

  /**
   * One sip of a potion / drink (every tick of DRINK). The game layer can replace this with the
   * item's own effect from the item table; by default a sip restores 6 HP and 3 MP. The three odd
   * bottles do what the item pages say: 咀咒藥水 confuses the drinker, 毒性藥水 poisons them,
   * 解毒藥水 cures poison.
   */
  onUse: (holder: Fighter, item: Fighter) => void = (h, item) => {
    const id = item.data.attrs.id;
    if (id === CURSE) h.status.set("confuse", DURATION.confuse);
    else if (id === TOXIN) h.status.set("poison", DURATION.poison);
    else if (id === ANTIDOTE) h.status.delete("poison");
    else {
      h.hp = Math.min(h.maxHp, h.hp + 6);
      h.mp = Math.min(h.maxMp, h.mp + 3);
    }
  };

  constructor(readonly stage: Stage) {}

  spawn(data: CharData, team: number, x: number, z: number, facing: 1 | -1 = 1) {
    const f = new Fighter(this.nextId++, data, team);
    f.x = x;
    f.z = z;
    f.facing = facing;
    this.fighters.push(f);
    return f;
  }

  remove(f: Fighter) {
    const i = this.fighters.indexOf(f);
    if (i >= 0) this.fighters.splice(i, 1);
  }

  /** Advance one fixed tick. Inputs are keyed by fighter id; missing ids stand still. */
  step(inputs: Map<number, InputState>): FighterEvent[] {
    this.tick++;
    const events: FighterEvent[] = [];
    const all = new Map(inputs);
    tryPickups(this.fighters, all, events);
    for (const f of this.fighters) f.step(all.get(f.id) ?? EMPTY_INPUT, this.stage, events);
    syncHeld(this.fighters, events, this.onUse);
    this.resolveHits(events);
    // whoever ran out of HP this tick goes down, however it happened
    for (const f of this.fighters) f.knockOut();
    return events;
  }

  /**
   * A digest of the whole state (core/hash.ts): peers that ran the same inputs must agree on
   * it after every tick, so comparing digests catches a desync. `onUse` is code, not state —
   * peers have to install the same one.
   */
  hash(): number {
    const h = new Hasher();
    const { minX, maxX, minZ, maxZ } = this.stage;
    h.num(minX).num(maxX).num(minZ).num(maxZ);
    h.num(this.tick).num(this.nextId).num(this.fighters.length);
    for (const f of this.fighters) f.hash(h);
    return h.value;
  }

  /**
   * Places an object spawned by `owner`'s current frame: the spawn point is in the owner's
   * canvas space, and the object's own anchor lands on it.
   */
  spawnEffect(owner: Fighter, bla: Bla, data: CharData) {
    const { cx, cy } = owner.frame;
    const facing = (bla.facing ? -owner.facing : owner.facing) as 1 | -1;
    // a held item's spawn (a bow's arrow) fights for whoever holds it
    const by = owner.heldBy ?? owner;
    const f = this.spawn(
      data,
      by.team,
      owner.x + owner.facing * (bla.x - cx),
      owner.z + bla.z,
      facing,
    );
    f.effect = true;
    f.power = by.power;
    f.moveBonus = by.moveBonus;
    f.y = owner.y + bla.y - cy;
    f.goto(bla.aid);
    // launch velocity from the bla row (frames with their own dvx / dvy override it later)
    if (bla.mx) f.vx = bla.mx * owner.facing;
    if (bla.my) f.vy = bla.my;
    if (bla.mz) f.vz = bla.mz;
    return f;
  }

  private resolveHits(events: FighterEvent[]) {
    for (const a of this.fighters) {
      const atks = a.frame.atk;
      if (!atks || a.hitStop) continue;
      // items only hurt while swung or flying (a weapon on the floor has pick-up boxes)
      if (a.isItem && !itemArmed(a)) continue;
      const team = teamOf(a);
      const owner = ownerOf(a);
      for (const b of this.fighters) {
        // loose items on the floor or in the air have body boxes (ITEMGROUND / ITEMSKY): any
        // fighter's attack knocks them away
        if (b.isItem) {
          if (b === a || team === 0 || a.isItem || !knockable(b) || !b.frame.bdy) continue;
          if (Math.abs(a.z - b.z) > DEPTH) continue;
          const tag = `${a.id}:${a.attackSerial}`;
          if (b.hitBy.has(tag)) continue;
          for (const atk of atks) {
            const hitBox = worldBox(a, atk.box);
            if (!b.frame.bdy.some((bd) => overlap(hitBox, worldBox(b, bd)))) continue;
            b.hitBy.add(tag);
            if (b.hitBy.size > 64) b.hitBy.delete(b.hitBy.values().next().value!);
            knockItem(b, owner, a.facing, atk, events);
            break;
          }
          continue;
        }
        // team 0 is neutral (story NPCs, props): it neither hits nor gets hit
        if (
          b === a ||
          b === owner ||
          b.effect ||
          b.team === team ||
          team === 0 ||
          b.team === 0 ||
          !b.frame.bdy ||
          Math.abs(a.z - b.z) > DEPTH
        )
          continue;
        const tag = `${a.id}:${a.attackSerial}`;
        if (b.hitBy.has(tag)) continue;
        for (const atk of atks) {
          const hitBox = worldBox(a, atk.box);
          if (!b.frame.bdy.some((bd) => overlap(hitBox, worldBox(b, bd)))) continue;
          b.hitBy.add(tag);
          if (b.hitBy.size > 64) b.hitBy.delete(b.hitBy.values().next().value!);
          this.applyHit(a, b, atk, hitBox, events);
          if (a.isItem) afterItemHit(a);
          break;
        }
      }
    }
  }

  private applyHit(
    a: Fighter,
    b: Fighter,
    atk: NonNullable<Fighter["frame"]["atk"]>[number],
    box: ReturnType<typeof worldBox>,
    events: FighterEvent[],
  ) {
    const fromBehind = (a.x - b.x) * b.facing < 0;
    const guardUp = b.anim.startsWith("GUARD") && !fromBehind;
    // a raised shield (SHIELDUSE) stops a frontal hit outright; the shield takes it instead
    const shield = b.holding?.itemType === 600 ? b.holding : null;
    if (shield && b.anim === "SHIELDUSE" && !fromBehind) {
      ownerOf(a).hitStop = b.hitStop = HIT_STOP;
      b.vx = a.facing * 2;
      const dmg = atk.hp > 0 ? Math.max(1, Math.round(atk.hp * a.power * a.moveBonus)) : 0;
      wearShield(shield, dmg);
      events.push({
        type: "hit",
        attacker: ownerOf(a).id,
        target: b.id,
        damage: 0,
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        blocked: true,
      });
      return;
    }
    const x = box.x + box.w / 2;
    const y = box.y + box.h / 2;
    // a weapon's hit freezes the one swinging it
    ownerOf(a).hitStop = b.hitStop = HIT_STOP;

    const dmg =
      atk.hp > 0 ? Math.max(1, Math.round((atk.hp * a.power * a.moveBonus) / b.guard)) : 0;
    // blocking costs 體力: as much SP as the hit would take in HP; without that much the guard
    // breaks and the hit lands in full ("你現時的 SP 不足")
    const guarding = guardUp && b.sp >= dmg;
    if (guardUp && !guarding) b.sp = 0;
    if (guarding && atk.fall < 90) {
      b.sp = Math.max(0, b.sp - dmg);
      const chip = Math.round(dmg * 0.1);
      b.hp = Math.max(0, b.hp - chip);
      b.vx = a.facing * Math.max(2, Math.abs(atk.dx) * 0.5);
      events.push({
        type: "hit",
        attacker: ownerOf(a).id,
        target: b.id,
        damage: chip,
        x,
        y,
        blocked: true,
      });
      return;
    }

    b.hp = Math.max(0, b.hp - dmg);
    b.fallAcc += atk.fall || 20;
    b.dizzyAcc += atk.dizzy;
    b.vx = a.facing * (atk.dx || 2);
    if (atk.dz) b.vz = atk.dz;
    const knockDown = b.hp === 0 || b.airborne || atk.dy < 0 || b.fallAcc >= FALL_THRESHOLD;
    if (!fromBehind) b.facing = a.facing > 0 ? -1 : 1;

    if (knockDown) {
      b.vy = atk.dy < 0 ? atk.dy : -8;
      b.y = Math.min(b.y, -1);
      b.goto(b.action(fromBehind ? "B_FALL1A" : "FALL1A"));
    } else if (b.dizzyAcc >= 100) {
      b.dizzyAcc = 0;
      b.goto(b.action("DIZZY"));
    } else {
      const which = b.anim === "HIT1" || b.anim === "B_HIT1" ? 2 : 1;
      b.goto(b.action(`${fromBehind ? "B_" : ""}HIT${which}`));
    }
    events.push({
      type: "hit",
      attacker: ownerOf(a).id,
      target: b.id,
      damage: dmg,
      x,
      y,
      blocked: false,
    });
    // elements (core/status.ts): a hit on someone in ice or stone breaks them out
    const held = [...b.status.keys()].filter((k) => HOLDS.has(k));
    const added = inflict(b, atk.effect);
    for (const kind of held)
      if (!b.status.has(kind)) events.push({ type: "status", fighter: b.id, kind, on: false });
    for (const kind of added) events.push({ type: "status", fighter: b.id, kind, on: true });
  }
}
