/*
  The account side of the original client, kept in this browser: the chosen server, the
  account's characters (as many as it likes, as in the newer client) and which one is playing, each server's bank, and the
  account's 異轉信物.

  One Zustand store persisted under `lfo-reborn.save` is the single source of truth. React screens read
  it through the hooks at the bottom (and re-render when anything changes it); the game loops and
  pure helpers use the plain getters and setters, which read and write the same store.
  Storage can be blocked: the store then lives for the session only.
*/
import { freePoints, RESET_LEVEL, resetFee } from "./leveling";
import { KEY, moveKey } from "@/lib/storage-keys";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { emptyInventory, type Inventory, type Owned } from "./inventory";
import { gainExp, levelCap } from "./leveling";
import { TRAN_LEVEL } from "./transform";

export type Profile = {
  key: string; // sprite key, e.g. "stinky"
  charId: number;
  name: string; // the name typed on 選擇角色 (or the character's own)
  created: number;
  lv: number;
  exp: number;
  money: number;
  honor: number;
  /** 背包 and 裝備 (older saves have none yet) */
  inv?: Inventory;
  /** 招式等級: experience of each special, by skill slot (core/skills.ts) */
  skills?: Record<number, number>;
  /** 能力點 put into each stat (leveling.ts) */
  points?: Partial<Record<"hp" | "mp" | "sp" | "str" | "def" | "agi", number>>;
};
/**
 * The account's characters. The newer client lets an account keep as many as it likes, so this
 * is an open list: a deleted one leaves its place empty (indices — and the active one — stay put)
 * and empty places at the end are dropped.
 */
export type Slots = (Profile | null)[];

type Save = {
  slots: Slots;
  server: string | null;
  active: number | null;
  /** 銀行: one per server, shared by the profiles on it */
  banks: Record<string, Owned[]>;
  /** 異轉信物 by base character id: the whole account's */
  tokens: number[];
  /** 人物卡: characters the account owns beyond the 22 of the create screen, by sprite key */
  chars: string[];
  /**
   * 自由模式 (the profile screen's switch): new characters start at LV 150, every character
   * counts as holding its 異轉信物 (so 異轉 and the LV 300 cap are open) and every character is
   * open to create
   */
  freeplay?: boolean;
};

/* ───────── the saves written before the store (one localStorage key each) ───────── */

function legacy<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function legacySave(): Save {
  const s = legacy<(Profile | null)[]>("lfo.profiles", []);
  const banks: Record<string, Owned[]> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("lfo.bank.")) banks[k.slice("lfo.bank.".length)] = legacy(k, []);
    }
  } catch {
    // blocked storage: no old banks
  }
  return {
    slots: s,
    server: legacy<string | null>("lfo.server", null),
    active: legacy<number | null>("lfo.activeSlot", null),
    banks,
    tokens: legacy<number[]>("lfo.tokens", []),
    chars: [],
  };
}

/* ───────── the store ───────── */

// a save from before the rename moves to the new key; the older per-item keys seed the first
// state when there is no save at all
moveKey(() => localStorage, "lfo.save", KEY.save);
export const useSave = create<Save>()(
  persist(() => legacySave(), {
    name: KEY.save,
    version: 1,
    storage: createJSONStorage(() => localStorage),
  }),
);
const get = () => useSave.getState();
const set = (patch: Partial<Save> | ((s: Save) => Partial<Save>)) => useSave.setState(patch);

/* ───────── plain getters / setters (game loops, pure code) ───────── */

export const getSlots = (): Slots => get().slots;

export function saveSlot(i: number, p: Profile | null) {
  set((s) => {
    const slots: Slots = [...s.slots];
    while (slots.length <= i) slots.push(null);
    slots[i] = p;
    while (slots.length && slots.at(-1) === null) slots.pop();
    // the active character deleted: nobody is playing
    const active = s.active !== null && !slots[s.active] ? null : s.active;
    return { slots, active };
  });
}

/** Where a new character goes: the first empty place, else a new one at the end. */
export function freeSlot(slots: Slots = getSlots()) {
  const i = slots.indexOf(null);
  return i === -1 ? slots.length : i;
}

export const newProfile = (key: string, charId: number, name: string): Profile => ({
  key,
  charId,
  name,
  created: Date.now(),
  lv: get().freeplay ? TRAN_LEVEL : 1,
  exp: 0,
  money: 1000,
  honor: 0,
});

export const getServer = () => get().server;
export const setServer = (id: string) => set({ server: id });

export const getActiveSlot = () => get().active;
export const setActiveSlot = (i: number) => set({ active: i });

export function getActiveProfile(): Profile | null {
  const { active, slots } = get();
  return active === null ? null : slots[active];
}

/** Change the active profile (money after a purchase …) and save it. */
export function updateActiveProfile(fn: (p: Profile) => Profile): Profile | null {
  const i = getActiveSlot();
  const p = getActiveProfile();
  if (i === null || !p) return null;
  const next = fn(p);
  saveSlot(i, next);
  return next;
}

