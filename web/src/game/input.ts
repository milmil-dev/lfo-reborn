import type { Button, InputState } from "./core/types";
import { EMPTY_INPUT } from "./core/types";

/* ───────── bindings (persisted per browser, edited on the 按鍵設定 panel) ───────── */

export const BUTTONS: Button[] = [
  "up",
  "down",
  "left",
  "right",
  "attack",
  "jump",
  "defend",
  "item",
  "drop",
];
export type PadButton = "attack" | "jump" | "defend";

export type Bindings = {
  /** KeyboardEvent.code per button: a primary and an optional secondary key */
  keys: Record<Button, [string, string?]>;
  /** standard-gamepad button index per action button (the d-pad / stick always move) */
  pad: Record<PadButton, number>;
};

export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    up: ["ArrowUp", "KeyW"],
    down: ["ArrowDown", "KeyS"],
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    attack: ["KeyJ"],
    jump: ["KeyK"],
    defend: ["KeyL"],
    item: ["KeyI"],
    drop: ["KeyO"],
  },
  pad: { attack: 2, jump: 0, defend: 1 },
};

const STORE = "lfo.bindings";
let current: Bindings = load();
const listeners = new Set<() => void>();

function load(): Bindings {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const b = JSON.parse(raw) as Partial<Bindings>;
      return {
        keys: { ...DEFAULT_BINDINGS.keys, ...b.keys },
        pad: { ...DEFAULT_BINDINGS.pad, ...b.pad },
      };
    }
  } catch {
    // private mode / blocked storage: defaults
  }
  return structuredClone(DEFAULT_BINDINGS);
}

export const getBindings = () => current;

export function setBindings(next: Bindings) {
  current = next;
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    // not persisted, still applied for this session
  }
  for (const l of listeners) l();
}

export function onBindings(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const NAMED: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  Enter: "Enter",
  ShiftLeft: "L-Shift",
  ShiftRight: "R-Shift",
  ControlLeft: "L-Ctrl",
  ControlRight: "R-Ctrl",
  AltLeft: "L-Alt",
  AltRight: "R-Alt",
  Semicolon: ";",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
};

/** Human label for a KeyboardEvent.code: KeyJ → J, Digit1 → 1, Numpad4 → Num 4. */
export function codeLabel(code: string | undefined) {
  if (!code) return "";
  if (NAMED[code]) return NAMED[code];
  return code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "Num ");
}

/** The primary key currently bound to a button, for on-screen hints. */
export const keyLabel = (b: Button) => codeLabel(current.keys[b][0]);

/* ───────── sampling ───────── */

/** the pad's shoulder buttons take an item into the hands / drop it (not rebindable) */
export const PAD_ITEM = 4;
export const PAD_DROP = 5;

/** How many game screens are sampling input right now (the pad bridge stays out of their way). */
let live = 0;
export const inGame = () => live > 0;

/** Keys typed into a text field (the lobby chat, the name box) are not game input. */
const typing = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  (e.target instanceof HTMLElement && e.target.isContentEditable);

/** Keyboard + first gamepad, sampled once per tick. */
export class Controls {
  private keys = new Set<Button>();
  // a tap shorter than one tick still has to register: presses latch until the next sample
  private latched = new Set<Button>();
  private byCode = new Map<string, Button>();
  private readonly off: () => void;

  private readonly down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const b = this.byCode.get(e.code);
    if (!b || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    this.keys.add(b);
    this.latched.add(b);
  };
  private readonly up = (e: KeyboardEvent) => {
    const b = this.byCode.get(e.code);
    if (b) this.keys.delete(b);
  };
  private readonly blur = () => this.keys.clear();

  constructor(private readonly target: Window = window) {
    this.rebind();
    this.off = onBindings(() => this.rebind());
    target.addEventListener("keydown", this.down);
    target.addEventListener("keyup", this.up);
    target.addEventListener("blur", this.blur);
    live++;
  }

  private rebind() {
    this.byCode.clear();
    for (const b of BUTTONS) for (const code of current.keys[b]) if (code) this.byCode.set(code, b);
    this.keys.clear();
  }

  sample(): InputState {
    const s: InputState = { ...EMPTY_INPUT };
    for (const b of this.keys) s[b] = true;
    for (const b of this.latched) s[b] = true;
    this.latched.clear();
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
      s.left ||= ax < -0.5 || btn(14);
      s.right ||= ax > 0.5 || btn(15);
      s.up ||= ay < -0.5 || btn(12);
      s.down ||= ay > 0.5 || btn(13);
      s.attack ||= btn(current.pad.attack);
      s.jump ||= btn(current.pad.jump);
      s.defend ||= btn(current.pad.defend);
      s.item ||= btn(PAD_ITEM);
      s.drop ||= btn(PAD_DROP);
    }
    return s;
  }

  dispose() {
    live--;
    this.off();
    this.target.removeEventListener("keydown", this.down);
    this.target.removeEventListener("keyup", this.up);
    this.target.removeEventListener("blur", this.blur);
  }
}
