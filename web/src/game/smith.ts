/*
  鐵匠 (維修) and the 神秘人 who sets 魔精石 into 魔劍 (合成), both in the lobby's repair shops.

  維修 takes the worn item and one unit of its material: every item row names the material it
  is made of (`material` 0 布料 … 8 魔精石, the material items 2900 + n; -1 cannot be mended).
  The client showed a 修理費 whose formula lived on the server; the remake charges a tenth of
  the item's value per fully worn item, at least $50.

  合成 follows the 兇獸突襲 notes: the unfinished 魔劍 plus one of the seven beasts' 魔精石 makes
  that beast's sword. Neither half can be banked or traded.
*/
import { add, BAG_SIZE, type Inventory, type Owned } from "./inventory";
import type { ItemRow } from "@/lib/api";

export const MATERIAL_BASE = 2900;
const full = (item: ItemRow) => item.durability || 10000;

/** 魔劍 + 魔精石 (赤 橙 紫 黃 綠 藍 白) → 紅蓮 日 紫電 月 螢 蒼雷 烈風 */
export const BLANK_SWORD = 5151;
export const RECIPES = new Map([
  [5136, 5144],
  [5137, 5145],
  [5138, 5146],
  [5139, 5147],
  [5140, 5148],
  [5141, 5149],
  [5142, 5150],
]);
/** "此物品不能交易及儲存於銀行": the 魔劍 in every form and the 魔精石 */
export const NO_TRADE = new Set([BLANK_SWORD, ...RECIPES.keys(), ...RECIPES.values()]);

export const isMaterial = (item: ItemRow) => item.part === 9;

export function repairFee(copy: Owned, item: ItemRow) {
  const worn = 1 - Math.min(1, copy.dur / full(item));
  if (worn <= 0) return 0;
  return Math.max(50, Math.round((worn * Math.max(item.price, 1000)) / 10 / 10) * 10);
}

/** Why this pair can't be mended, or null if it can (the smith's own lines). */
export function cannotRepair(
  target: { copy: Owned; item: ItemRow } | null,
  material: { copy: Owned; item: ItemRow } | null,
): string | null {
  if (!target) return "先讓老子看看要修理的東西吧！";
  if (target.item.material < 0 || isMaterial(target.item))
    return "你究竟比D乜撚野我整啊？過主啦！\n（老子的鐵鎚不打這無聊的東西，快滾！）";
  if (target.copy.dur >= full(target.item)) return "這件東西好端端的，修甚麼修！";
  if (!material) return "修理要用材料，拿來！";
  if (!isMaterial(material.item)) return "拿這東西作材料！？你在耍老子麼！？";
  if (material.item.id !== MATERIAL_BASE + target.item.material)
    return `這件物品不能用「${material.item.name}」來維修。`;
  return null;
}

export type SmithResult =
  | { ok: true; inv: Inventory; money: number; made?: number }
  | { ok: false; why: string };

/** Mend a backpack item to full with one unit of its material and the fee. */
export function repair(
  inv: Inventory,
  uid: number,
  materialUid: number,
  money: number,
  items: Map<number, ItemRow>,
): SmithResult {
  const pick = (u: number) => {
    const copy = inv.bag.find((o) => o.uid === u);
    const item = copy && items.get(copy.id);
    return copy && item ? { copy, item } : null;
  };
  const target = pick(uid);
  const material = pick(materialUid);
  const why = cannotRepair(target, material);
  if (why || !target) return { ok: false, why: why ?? "" };
  const fee = repairFee(target.copy, target.item);
  if (money < fee) return { ok: false, why: "金錢不足" };
  return {
    ok: true,
    money: money - fee,
    inv: {
      ...inv,
      bag: inv.bag
        .filter((o) => o.uid !== materialUid)
        .map((o) => (o.uid === uid ? { ...o, dur: full(target.item) } : o)),
    },
  };
}

/** Set a 魔精石 into the 魔劍. */
export function compose(
  inv: Inventory,
  swordUid: number,
  stoneUid: number,
  items: Map<number, ItemRow>,
): SmithResult {
  const sword = inv.bag.find((o) => o.uid === swordUid);
  const stone = inv.bag.find((o) => o.uid === stoneUid);
  const made = stone && RECIPES.get(stone.id);
  const item = made && items.get(made);
  if (!sword || !stone || sword.id !== BLANK_SWORD || !item)
    return { ok: false, why: "抱歉，合成道具失敗。" };
  const rest = { ...inv, bag: inv.bag.filter((o) => o !== sword && o !== stone) };
  const next = rest.bag.length < BAG_SIZE ? add(rest, item) : null;
  if (!next) return { ok: false, why: "背包已滿" };
  return { ok: true, inv: next, money: 0, made: item.id };
}
