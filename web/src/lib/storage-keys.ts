/*
  Every key the game keeps in the browser, under the project's name. Saves written before the
  rename (lfo.save, lfo.bindings …) are carried over by moveKey the first time the new key is
  missing; the old key is left in place so an older build still finds its data.
*/
export const KEY = {
  /** the save store: profiles, server, banks, 異轉信物 (game/profiles.ts) */
  save: "lfo-reborn.save",
  /** keyboard / gamepad bindings (game/input.ts) */
  bindings: "lfo-reborn.bindings",
  /** the 王者爭霸 in progress, for the browser session (game/champion-store.ts) */
  cup: "lfo-reborn.cup",
  /** dev: every run meets the first 兇獸 (sessionStorage "1") */
  forceRaid: "lfo-reborn.forceRaid",
} as const;

/** Copy what an older build saved under `from` to `to`, unless `to` already holds something. */
export function moveKey(storage: () => Storage, from: string, to: string) {
  try {
    const s = storage();
    if (s.getItem(to) !== null) return;
    const old = s.getItem(from);
    if (old !== null) s.setItem(to, old);
  } catch {
    // blocked storage: nothing to carry over
  }
}
