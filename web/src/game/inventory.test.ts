import type { ItemRow } from "@/lib/api";
import {
  add,
  cannotWear,
  durFromHp,
  emptyInventory,
  equipBonus,
  fieldHp,
  type Inventory,
  rollLoot,
  settle,
  takeOff,
  wear,
} from "./inventory";

const none = { hp: 0, mp: 0, sp: 0, str: 0, def: 0, agi: 0 };
const row = (o: Partial<ItemRow>): ItemRow => ({
  id: 1,
  name: "x",
  category: "",
  part: 1,
  type: 2100,
  req_lv: 0,
  req: none,
  mods: none,
  mod_total: 0,
  durability: 1000,
  material: -1,
  price: 0,
  users: [],
  icon: null,
  color: null,
  ...o,
});
const ribbon = row({ id: 2101, part: 1, mods: { ...none, def: 5 } });
const helmet = row({ id: 2105, part: 1, mods: { ...none, def: 12 }, req_lv: 10 });
const glove = row({ id: 2601, part: 6, mods: { ...none, str: 3 } });
const stinkyOnly = row({ id: 2650, part: 6, users: [2, 7002] });
const material = row({ id: 2900, part: 9, type: 2900 });
const items = new Map([ribbon, helmet, glove, stinkyOnly, material].map((i) => [i.id, i]));

describe("背包 / 裝備", () => {
  it("wears an item in its part's slot and swaps the old one back into the bag", () => {
    let inv = add(add(emptyInventory(), ribbon)!, helmet)!;
    inv = wear(inv, 1, items);
    expect(inv.equip[1]?.id).toBe(2101);
    inv = wear(inv, 2, items);
    expect(inv.equip[1]?.id).toBe(2105);
    expect(inv.bag.map((o) => o.id)).toEqual([2101]);
    inv = takeOff(inv, 1);
    expect(inv.equip[1]).toBeNull();
    expect(inv.bag.map((o) => o.id)).toEqual([2101, 2105]);
  });

  it("checks level, character and whether the part is worn at all", () => {
    expect(cannotWear(helmet, 5, 2)).toMatch(/LV 10/);
    expect(cannotWear(helmet, 10, 2)).toBeNull();
    expect(cannotWear(stinkyOnly, 1, 3)).not.toBeNull();
    expect(cannotWear(stinkyOnly, 1, 2)).toBeNull();
    expect(cannotWear(material, 99, 2)).not.toBeNull();
    // a stat short of the requirement answers with the client's line
    const ring = row({ part: 8, type: 2800, req: { ...none, str: 120 } });
    const stats = { hp: 900, mp: 850, sp: 1100, str: 60, def: 15, agi: 17 };
    expect(cannotWear(ring, 1, 2, stats)).toBe("你的 STR 不足以裝備這件物品。");
    expect(cannotWear(ring, 1, 2, { ...stats, str: 120 })).toBeNull();
  });

  it("adds up the worn items' stats, ignoring broken ones", () => {
    let inv = add(add(emptyInventory(), ribbon)!, glove)!;
    inv = wear(wear(inv, 1, items), 2, items);
    expect(equipBonus(inv, items)).toMatchObject({ def: 5, str: 3 });
    inv = { ...inv, equip: inv.equip.map((o) => (o?.id === 2601 ? { ...o, dur: 0 } : o)) };
    expect(equipBonus(inv, items)).toMatchObject({ def: 5, str: 0 });
  });

  it("rolls a stage's loot table", () => {
    expect(rollLoot([{ sprite: 101, p: 1000 }])).toBe(101);
    expect(rollLoot([{ sprite: 101, p: 0 }])).toBeNull();
  });
});

describe("durability in the field", () => {
  const bat = { durability: 10000 } as ItemRow;

  it("scales a worn copy's field hp and reads it back", () => {
    expect(fieldHp({ uid: 1, id: 101, dur: 5000 }, bat, 500)).toBe(250);
    expect(durFromHp(250, 500, bat)).toBe(5000);
    expect(durFromHp(0, 500, bat)).toBe(0);
    expect(fieldHp({ uid: 1, id: 101, dur: 1 }, bat, 500)).toBe(1);
  });

  it("writes wear back to the worn weapon and returns kept bag copies", () => {
    const inv: Inventory = {
      ...emptyInventory(),
      equip: [null, null, null, { uid: 1, id: 101, dur: 10000 }, null, null, null, null, null],
      next: 4,
    };
    const out = settle(inv, [
      { copy: { uid: 1, id: 101, dur: 10000 }, from: "equip", dur: 0, kept: false },
      { copy: { uid: 2, id: 101, dur: 9000 }, from: "bag", dur: 4000, kept: true },
      { copy: { uid: 3, id: 501, dur: 100 }, from: "bag", dur: 0, kept: true },
    ]);
    expect(out.equip[3]).toEqual({ uid: 1, id: 101, dur: 0 });
    expect(out.bag).toEqual([{ uid: 2, id: 101, dur: 4000 }]);
  });
});
