import { Controls, DEFAULT_BINDINGS, keyCode, setBindings } from "./input";

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
