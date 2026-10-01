import type { ItemRow } from "@/lib/api";
import { emptyInventory, type Inventory } from "./inventory";
import { compose, repair, repairFee } from "./smith";

const row = (id: number, o: Partial<ItemRow>) =>
  ({
    id,
    name: `#${id}`,
    part: 3,
    type: 100,
    price: 0,
    durability: 10000,
    material: -1,
    ...o,
  }) as ItemRow;
const items = new Map(
  [
    row(102, { name: "刀", material: 4, price: 2000 }),
    row(501, { name: "汽水", type: 500, durability: 100 }),
    row(2903, { name: "銅", part: 9 }),
    row(2904, { name: "鐵", part: 9 }),
    row(5151, { name: "魔劍", material: 8 }),
    row(5136, { name: "赤色魔精石", part: 11 }),
    row(5144, { name: "魔劍【紅蓮】", material: 8 }),
  ].map((r) => [r.id, r]),
);
const inv = (bag: [number, number][]): Inventory => ({
  ...emptyInventory(),
  bag: bag.map(([id, dur], i) => ({ uid: i + 1, id, dur })),
  next: bag.length + 1,
});

describe("維修", () => {
  it("mends to full with the item's own material and charges the fee", () => {
    const start = inv([
      [102, 2500],
      [2904, 100],
    ]);
    expect(repairFee(start.bag[0], items.get(102)!)).toBe(150);
    const r = repair(start, 1, 2, 1000, items);
    if (!r.ok) throw new Error(r.why);
    expect(r.money).toBe(850);
    expect(r.inv.bag).toEqual([{ uid: 1, id: 102, dur: 10000 }]);
  });

  it("refuses the wrong material, unmendable items and short money", () => {
    const start = inv([
      [102, 2500],
      [2903, 100],
      [501, 50],
      [501, 50],
      [2904, 100],
    ]);
    expect(repair(start, 1, 2, 1000, items)).toEqual({
      ok: false,
      why: "這件物品不能用「銅」來維修。",
    });
    expect(repair(start, 1, 3, 1000, items)).toEqual({
      ok: false,
      why: "拿這東西作材料！？你在耍老子麼！？",
    });
    expect(repair(start, 3, 5, 1000, items).ok).toBe(false);
    expect(repair(start, 1, 5, 100, items)).toEqual({ ok: false, why: "金錢不足" });
  });
});

describe("合成", () => {
  it("sets a 魔精石 into the 魔劍", () => {
    const r = compose(
      inv([
        [5151, 10000],
        [5136, 100],
      ]),
      1,
      2,
      items,
    );
    if (!r.ok) throw new Error(r.why);
    expect(r.made).toBe(5144);
    expect(r.inv.bag.map((o) => o.id)).toEqual([5144]);
  });

  it("fails without the right pair and keeps both", () => {
    expect(
      compose(
        inv([
          [102, 1],
          [5136, 1],
        ]),
        1,
        2,
        items,
      ),
    ).toEqual({
      ok: false,
      why: "抱歉，合成道具失敗。",
    });
  });
});
