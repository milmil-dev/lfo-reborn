/*
  摩摩星朋友 (legacy/content/docs/system/momo.mdx): a 摩摩星 follows the player into every fight
  and fights with its backpack (背包武器) — 「在行動計未儲滿，摩摩星朋友是不能再作攻擊」: an action
  meter fills, then it acts — and leaves the field when its HP runs out.

  It is a paper doll (pipeline/momo.ts): the base creature (sprite 3500) draws five parts — body,
  head, face, skin, backpack — whose ids are its outfit. Each backpack carries the client's part
  info (mpi): its reach (ActRangeX / Z), what it targets (TarType enemy / leader) and how
  (ActType attack / support). The client's MoMoStarFollow / MoMoStarAttack logic was driven by
  the server (PACKET_UPDATE_MMSDATA), so the brain below is the remake's: it keeps near its
  leader, walks up to the nearest enemy in reach when its meter is full and plays the backpack's
  attack — its own G_### where the part's art names one, else the boxing set for its level.
*/
import type { Fighter } from "./core/fighter";
import { EMPTY_INPUT, type InputState } from "./core/types";
import { nearestFoe } from "./ai";
import { ASSETS } from "@/lib/assets";

export type MomoOutfit = {
  body: number;
  head: number;
  face: number;
  skin: number;
  backpack: number;
};
export const DEFAULT_OUTFIT: MomoOutfit = {
  body: 10001,
  head: 20001,
  face: 30000,
  skin: 50000,
  backpack: 40004,
};

/** The sprite path render.loadSprite builds a 摩摩星 in this outfit from. */
export const momoPath = (o: MomoOutfit) =>
  `momo:${[o.body, o.head, o.face, o.skin, o.backpack].join(",")}`;

export type MomoPart = {
  id: number;
  slot: "body" | "head" | "face" | "skin" | "backpack";
  name: string;
  mpi: Record<string, string>;
  /** a backpack's own attack action on the base creature (G_###) */
  attack?: string;
};

let partsReq: Promise<MomoPart[]> | null = null;
/** Every 摩摩星 part (pipeline/momo.ts's momo.json); none when the data has no 摩摩星. */
export function loadMomoParts() {
  partsReq ??= fetch(`${ASSETS}/game/momo.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ parts: MomoPart[] }>) : { parts: [] }))
    .then((j) => j.parts)
    .catch(() => []);
  return partsReq;
}

/** What a backpack does: its attack action, reach and target. */
export function backpackAct(part: MomoPart | undefined, level = 1) {
  const support = part?.mpi.TarType === "leader";
  return {
    action:
      part?.attack ?? (support ? "consumer_good" : `boxing_lv${Math.min(5, Math.max(1, level))}`),
    reachX: Number(part?.mpi.ActRangeX ?? 50) || 50,
    reachZ: Number(part?.mpi.ActRangeZ ?? 10) || 10,
    support,
  };
}

/**
 * How hard it hits, by its level (1–10): the client's damage came from the server (DisMod /
 * StrMod), so the remake's — an LV1 摩摩星 helps, an LV10 one carries its weight.
 */
export const momoPower = (level: number) => 0.3 + 0.07 * (Math.min(10, Math.max(1, level)) - 1);

/** ticks for the action meter to fill (the client's ActTime was server data; the remake's) */
export const ACT_TICKS = 75;
/** how far the 摩摩星 lets its leader get before it follows, and when it gives up and blinks over */
const FOLLOW = 90;
const CATCH_UP = 520;
/** how far it looks for an enemy */
const SIGHT = 360;

export type MomoBrain = { meter: number };
export const newMomoBrain = (): MomoBrain => ({ meter: 0 });

/**
 * One tick of the 摩摩星: buttons to walk with, or the action to play now (an attack or a
 * support act, when the meter is full and the target in reach).
 */
export function thinkMomo(
  f: Fighter,
  leader: Fighter | null,
  fighters: Fighter[],
  b: MomoBrain,
  act: ReturnType<typeof backpackAct>,
): { input: InputState; play?: string } {
  const input = { ...EMPTY_INPUT };
  if (f.hp <= 0 || !leader) return { input };
  const idle = f.anim === "STAND" || f.anim === "WALK";
  if (b.meter < ACT_TICKS) b.meter++;

  // too far behind (a door, a warp): blink back to the leader's side
  if (Math.abs(leader.x - f.x) > CATCH_UP) {
    f.x = leader.x - leader.facing * 60;
    f.z = leader.z;
  }

  const target = act.support ? leader : nearestFoe(f, fighters);
  const near = target && Math.abs(target.x - f.x) < SIGHT && Math.abs(target.z - f.z) < SIGHT / 2;
  if (b.meter >= ACT_TICKS && near && idle) {
    const dx = target.x - f.x;
    const dz = target.z - f.z;
    const inReach =
      act.support || (Math.abs(dx) <= act.reachX + 30 && Math.abs(dz) <= act.reachZ + 10);
    if (inReach) {
      f.facing = dx >= 0 ? 1 : -1;
      b.meter = 0;
      return { input, play: act.action };
    }
    // walk up to it
    input.right = dx > 0;
    input.left = dx < 0;
    input.down = dz > 4;
    input.up = dz < -4;
    return { input };
  }

  // keep near the leader, a little behind
  const dx = leader.x - leader.facing * 50 - f.x;
  const dz = leader.z - f.z;
  if (Math.abs(dx) > FOLLOW || Math.abs(dz) > FOLLOW / 2) {
    input.right = dx > 10;
    input.left = dx < -10;
    input.down = dz > 8;
    input.up = dz < -8;
  }
  return { input };
}
