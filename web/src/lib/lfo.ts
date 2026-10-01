import type { CSSProperties } from "react";
import type { CharacterRow, Stats } from "./api";

export const STAT_KEYS = [
  "hp",
  "mp",
  "sp",
  "str",
  "def",
  "agi",
] as const satisfies readonly (keyof Stats)[];

/** Upper bound of each stat across the game, for bar scaling. */
export const STAT_CAP: Record<keyof Stats, number> = {
  hp: 5000,
  mp: 5000,
  sp: 5000,
  str: 600,
  def: 600,
  agi: 600,
};

/**
 * Skill inputs from the .spt files: G 防 (defend), A 攻 (attack), J 跳 (jump),
 * F/B forward/back, U/D up/down.
 */
export type KeyCap = { label: string; kind: "action" | "direction" };
const KEYS: Record<string, KeyCap> = {
  G: { label: "防", kind: "action" },
  A: { label: "攻", kind: "action" },
  J: { label: "跳", kind: "action" },
  F: { label: "→", kind: "direction" },
  B: { label: "←", kind: "direction" },
  U: { label: "↑", kind: "direction" },
  D: { label: "↓", kind: "direction" },
};
export const parseKeys = (seq: string): KeyCap[] =>
  seq.split("").map((c) => KEYS[c] ?? { label: c, kind: "action" });

export type CharacterGroup = "hero" | "form" | "other";
export function characterGroup(c: Pick<CharacterRow, "id" | "base_id">): CharacterGroup {
  if (c.base_id !== null) return "form";
  return c.id < 100 ? "hero" : "other";
}

export const pad3 = (n: number) => String(n).padStart(3, "0");
export const fmt = (n: number) => n.toLocaleString("zh-HK");

/** Inline style that feeds the entity colour into the tint utilities. */
export const entity = (color: string | null | undefined) =>
  (color ? { "--entity": color } : {}) as CSSProperties;

/** Stable view-transition names so list art morphs into the detail hero. */
export const vt = (kind: string, id: number) =>
  ({ viewTransitionName: `${kind}-${id}` }) as CSSProperties;
