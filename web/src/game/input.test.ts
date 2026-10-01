import {
  availableDevices,
  Controls,
  DEFAULT_BINDINGS,
  keyCode,
  SeatControls,
  setBindings,
} from "./input";

const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
  dispatchEvent(new KeyboardEvent(type, init));

describe("Controls with R-Shift as 跳", () => {
  let c: Controls;
  beforeEach(() => {
    const b = structuredClone(DEFAULT_BINDINGS);
    b.keys.jump = ["ShiftRight"];
    setBindings(b);
    c = new Controls();
  });
  afterEach(() => {
    c.dispose();
    setBindings(structuredClone(DEFAULT_BINDINGS));
  });

  it("reads R-Shift as the jump button", () => {
    key("keydown", { code: "ShiftRight", key: "Shift", location: 2, shiftKey: true });
    expect(c.sample().jump).toBe(true);
    key("keyup", { code: "ShiftRight", key: "Shift", location: 2 });
    expect(c.sample().jump).toBe(false);
  });

  it("rebuilds the code when a modifier arrives without one", () => {
    expect(keyCode(new KeyboardEvent("keydown", { key: "Shift", location: 2 }))).toBe("ShiftRight");
    key("keydown", { code: "", key: "Shift", location: 2, shiftKey: true });
    expect(c.sample().jump).toBe(true);
  });

  it("lets go of Shift on the next key event once Shift is no longer down", () => {
    key("keydown", { code: "ShiftRight", key: "Shift", location: 2, shiftKey: true });
    c.sample();
    // the keyup was swallowed (an IME toggling 中 / 英); the next key says Shift is up
    key("keydown", { code: "KeyJ", key: "j" });
    expect(c.sample().jump).toBe(false);
  });

  it("a second press after a lost keyup still gives a fresh press", () => {
    key("keydown", { code: "ShiftRight", key: "Shift", location: 2, shiftKey: true });
    expect(c.sample().jump).toBe(true);
    key("keydown", { code: "ShiftRight", key: "Shift", location: 2, shiftKey: true });
    expect(c.sample().jump).toBe(false);
    expect(c.sample().jump).toBe(true);
  });
});

/** A standard gamepad at `index` with these buttons down. */
const pad = (index: number, pressed: number[] = [], axes = [0, 0]) =>
  ({
    index,
    connected: true,
    axes,
    buttons: Array.from({ length: 16 }, (_, i) => ({
      pressed: pressed.includes(i),
      touched: false,
      value: pressed.includes(i) ? 1 : 0,
    })),
  }) as unknown as Gamepad;

describe("seats: one device each", () => {
  let pads: (Gamepad | null)[] = [];
  beforeAll(() => {
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
  });
  afterEach(() => {
    pads = [];
    setBindings(structuredClone(DEFAULT_BINDINGS));
  });

  it("the second keyboard layout drives the second seat only", () => {
    const c = new SeatControls(["kb", "kb2"]);
    key("keydown", { code: "KeyJ" }); // 攻 on the first layout
    key("keydown", { code: "KeyZ" }); // 攻 on the second
    let [p1, p2] = c.sample();
    expect([p1.attack, p2.attack]).toEqual([true, true]);
    key("keyup", { code: "KeyZ" });
    [p1, p2] = c.sample();
    expect([p1.attack, p2.attack]).toEqual([true, false]);
    key("keyup", { code: "KeyJ" });
    c.dispose();
  });

  it("a gamepad a seat claimed is not read by the keyboard seat; unclaimed pads are", () => {
    pads = [pad(0, [2]), pad(1, [0])]; // pad 0 presses 攻, pad 1 presses 跳
    const c = new SeatControls(["kb", "pad1"]);
    const [p1, p2] = c.sample();
    expect(p1.attack).toBe(true);
    expect(p1.jump).toBe(false);
    expect(p2.jump).toBe(true);
    expect(p2.attack).toBe(false);
    c.dispose();
  });

  it("a lone player's Controls still gets the keyboard and the pad together", () => {
    pads = [pad(0, [], [-1, 0])]; // stick left
    const c = new Controls();
    key("keydown", { code: "KeyJ" });
    const s = c.sample();
    expect(s.attack && s.left).toBe(true);
    key("keyup", { code: "KeyJ" });
    c.dispose();
  });

  it("lists the devices nobody holds: both layouts, then the connected pads", () => {
    pads = [pad(0), null, pad(2)];
    expect(availableDevices()).toEqual(["kb", "kb2", "pad0", "pad2"]);
    expect(availableDevices(["kb", "pad0"])).toEqual(["kb2", "pad2"]);
  });
});
