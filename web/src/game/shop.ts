/*
  商店. The lobby's shop rooms are known by their shopkeeper (an object layer of the room):
  item / weapon / armour shops sell from the client's own stock lists (SHOP/*.dat.tzw →
  game/shops.json, pipeline/shops.ts); the bank, the iron smith (repair + compose) and the card
  shop are other systems. Each visit rolls the shelf: every listed unit is in stock with its
  `chance` %, as the lists' third column reads.
*/
import type { ItemRow } from "@/lib/api";
import { add, type Inventory } from "./inventory";
import type { Room } from "./story/types";

export type ShopKind = "item" | "weapon" | "armor";
export type ShopEntry = { id: number; price: number; chance: number; units: number };
export type Shelf = { id: number; price: number; left: number }[];

export type KeeperKind = ShopKind | "bank" | "repair" | "compose" | "card";
const KEEPERS: [RegExp, KeeperKind][] = [
  [/itemcomposeshopkeeper/i, "compose"],
  [/itemshopkeeper/i, "item"],
  [/weaponshopkeeper/i, "weapon"],
  [/armou?rshopkeeper/i, "armor"],
  [/bankshopkeeper/i, "bank"],
  [/repairshopkeeper/i, "repair"],
  [/cardshopkeeper/i, "card"],
];

/** What kind of shop a room is, from the shopkeeper standing in it. */
export function shopOf(room: Room) {
  for (const l of room.layers) for (const [re, kind] of KEEPERS) if (re.test(l.img)) return kind;
  return null;
}

/** Where the shopkeeper stands (the counter the player talks to). */
export function keeperAt(room: Room) {
  const l = room.layers.find((x) => KEEPERS.some(([re]) => re.test(x.img)));
  return l ? { x: l.x, z: l.z } : null;
}

/**
 * The keeper nearest to x. The repair shops hold two: the iron smith at his anvil and, further
 * in, the 神秘人 who sets 魔精石 into 魔劍.
 */
export function nearestKeeper(room: Room, x: number): KeeperKind | null {
  let best: { kind: KeeperKind; d: number } | null = null;
  for (const l of room.layers)
    for (const [re, kind] of KEEPERS)
      if (re.test(l.img) && (!best || Math.abs(l.x - x) < best.d))
        best = { kind, d: Math.abs(l.x - x) };
  return best?.kind ?? null;
}

/** Today's shelf: each listed unit is in stock with its chance. */
export function stock(entries: ShopEntry[], rand = Math.random): Shelf {
  const out: Shelf = [];
  for (const e of entries) {
    let left = 0;
    for (let u = 0; u < e.units; u++) if (rand() * 100 < e.chance) left++;
    if (left) out.push({ id: e.id, price: e.price, left });
  }
  return out;
}

export type Purchase =
  | { ok: true; inv: Inventory; money: number; shelf: Shelf }
  | { ok: false; why: string };

/** Buy one unit of shelf row `i`. */
export function buy(
  shelf: Shelf,
  i: number,
  inv: Inventory,
  money: number,
  item: ItemRow,
): Purchase {
  const row = shelf[i];
  if (!row || row.left <= 0) return { ok: false, why: "已售罄" };
  if (money < row.price) return { ok: false, why: "金錢不足" };
  const next = add(inv, item);
  if (!next) return { ok: false, why: "背包已滿" };
  return {
    ok: true,
    inv: next,
    money: money - row.price,
    shelf: shelf
      .map((r, n) => (n === i ? { ...r, left: r.left - 1 } : r))
      .filter((r) => r.left > 0),
  };
}

/**
 * What a shop pays for an item: the item table's own `price` (汽水 100 against the shelf's 1000,
 * 生命藥水 2000 against 10000 — the list sells at a mark-up and buys back at the item's value).
 * Items valued 0 (materials, quest items) are not bought back.
 */
export const sellPrice = (item: ItemRow) => item.price;

export type Sale = { ok: true; inv: Inventory; money: number } | { ok: false; why: string };

/** Sell one backpack item. */
export function sell(inv: Inventory, uid: number, money: number, item: ItemRow): Sale {
  if (!inv.bag.some((o) => o.uid === uid)) return { ok: false, why: "物品不在背包" };
  const price = sellPrice(item);
  if (price <= 0) return { ok: false, why: "此物品不能出售" };
  return {
    ok: true,
    inv: { ...inv, bag: inv.bag.filter((o) => o.uid !== uid) },
    money: money + price,
  };
}
