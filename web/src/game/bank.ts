/*
  銀行. The lobby's bank (bank/bank_box) keeps 5 × 10 items for every character on the server,
  so a copy put in by one profile can be taken out by another. Copies keep their durability;
  one taken out gets a fresh uid from the taker's backpack so uids never clash between profiles.
*/
import { BAG_SIZE, type Inventory, type Owned } from "./inventory";
import { NO_TRADE } from "./smith";

export const BANK_SIZE = 50;

export type Transfer = { ok: true; inv: Inventory; bank: Owned[] } | { ok: false; why: string };

/** Put one backpack item into the bank. */
export function deposit(inv: Inventory, bank: Owned[], uid: number): Transfer {
  const copy = inv.bag.find((o) => o.uid === uid);
  if (!copy) return { ok: false, why: "物品不在背包" };
  if (NO_TRADE.has(copy.id)) return { ok: false, why: "此物品不能交易及儲存於銀行" };
  if (bank.length >= BANK_SIZE) return { ok: false, why: "銀行已滿" };
  return {
    ok: true,
    inv: { ...inv, bag: inv.bag.filter((o) => o !== copy) },
    bank: [...bank, copy],
  };
}

/** Take bank item `i` back into the backpack. */
export function withdraw(inv: Inventory, bank: Owned[], i: number): Transfer {
  const copy = bank[i];
  if (!copy) return { ok: false, why: "銀行沒有此物品" };
  if (inv.bag.length >= BAG_SIZE) return { ok: false, why: "背包已滿" };
  return {
    ok: true,
    inv: { ...inv, bag: [...inv.bag, { ...copy, uid: inv.next }], next: inv.next + 1 },
    bank: bank.filter((_, n) => n !== i),
  };
}
