/*
  卡片店. In the client every card carried a serial number and a password typed into the card
  box (itemcard/itemcardbody), which the server checked and turned into an item, a character, a
  move or a character's 異轉信物. Offline nothing can check a physical card, so the remake's card
  shop lists every card there is and fills in its serial for you:
  - 道具: every item no shop sells (the 虛寶 — 時裝, weapons, armour …), except the 兇獸突襲
    swords and stones, which are only won;
  - 人物: every playable character beyond the 22 of the create-character screen (profile.tzw) —
    the client's 「資料輸入成功！你已取得人物「…」」; the account then takes it out of the 儲物室
    into a profile slot;
  - 異轉信物: one per character with a transformed form (game/relics.json), held by the account.
  The success and refusal lines are the client's own.
*/
import { add, type Inventory } from "./inventory";
import { NO_TRADE } from "./smith";
import type { ItemRow } from "@/lib/api";

export type Relic = { id: number; key: string; name: string; form: string; relic: string };
export type CardChar = { key: string; id: number; name: string };
export type Card =
  | { kind: "item"; item: ItemRow }
  | { kind: "char"; char: CardChar }
  | { kind: "relic"; relic: Relic };

/** The character cards: the playable roster minus the create screen's own characters. */
export function charCards(roster: CardChar[], starters: Set<string>): Card[] {
  return roster.filter((c) => !starters.has(c.key)).map((char) => ({ kind: "char", char }));
}

/** The item cards: what no shop sells and no beast drops. */
export function itemCards(items: Map<number, ItemRow>, sold: Set<number>): Card[] {
  return [...items.values()]
    .filter((it) => !sold.has(it.id) && !NO_TRADE.has(it.id))
    .sort((a, b) => a.part - b.part || a.id - b.id)
    .map((item) => ({ kind: "item", item }));
}

/** The card's serial as the box shows it once picked. */
export const serial = (c: Card) =>
  c.kind === "item"
    ? `LFO-I${String(c.item.id).padStart(5, "0")}`
    : c.kind === "char"
      ? `LFO-C${String(c.char.id).padStart(5, "0")}`
      : `LFO-T${String(c.relic.id).padStart(5, "0")}`;

export const cardName = (c: Card) =>
  c.kind === "item" ? c.item.name : c.kind === "char" ? c.char.name : c.relic.relic;

export type Redeemed =
  | { ok: true; text: string; inv?: Inventory; token?: number; char?: string }
  | { ok: false; text: string };

/** Enter a card: an item goes into the backpack, a 信物 or a character to the account (once). */
export function redeem(c: Card, inv: Inventory, tokens: number[], chars: string[] = []): Redeemed {
  if (c.kind === "char") {
    if (chars.includes(c.char.key)) return { ok: false, text: "卡片已被使用！" };
    return { ok: true, text: `資料輸入成功！你已取得人物「${c.char.name}」。`, char: c.char.key };
  }
  if (c.kind === "relic") {
    if (tokens.includes(c.relic.id)) return { ok: false, text: "卡片已被使用！" };
    return {
      ok: true,
      text: `資料輸入成功！角色「${c.relic.name}」可以進行異轉。`,
      token: c.relic.id,
    };
  }
  const next = add(inv, c.item);
  if (!next) return { ok: false, text: "背包已滿" };
  return { ok: true, text: `資料輸入成功！你已取得物品「${c.item.name}」。`, inv: next };
}
