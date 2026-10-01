/*
  異轉 (system/tran.mdx). A character at LV 150 whose account holds its 異轉信物 gets the
  異轉能量計 in the status box: hits on enemies fill it, and a full gauge turns the character into
  its transformed form (base id + 7000: 星奇 → 新生星奇), which plays its TRANSFORM burst and
  fights with its own moves. The gauge then drains; the form ends when it runs dry, when the
  character dies, or when the player cancels it once part of it is spent.

  The client's fill and drain rates lived on the server: here about 1500 damage fills the gauge
  and a full gauge lasts 45 seconds.
*/

export const GAUGE_MAX = 100;
export const TRAN_LEVEL = 150;
const FILL_PER_DAMAGE = GAUGE_MAX / 1500;
const DRAIN_PER_TICK = GAUGE_MAX / (45 * 30);
/** the gauge must have spent this much before the form can be cancelled */
const CANCEL_BELOW = GAUGE_MAX * 0.7;

export type Tran = { gauge: number; active: boolean };
export const NO_TRAN: Tran = { gauge: 0, active: false };

/** Whether a character may transform: the level and the account's 信物. */
export const unlocked = (lv: number, hasToken: boolean) => lv >= TRAN_LEVEL && hasToken;

/** The transformed form of a character id, if the client has one. */
export const formId = (id: number) => (id >= 7000 ? null : id + 7000);

/** Damage dealt fills the gauge (not while transformed). */
export function charge(t: Tran, damage: number): Tran {
  if (t.active || damage <= 0) return t;
  return { ...t, gauge: Math.min(GAUGE_MAX, t.gauge + damage * FILL_PER_DAMAGE) };
}

/** One tick: a transformed character's gauge drains; empty ends the form. */
export function drain(t: Tran): Tran {
  if (!t.active) return t;
  const gauge = t.gauge - DRAIN_PER_TICK;
  return gauge > 0 ? { ...t, gauge } : { gauge: 0, active: false };
}

export const ready = (t: Tran) => !t.active && t.gauge >= GAUGE_MAX;
export const cancellable = (t: Tran) => t.active && t.gauge <= CANCEL_BELOW;

/** Press the gauge: transform when full, cancel when spent enough; otherwise nothing. */
export function press(t: Tran): Tran {
  if (ready(t)) return { ...t, active: true };
  if (cancellable(t)) return { gauge: 0, active: false };
  return t;
}
