/*
  兇獸突襲 (system/monster.mdx): seven beasts roam the story and mission stages. One may break
  into a run, announced by the client's own line (system.tzw 1500–1502 「謎之敵人在「…」出現了！」);
  whoever brings it down takes its 魔精石 (bestialStone1–7, 5136–5142) — the stone the 神秘人 sets
  into the 魔劍 (smith.ts) — and the room hears 「…被…擊倒了！」 (1503–1504).

  The client decided raids on the server; the remake's reading: one run in eight meets a beast,
  which comes in when the player reaches the run's second room, a little above the player's level.
*/

export type Beast = { sprite: number; stone: number; name: string };

export const RAID_CHANCE = 0.12;

/** Whether this run meets a beast, and which one. */
export function rollRaid(beasts: Beast[], rand = Math.random): Beast | null {
  if (!beasts.length || rand() >= RAID_CHANCE) return null;
  return beasts[Math.floor(rand() * beasts.length)];
}

export const beastLevel = (playerLv: number) => Math.max(20, playerLv + 5);

export const raidLine = (stage: string) => `謎之敵人在「${stage}」出現了！`;
export const downLine = (beast: string, by: string) => `${beast}被${by}擊倒了！`;
