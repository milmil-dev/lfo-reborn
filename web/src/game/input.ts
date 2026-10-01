import { KEY, moveKey } from "@/lib/storage-keys";
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
type Layout = Record<Button, [string, string?]>;

export type Bindings = {
  /** KeyboardEvent.code per button: a primary and an optional secondary key */
  keys: Layout;
  /** a second keyboard layout, for a second player sharing the keyboard (the "kb2" device) */
  keys2: Layout;
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
  // T F G H to move, Z X C 攻 跳 防, V B item / drop: clear of the first layout's WASD + JKL IO
  keys2: {
    up: ["KeyT"],
    down: ["KeyG"],
    left: ["KeyF"],
    right: ["KeyH"],
    attack: ["KeyZ"],
    jump: ["KeyX"],
    defend: ["KeyC"],
    item: ["KeyV"],
    drop: ["KeyB"],
  },
  pad: { attack: 2, jump: 0, defend: 1 },
};

const STORE = KEY.bindings;
moveKey(() => localStorage, "lfo.bindings", STORE);
let current: Bindings = load();
const listeners = new Set<() => void>();

function load(): Bindings {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const b = JSON.parse(raw) as Partial<Bindings>;
      return {
        keys: { ...DEFAULT_BINDINGS.keys, ...b.keys },
        keys2: { ...DEFAULT_BINDINGS.keys2, ...b.keys2 },
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

/* ───────── devices: what a seat at this machine reads ───────── */

/**
 * "kb" is the first keyboard layout plus every connected gamepad no other seat has claimed (a
 * lone player's pad keeps working without being picked); "kb2" the second layout; "pad<n>" the
 * gamepad at that index of navigator.getGamepads().
 */
export type Device = "kb" | "kb2" | `pad${number}`;

export const padDevice = (index: number): Device => `pad${index}`;
/** The gamepad index a device names, or null for a keyboard layout. */
export const padIndex = (d: Device) => (d.startsWith("pad") ? Number(d.slice(3)) : null);

const pads = () => [...(navigator.getGamepads?.() ?? [])].filter((p) => p?.connected) as Gamepad[];

/** The devices present right now that none of `taken` holds: both keyboard layouts, then the pads. */
export function availableDevices(taken: Iterable<Device> = []): Device[] {
  const t = new Set(taken);
  const out: Device[] = [];
  for (const d of ["kb", "kb2"] as const) if (!t.has(d)) out.push(d);
  for (const p of pads()) if (!t.has(padDevice(p.index))) out.push(padDevice(p.index));
  return out;
}

/** Runs `fn` whenever a gamepad comes or goes. */
export function onDevices(fn: () => void) {
  addEventListener("gamepadconnected", fn);
  addEventListener("gamepaddisconnected", fn);
  return () => {
    removeEventListener("gamepadconnected", fn);
    removeEventListener("gamepaddisconnected", fn);
  };
}

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

const SIDE = ["", "Left", "Right"];
const MODIFIER = /^(Shift|Control|Alt|Meta)(Left|Right)$/;
/**
 * The key's code. Some setups (remote desktops, IMEs, injected events) send modifiers with an
 * empty code: rebuild it from the key and its side, so R-Shift still reads as ShiftRight.
 */
export function keyCode(e: KeyboardEvent) {
  if (e.code && e.code !== "Unidentified") return e.code;
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key) && SIDE[e.location])
    return e.key + SIDE[e.location];
  return e.code;
}

/** One keyboard layout's buttons, held and latched between samples. */
class Keys {
  private keys = new Set<Button>();
  // a tap shorter than one tick still has to register: presses latch until the next sample
  private latched = new Set<Button>();
  private byCode = new Map<string, Button>();
  // a held key whose keyup never came (an IME or the OS took a Shift release) and that is
  // pressed again: let go of it for one tick so the press still has an edge
  private retap = new Set<Button>();

  constructor(private readonly layout: () => Layout) {
    this.rebind();
  }

