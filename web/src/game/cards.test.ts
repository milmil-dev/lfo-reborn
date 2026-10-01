import type { ItemRow } from "@/lib/api";
import { type Card, itemCards, redeem, serial } from "./cards";
import { BAG_SIZE, emptyInventory } from "./inventory";

const row = (id: number, part = 3) => ({ id, name: `#${id}`, part, durability: 100 }) as ItemRow;
const items = new Map([row(501, 3), row(2101, 1), row(5151), row(5144)].map((r) => [r.id, r]));
const relic: Card = {
  kind: "relic",
  relic: { id: 2, key: "stinky", name: "星奇", form: "stinky_r", relic: "終極魔靈魂" },
};

describe("卡片店", () => {
  it("lists what no shop sells, without the beast swords", () => {
    const list = itemCards(items, new Set([501]));
    expect(list.map((c) => c.kind === "item" && c.item.id)).toEqual([2101]);
    expect(serial(list[0])).toBe("LFO-I02101");
  });

  it("puts an item card in the backpack", () => {
    const r = redeem({ kind: "item", item: row(2101, 1) }, emptyInventory(), []);
    expect(r).toMatchObject({ ok: true, text: "資料輸入成功！你已取得物品「#2101」。" });
    expect(r.ok && r.inv?.bag.map((o) => o.id)).toEqual([2101]);
    const full = {
      ...emptyInventory(),
      bag: Array.from({ length: BAG_SIZE }, (_, i) => ({ uid: i, id: 1, dur: 1 })),
    };
    expect(redeem({ kind: "item", item: row(2101) }, full, [])).toEqual({
      ok: false,
      text: "背包已滿",
    });
  });

  it("gives the account a 信物 once", () => {
    expect(redeem(relic, emptyInventory(), [])).toEqual({
      ok: true,
      text: "資料輸入成功！角色「星奇」可以進行異轉。",
      token: 2,
    });
    expect(redeem(relic, emptyInventory(), [2])).toEqual({ ok: false, text: "卡片已被使用！" });
  });

  it("gives the account a character card once", () => {
    const card: Card = { kind: "char", char: { key: "jessie", id: 71, name: "璇瓏" } };
    expect(redeem(card, emptyInventory(), [], [])).toEqual({
      ok: true,
      text: "資料輸入成功！你已取得人物「璇瓏」。",
      char: "jessie",
    });
    expect(redeem(card, emptyInventory(), [], ["jessie"])).toEqual({
      ok: false,
      text: "卡片已被使用！",
    });
    expect(serial(card)).toBe("LFO-C00071");
  });
});
