import type { Profile } from "./profiles";

const stinky: Profile = {
  key: "stinky",
  charId: 2,
  name: "星仔",
  created: 1,
  lv: 3,
  exp: 10,
  money: 500,
  honor: 0,
};

/** A fresh copy of the store module, created against whatever localStorage holds now. */
async function fresh() {
  vi.resetModules();
  return import("./profiles");
}

describe("save store", () => {
  beforeEach(() => localStorage.clear());

  it("carries over the saves written before the store", async () => {
    localStorage.setItem("lfo.profiles", JSON.stringify([stinky, null, null]));
    localStorage.setItem("lfo.activeSlot", "0");
    localStorage.setItem("lfo.server", JSON.stringify("boc"));
    localStorage.setItem("lfo.bank.boc", JSON.stringify([{ uid: 1, id: 501, dur: 100 }]));
    localStorage.setItem("lfo.tokens", JSON.stringify([2]));
    const s = await fresh();
    expect(s.getActiveProfile()?.name).toBe("星仔");
    expect(s.getBank()).toEqual([{ uid: 1, id: 501, dur: 100 }]);
    expect(s.hasToken(2)).toBe(true);
  });

  it("自由模式: new characters start at LV 150 and every 異轉 is open", async () => {
    const s = await fresh();
    expect(s.newProfile("stinky", 2, "x").lv).toBe(1);
    expect(s.hasToken(2)).toBe(false);
    s.setFreeplay(true);
    expect(s.newProfile("stinky", 2, "x").lv).toBe(150);
    expect(s.hasToken(2)).toBe(true);
    // and EXP carries a LV 150 character past 150
    s.saveSlot(0, s.newProfile("stinky", 2, "x"));
    s.setActiveSlot(0);
    expect(s.awardExp(1e9)?.profile.lv).toBe(300);
  });

  it("合體: seven 念源體 and the fee make a 合體戰神 for a term; 分體 ends it", async () => {
    const s = await fresh();
    const bag = [5330, 5331, 5332, 5333, 5334, 5335].map((id, i) => ({ uid: i + 1, id, dur: 1 }));
    s.saveSlot(0, { ...stinky, money: 20000, inv: { bag, equip: [], next: 7 } as never });
    s.setActiveSlot(0);
    expect(s.startFusion("duncun", 7).ok).toBe(true);
    const p = s.getActiveProfile()!;
    expect(s.playKey(p)).toBe("duncun");
    expect(s.playId(p)).toBe(8800);
    expect(p.money).toBe(10000);
    expect(p.inv?.bag).toEqual([]);
    expect(s.fusionOf(p, p.fusion!.until + 1)).toBeNull(); // the term runs out
    expect(s.startFusion("code", 7).ok).toBe(false); // already one
    s.endFusion();
    expect(s.playKey(s.getActiveProfile()!)).toBe("stinky");
    // without the 念源體 nothing happens
    expect(s.startFusion("duncun", 7)).toEqual({ ok: false, line: "你需要集齊七粒不同的念源體。" });
  });

  it("carries a save from before the rename over to the new key", async () => {
    let s = await fresh();
    s.saveSlot(0, stinky);
    const saved = localStorage.getItem("lfo-reborn.save")!;
    localStorage.clear();
    localStorage.setItem("lfo.save", saved);
    s = await fresh();
    expect(s.getSlots()[0]?.name).toBe("星仔");
    expect(localStorage.getItem("lfo-reborn.save")).not.toBeNull();
    // the old key stays for an older build
    expect(localStorage.getItem("lfo.save")).toBe(saved);
  });

  it("persists every change under one key and reads it back", async () => {
    let s = await fresh();
    s.saveSlot(1, stinky);
    s.setActiveSlot(1);
    s.setServer("std");
    s.updateActiveProfile((p) => ({ ...p, money: p.money + 250 }));
    s.saveBank([{ uid: 9, id: 101, dur: 5 }]);
    s.grantToken(2);
    s.grantToken(2);
    expect(JSON.parse(localStorage.getItem("lfo-reborn.save") ?? "{}").state.active).toBe(1);

    s = await fresh();
    expect(s.getActiveProfile()?.money).toBe(750);
    expect(s.getBank()).toEqual([{ uid: 9, id: 101, dur: 5 }]);
    expect(s.getTokens()).toEqual([2]);
  });

  it("keeps as many characters as the account makes", async () => {
    const s = await fresh();
    for (let i = 0; i < 5; i++) s.saveSlot(s.freeSlot(), { ...stinky, name: `星仔${i}` });
    expect(s.getSlots().map((p) => p?.name)).toEqual(["星仔0", "星仔1", "星仔2", "星仔3", "星仔4"]);
    // deleting leaves the place empty, so the others keep their index …
    s.setActiveSlot(3);
    s.saveSlot(1, null);
    expect(s.getSlots()[3]?.name).toBe("星仔3");
    expect(s.freeSlot()).toBe(1);
    // … and empty places at the end go; deleting the active one leaves nobody playing
    s.saveSlot(4, null);
    s.saveSlot(3, null);
    expect(s.getSlots()).toHaveLength(3);
    expect(s.getActiveSlot()).toBeNull();
  });

  it("keeps banks per server and levels up through awardExp", async () => {
    const s = await fresh();
    s.saveSlot(0, { ...stinky, lv: 1, exp: 0 });
    s.setActiveSlot(0);
    s.setServer("a");
    s.saveBank([{ uid: 1, id: 1, dur: 1 }]);
    s.setServer("b");
    expect(s.getBank()).toEqual([]);
    const r = s.awardExp(10_000);
    expect(r?.gained).toBeGreaterThan(0);
    expect(s.getActiveProfile()?.lv).toBe(r?.profile.lv);
  });
});