type StatKey = keyof NonNullable<Profile["points"]>;

/** Put one free 能力點 into `stat`; false when none is left. */
export function allocatePoint(stat: StatKey): boolean {
  const p = getActiveProfile();
  if (!p || freePoints(p.lv, p.points) <= 0) return false;
  updateActiveProfile((q) => ({
    ...q,
    points: { ...q.points, [stat]: (q.points?.[stat] ?? 0) + 1 },
  }));
  return true;
}

/** 能力重設: every point back, for a fee; what the reset NPC says. */
export function resetPoints(): { ok: boolean; line: string } {
  const p = getActiveProfile();
  if (!p) return { ok: false, line: "" };
  const spent = Object.values(p.points ?? {}).some((v) => (v ?? 0) > 0);
  if (!spent) return { ok: false, line: "你沒需要重設基本能力。" };
  if (p.lv < RESET_LEVEL)
    return { ok: false, line: `你必需到達等級${RESET_LEVEL}或以上，才能重設能力` };
  const fee = resetFee(p.lv);
  if (p.money < fee) return { ok: false, line: `重設基本能力需要＄${fee.toLocaleString()}` };
  updateActiveProfile((q) => ({ ...q, money: q.money - fee, points: {} }));
  return { ok: true, line: "基本能力重設成功！" };
}

/** Credit EXP to the active profile; returns the updated profile and the levels gained. */
export function awardExp(amount: number): { profile: Profile; gained: number } | null {
  let gained = 0;
  const profile = updateActiveProfile((p) => {
    const r = gainExp(p.lv, p.exp, amount, levelCap(hasToken(p.charId)));
    gained = r.gained;
    return { ...p, lv: r.level, exp: r.exp };
  });
  return profile ? { profile, gained } : null;
}

/** The active profile's inventory, and a way to save a changed one. */
export const getInventory = (): Inventory => getActiveProfile()?.inv ?? EMPTY_INV;
export function saveInventory(inv: Inventory) {
  updateActiveProfile((p) => ({ ...p, inv }));
}

/** 招式等級: one more use of the active profile's special in `slot`. */
export function addSkillExp(slot: number, points = 1) {
  updateActiveProfile((p) => ({
    ...p,
    skills: { ...p.skills, [slot]: (p.skills?.[slot] ?? 0) + points },
  }));
}
export const getSkillExp = (slot: number) => getActiveProfile()?.skills?.[slot] ?? 0;

/** 銀行: one per server, shared by the three profiles on it. */
const bankOf = (s: Save) => s.banks[s.server ?? "local"] ?? NO_ITEMS;
export const getBank = () => bankOf(get());
export const saveBank = (bank: Owned[]) =>
  set((s) => ({ banks: { ...s.banks, [s.server ?? "local"]: bank } }));

/** 人物卡: characters the account owns (taken out of the 儲物室 into a profile slot). */
export const getOwnedChars = () => get().chars ?? [];
export const grantChar = (key: string) =>
  set((s) => ({ chars: (s.chars ?? []).includes(key) ? s.chars : [...(s.chars ?? []), key] }));

/** 異轉信物: held by the account (every profile on every server), by base character id. */
export const getTokens = () => get().tokens;
export const hasToken = (charId: number) => !!get().freeplay || get().tokens.includes(charId);

/** 自由模式: see Save.freeplay. */
export const getFreeplay = () => !!get().freeplay;
export const setFreeplay = (on: boolean) => set({ freeplay: on });
export const grantToken = (charId: number) =>
  set((s) => ({ tokens: s.tokens.includes(charId) ? s.tokens : [...s.tokens, charId] }));

// stable empties, so selectors on a fresh save don't hand React a new object every render
const EMPTY_INV = emptyInventory();
const NO_ITEMS: Owned[] = [];

/* ───────── hooks (React screens re-render when the save changes) ───────── */

export const useSlots = () => useSave((s) => s.slots);
export const useActiveProfile = () =>
  useSave((s) => (s.active === null ? null : s.slots[s.active]));
export const useInventory = () =>
  useSave((s) => (s.active === null ? null : s.slots[s.active])?.inv ?? EMPTY_INV);
export const useMoney = () =>
  useSave((s) => (s.active === null ? 0 : (s.slots[s.active]?.money ?? 0)));
export const useBank = () => useSave(bankOf);
export const useTokens = () => useSave((s) => s.tokens);
export const useFreeplay = () => useSave((s) => !!s.freeplay);
const NO_CHARS: string[] = [];
export const useOwnedChars = () => useSave((s) => s.chars ?? NO_CHARS);
const NO_SKILLS: Record<number, number> = {};
export const useSkillExp = () =>
  useSave((s) => (s.active === null ? null : s.slots[s.active])?.skills ?? NO_SKILLS);