  private readonly down = (e: KeyboardEvent) => {
    this.syncModifiers(e);
    if (typing(e)) return;
    const code = keyCode(e);
    const b = this.byCode.get(code);
    // ⌘ / Ctrl shortcuts stay the browser's, unless the bound key is that modifier itself
    if (!b || ((e.metaKey || e.ctrlKey) && !MODIFIER.test(code))) return;
    e.preventDefault();
    if (!e.repeat && this.keys.has(b)) this.retap.add(b);
    this.keys.add(b);
    this.latched.add(b);
  };
  private readonly up = (e: KeyboardEvent) => {
    this.syncModifiers(e);
    const b = this.byCode.get(keyCode(e));
    if (b) this.keys.delete(b);
  };
  /** A button bound to Shift / Ctrl / Alt / ⌘ is up once the event says that modifier is. */
  private syncModifiers(e: KeyboardEvent) {
    for (const [code, b] of this.byCode) {
      const mod = MODIFIER.exec(code)?.[1];
      if (mod && this.keys.has(b) && !e.getModifierState(mod)) this.keys.delete(b);
    }
  }
  private readonly blur = () => {
    this.keys.clear();
    this.retap.clear();
  };

  attach(target: Window) {
    target.addEventListener("keydown", this.down);
    target.addEventListener("keyup", this.up);
    target.addEventListener("blur", this.blur);
  }
  detach(target: Window) {
    target.removeEventListener("keydown", this.down);
    target.removeEventListener("keyup", this.up);
    target.removeEventListener("blur", this.blur);
  }

  rebind() {
    this.byCode.clear();
    const layout = this.layout();
    for (const b of BUTTONS) for (const code of layout[b]) if (code) this.byCode.set(code, b);
    this.keys.clear();
  }

  /** Merge this layout's buttons into `s`. */
  sample(s: InputState) {
    for (const b of this.keys) s[b] = true;
    for (const b of this.latched) s[b] = true;
    this.latched.clear();
    for (const b of this.retap) {
      s[b] = false;
      this.latched.add(b);
    }
    this.retap.clear();
  }
}

/** Merge a standard gamepad's stick / d-pad and buttons into `s`. */
function readPad(pad: Gamepad, s: InputState) {
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

/** One InputState per seat, each from its own device, sampled once per tick. */
export class SeatControls {
  private readonly keys = new Map<Device, Keys>();
  private readonly off: () => void;

  constructor(
    readonly devices: readonly Device[],
    private readonly target: Window = window,
  ) {
    for (const d of devices)
      if (d === "kb" || d === "kb2")
        this.keys.set(d, new Keys(() => (d === "kb" ? current.keys : current.keys2)));
    for (const k of this.keys.values()) k.attach(target);
    this.off = onBindings(() => {
      for (const k of this.keys.values()) k.rebind();
    });
    live++;
  }

  sample(): InputState[] {
    const connected = pads();
    const claimed = new Set(this.devices.map(padIndex).filter((i) => i !== null));
    return this.devices.map((d) => {
      const s: InputState = { ...EMPTY_INPUT };
      const index = padIndex(d);
      if (index !== null) {
        const pad = connected.find((p) => p.index === index);
        if (pad) readPad(pad, s);
        return s;
      }
      this.keys.get(d)?.sample(s);
      if (d === "kb") for (const pad of connected) if (!claimed.has(pad.index)) readPad(pad, s);
      return s;
    });
  }

  dispose() {
    live--;
    this.off();
    for (const k of this.keys.values()) k.detach(this.target);
  }
}

/** Keyboard + gamepad for a single player (the story, the training ground): one "kb" seat. */
export class Controls {
  private readonly seats: SeatControls;

  constructor(target: Window = window) {
    this.seats = new SeatControls(["kb"], target);
  }

  sample(): InputState {
    return this.seats.sample()[0];
  }

  dispose() {
    this.seats.dispose();
  }
}
