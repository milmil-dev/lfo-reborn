/*
  Elements. Every hit box carries an `effect` bit mask (the .spt itr row); the attacks that set
  each bit name the element plainly — ICEBALL / SNOW / ICECOL 4, FLAME / FIREBALL / Phoenix 8,
  lightning and blasts 16, Lizard_posion 1024, ROCKTIFY 4096 … — and the client's shared effect
  sheet (chars/effect) carries the overlays drawn on whoever is caught: FIRE, ICE / BIGICE,
  THUNDER, ROCK / BIGROCK, with effect_poison / _confusion / _stone icons in the status box.
  (The .spt `ele` resistance row is 30 across every sprite of the client, so nobody resists more
  than anybody else.)

  How long each lasts and how much it burns lived on the server; the remake's reading:
    burn     1.5 s, a little HP every third of a second
    freeze   2.5 s held in ice; another hit shatters it
    shock    a 0.6 s jolt (the hit itself does the damage)
    poison   10 s, slow HP loss that never kills; 解毒藥水 cures it
    confuse  6 s with left and right swapped
    stone    4 s turned to stone; another hit breaks it
*/

export type StatusKind = "burn" | "freeze" | "shock" | "poison" | "confuse" | "stone";

export const ELEMENTS: [bit: number, kind: StatusKind][] = [
  [8, "burn"],
  [4, "freeze"],
  [16, "shock"],
  [1024, "poison"],
  [2048, "confuse"],
  [4096, "stone"],
];

export const DURATION: Record<StatusKind, number> = {
  burn: 45,
  freeze: 75,
  shock: 18,
  poison: 300,
  confuse: 180,
  stone: 120,
};

/** Statuses that hold the victim still (no input, no frame advance; gravity still pulls). */
export const HOLDS: ReadonlySet<StatusKind> = new Set(["freeze", "stone"]);

type Victim = { hp: number; maxHp: number; status: Map<StatusKind, number> };

/** What a hit's effect bits put on its target (fresh durations; held states break instead). */
export function inflict(v: Victim, bits: number): StatusKind[] {
  // a second hit on someone in ice or stone shatters it rather than holding them longer
  for (const k of HOLDS) if (v.status.has(k)) v.status.delete(k);
  const added: StatusKind[] = [];
  for (const [bit, kind] of ELEMENTS)
    if (bits & bit) {
      v.status.set(kind, DURATION[kind]);
      added.push(kind);
    }
  return added;
}

/** One tick: count every status down and apply what burns. Returns the statuses that ended. */
export function tickStatus(v: Victim): StatusKind[] {
  const ended: StatusKind[] = [];
  for (const [kind, left] of v.status) {
    const t = left - 1;
    if (kind === "burn" && t % 10 === 0)
      v.hp = Math.max(0, v.hp - Math.max(1, Math.round(v.maxHp * 0.01)));
    // poison wears you down but never finishes you
    if (kind === "poison" && t % 30 === 0 && v.hp > 1)
      v.hp = Math.max(1, v.hp - Math.max(1, Math.round(v.maxHp * 0.005)));
    if (t <= 0) {
      v.status.delete(kind);
      ended.push(kind);
    } else v.status.set(kind, t);
  }
  return ended;
}

export const isHeld = (v: { status: Map<StatusKind, number> }) =>
  v.status.has("freeze") || v.status.has("stone");
