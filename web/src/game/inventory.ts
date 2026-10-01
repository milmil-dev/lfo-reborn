/*
  背包 and 裝備, per profile. Layout and slots follow LFO.exe's equipment box (chest/equipbox):
  nine equipment slots, one per item `part` — 0 accessory, 1 head, 2 (unused by any item),
  3 held weapon, 4 body, 5 shield, 6 hands, 7 shoes, 8 ring — and the backpack grid beside them.
  Items are the API's item rows; each owned copy keeps its own durability.
*/
import type { ItemRow, Stats } from "@/lib/api";

export type Owned = { uid: number; id: number; dur: number };
export type Inventory = { bag: Owned[]; equip: (Owned | null)[]; next: number };

export const SLOTS = 9;
/** the client shows 2 × 10 cells and scrolls; this remake allows four screens of them */
export const BAG_SIZE = 80;
/** parts that are worn in a slot (9 materials, 11 魔精石 … only live in the bag) */
export const WEARABLE = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
/** item types that lie in the field as sprites (weapons, potions …) rather than in the bag */
export const FIELD_ITEM_TYPES = new Set([100, 200, 300, 400, 500, 600, 900, 1000]);
/** held in slot 3: things the hands can carry into a stage */
const HELD_TYPES = new Set([100, 300, 400, 900]);

export const emptyInventory = (): Inventory => ({
  bag: [],
  equip: Array.from({ length: SLOTS }, () => null),
  next: 1,
});

export function add(inv: Inventory, item: ItemRow): Inventory | null {
  if (inv.bag.length >= BAG_SIZE) return null;
  const copy = { uid: inv.next, id: item.id, dur: item.durability || 10000 };
  return { ...inv, bag: [...inv.bag, copy], next: inv.next + 1 };
}

const REQ_ORDER = ["hp", "mp", "sp", "str", "def", "agi"] as const;

/**
 * Why an item can't be worn by this character at this level (and these stats), or null if it
 * can. A stat short of the item's requirement answers with the client's own line
 * (system.tzw 1788 – 1793: 你的 STR 不足以裝備這件物品。).
 */
export function cannotWear(
  item: ItemRow,
  lv: number,
  charId: number,
  stats?: Record<(typeof REQ_ORDER)[number], number>,
): string | null {
  if (!WEARABLE.has(item.part)) return "不能裝備";
  if (item.part === 3 && !HELD_TYPES.has(item.type)) return "不能裝備";
  if (item.req_lv > lv) return `需要 LV ${item.req_lv}`;
  if (stats && item.req)
    for (const k of REQ_ORDER)
      if ((item.req[k] ?? 0) > stats[k]) return `你的 ${k.toUpperCase()} 不足以裝備這件物品。`;
  // character-only items list their users (the base id and its transformed forms, e.g. 9 / 7009)
  if (item.users.length && !item.users.some((u) => u === charId || u % 1000 === charId % 1000))
    return "此角色不能使用";
  return null;
}

/** Wear a backpack item; whatever was in its slot goes back into the bag. */
export function wear(inv: Inventory, uid: number, items: Map<number, ItemRow>): Inventory {
  const copy = inv.bag.find((o) => o.uid === uid);
  const item = copy && items.get(copy.id);
  if (!copy || !item) return inv;
  const equip = [...inv.equip];
  const old = equip[item.part];
  equip[item.part] = copy;
  const bag = inv.bag.filter((o) => o.uid !== uid);
  if (old) bag.push(old);
  return { ...inv, bag, equip };
}

export function takeOff(inv: Inventory, slot: number): Inventory {
  const copy = inv.equip[slot];
  if (!copy || inv.bag.length >= BAG_SIZE) return inv;
  const equip = [...inv.equip];
  equip[slot] = null;
  return { ...inv, bag: [...inv.bag, copy], equip };
}

/** Stat bonus from everything worn (a broken item — durability 0 — gives nothing). */
export function equipBonus(inv: Inventory, items: Map<number, ItemRow>): Stats {
  const out: Stats = { hp: 0, mp: 0, sp: 0, str: 0, def: 0, agi: 0 };
  for (const copy of inv.equip) {
    const item = copy && copy.dur > 0 ? items.get(copy.id) : undefined;
    if (!item) continue;
    for (const k of Object.keys(out) as (keyof Stats)[]) out[k] += item.mods[k] ?? 0;
  }
  return out;
}

/**
 * A stage's loot table (the .sty `itm` rows: sprite id, weight). Each KO rolls every row with
 * a chance of weight / 1000 and drops the first that hits — the client's own odds lived on the
 * server, so this is the remake's reading of the weights.
 */
export function rollLoot(loot: { sprite: number; p: number }[], rand = Math.random) {
  for (const row of [...loot].sort(() => rand() - 0.5))
    if (rand() < row.p / 1000) return row.sprite;
  return null;
}

/*
  耐久度 in the field. The item table counts durability on its own scale (a bat 10000) while the
  item's sprite carries the hp it has on the ground (a bat 500); a copy taken into a stage spawns
  with its share of that hp, and what is left when the stage ends is written back.
*/
const fullDur = (item: ItemRow) => item.durability || 10000;

/** The field hp of a copy: the sprite's hp scaled by how worn the copy is. */
export const fieldHp = (copy: Owned, item: ItemRow, spriteHp: number) =>
  Math.max(1, Math.round(spriteHp * Math.min(1, copy.dur / fullDur(item))));

/** A copy's durability from the hp its sprite has left (0 once it broke or was used up). */
export const durFromHp = (hp: number, spriteHp: number, item: ItemRow) =>
  hp <= 0 ? 0 : Math.max(1, Math.round(fullDur(item) * Math.min(1, hp / spriteHp)));

export type Carried = { copy: Owned; from: "equip" | "bag"; dur: number; kept: boolean };

/**
 * After a stage: the worn weapon keeps its slot with the durability it has left (0 = broken);
 * copies drawn from the backpack come back if the player still has them and they are not used up.
 */
export function settle(inv: Inventory, carried: Carried[]): Inventory {
  let equip = inv.equip;
  const bag = [...inv.bag];
  for (const c of carried) {
    if (c.from === "equip") {
      const slot = equip.findIndex((o) => o?.uid === c.copy.uid);
      if (slot < 0) continue;
      equip = equip.map((o, i) => (i === slot ? { ...c.copy, dur: c.dur } : o));
    } else if (c.kept && c.dur > 0 && bag.length < BAG_SIZE) {
      bag.push({ ...c.copy, dur: c.dur });
    }
  }
  return { ...inv, bag, equip };
}
