/** What linesFor needs of a catalog entry (game/stories/catalog.json, pipeline/catalog.ts). */
type Line = { stage: string; mode: string; players: number[] };

/**
 * The lines a character can play, one per stage, as the client's LOADSTORYLIST picks them: the
 * file listed for that character, else the one listed for anyone (charId 0). A stage that lists
 * neither (埃及 is only Davis's, Woody's and Jessie's) is left out. A 異轉 form (7xxx) plays the
 * lines of the character it came from.
 */
export function linesFor<E extends Line>(catalog: E[], charId: number) {
  const base = charId >= 7000 && charId < 8000 ? charId - 7000 : charId;
  const own = new Map<string, E>();
  const anyone = new Map<string, E>();
  for (const e of catalog) {
    const k = `${e.mode}:${e.stage}`;
    if ((e.players.includes(charId) || e.players.includes(base)) && !own.has(k)) own.set(k, e);
    if (e.players.includes(0) && !anyone.has(k)) anyone.set(k, e);
  }
  const chosen = new Set(
    [...new Set([...anyone.keys(), ...own.keys()])].map((k) => own.get(k) ?? anyone.get(k)),
  );
  return catalog.filter((e) => chosen.has(e));
}
