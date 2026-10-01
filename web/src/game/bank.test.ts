import { BANK_SIZE, deposit, withdraw } from "./bank";
import { BAG_SIZE, emptyInventory, type Inventory } from "./inventory";

const inv = (ids: number[]): Inventory => ({
  ...emptyInventory(),
  bag: ids.map((id, i) => ({ uid: i + 1, id, dur: 100 })),
  next: ids.length + 1,
});

describe("bank", () => {
  it("moves an item from the backpack into the bank and back", () => {
    const a = deposit(inv([501, 101]), [], 2);
    if (!a.ok) throw new Error(a.why);
    expect(a.inv.bag.map((o) => o.id)).toEqual([501]);
    expect(a.bank).toEqual([{ uid: 2, id: 101, dur: 100 }]);
    const b = withdraw(a.inv, a.bank, 0);
    if (!b.ok) throw new Error(b.why);
    expect(b.bank).toEqual([]);
    expect(b.inv.bag.map((o) => o.id)).toEqual([501, 101]);
  });

  it("gives a withdrawn copy a fresh uid from the taker's backpack", () => {
    // another profile's copy with a uid that clashes with this backpack
    const r = withdraw(inv([501]), [{ uid: 1, id: 101, dur: 7 }], 0);
    if (!r.ok) throw new Error(r.why);
    expect(r.inv.bag[1]).toEqual({ uid: 2, id: 101, dur: 7 });
    expect(r.inv.next).toBe(3);
  });

  it("refuses when the bank or the backpack is full", () => {
    const full = Array.from({ length: BANK_SIZE }, (_, i) => ({ uid: i, id: 501, dur: 1 }));
    expect(deposit(inv([501]), full, 1)).toEqual({ ok: false, why: "銀行已滿" });
    const packed = inv(Array.from({ length: BAG_SIZE }, () => 501));
    expect(withdraw(packed, [{ uid: 1, id: 101, dur: 1 }], 0)).toEqual({
      ok: false,
      why: "背包已滿",
    });
  });

  it("keeps the 魔劍 and 魔精石 out", () => {
    expect(deposit(inv([5151]), [], 1)).toEqual({ ok: false, why: "此物品不能交易及儲存於銀行" });
  });
});
