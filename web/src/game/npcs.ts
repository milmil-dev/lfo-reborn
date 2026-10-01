/*
  The street's NPCs (lobby object layers) that answer 攻 / J when the player walks up to them:
  - 死亡之塔 guards: 撒龍巴司 (npc_tower1_zaba) for 人類之塔, the scythe-bearer (npc_deadtower02)
    for 魔族之塔, the 摩摩星 elder (tower3_npc) for 聖賢之塔. The 魔 and 聖 towers kept opening
    hours online (20:00–22:00, 16:00–21:00); offline they are only shown, not enforced.
  - the status-reset NPC (resetstatus): gives every 能力點 back for a fee from LV 10
    (profiles.resetPoints, with the client's lines, system.tzw 1796 – 1802).
*/
import type { Room } from "./story/types";

export type Npc =
  | { kind: "tower"; stage: string; name: string; hours?: string }
  | { kind: "reset"; name: string };

const NPCS: [RegExp, Npc][] = [
  [/npc_tower1_zaba/i, { kind: "tower", stage: "tower01", name: "撒龍巴司" }],
  [
    /npc_deadtower02/i,
    { kind: "tower", stage: "tower02", name: "手執鐮刀的神秘人", hours: "20:00–22:00" },
  ],
  [/tower3_npc/i, { kind: "tower", stage: "tower03", name: "摩摩星村長", hours: "16:00–21:00" }],
  [/resetstatus/i, { kind: "reset", name: "能力重設員" }],
];

/** How close (in the room's own x) the player must stand to talk. */
export const TALK_RANGE = 150;

/** The NPC within talking range of x in this room, nearest first. */
export function npcNear(room: Room | undefined, x: number): Npc | null {
  if (!room) return null;
  let best: { npc: Npc; d: number } | null = null;
  for (const l of room.layers)
    for (const [re, npc] of NPCS) {
      if (!re.test(l.img)) continue;
      const d = Math.abs(l.x - x);
      if (d <= TALK_RANGE && (!best || d < best.d)) best = { npc, d };
    }
  return best?.npc ?? null;
}
