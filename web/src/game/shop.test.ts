import type { ItemRow } from "@/lib/api";
import { emptyInventory } from "./inventory";
import { add } from "./inventory";
import { buy, nearestKeeper, sell, shopOf, stock } from "./shop";
import type { Room } from "./story/types";

const soda = { id: 501, name: "汽水", durability: 100 } as ItemRow;

describe("商店", () => {
  it("rolls each unit with its chance", () => {
    const shelf = stock([
      { id: 501, price: 1000, chance: 100, units: 10 },
      { id: 113, price: 23000, chance: 0, units: 1 },
    ]);
    expect(shelf).toEqual([{ id: 501, price: 1000, left: 10 }]);
  });

  it("buys one unit: money down, item in the bag, one fewer on the shelf", () => {
    const shelf = [{ id: 501, price: 1000, left: 2 }];
    const r = buy(shelf, 0, emptyInventory(), 1500, soda);
    expect(r.ok && r.money).toBe(500);
    expect(r.ok && r.inv.bag.map((o) => o.id)).toEqual([501]);
    expect(r.ok && r.shelf[0].left).toBe(1);
    expect(buy(shelf, 0, emptyInventory(), 500, soda)).toEqual({ ok: false, why: "金錢不足" });
  });

  it("knows a shop by its shopkeeper", () => {
    const room = { layers: [{ img: "new_weaponshopkeeper.spt" }] } as Room;
    expect(shopOf(room)).toBe("weapon");
  });

  it("tells the iron smith from the 神秘人 by who is nearer", () => {
    const room = {
      layers: [
        { img: "repairshopkeeper.spt", x: 862 },
        { img: "itemcomposeshopkeeper.spe", x: 702 },
      ],
    } as Room;
    expect(shopOf(room)).toBe("repair");
    expect(nearestKeeper(room, 900)).toBe("repair");
    expect(nearestKeeper(room, 650)).toBe("compose");
  });

  it("sells a backpack item at the item's own value", () => {
    const inv = add(emptyInventory(), { ...soda, price: 100 })!;
    const r = sell(inv, 1, 0, { ...soda, price: 100 });
    expect(r.ok && r.money).toBe(100);
    expect(r.ok && r.inv.bag).toEqual([]);
    expect(sell(inv, 1, 0, { ...soda, price: 0 })).toEqual({ ok: false, why: "此物品不能出售" });
  });
});
