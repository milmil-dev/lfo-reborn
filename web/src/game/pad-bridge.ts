/*
  手掣 (gamepad) everywhere. The fight engine reads the pad directly (input.ts Controls), but the
  screens around it — title, server / character select, stage select, the lobby's panels, the
  dialogue box — listen for keys. This bridge polls the first standard gamepad and presses the
  matching keys for them:

    d-pad / left stick  arrows (repeating while held on menus)
    ✕ A                 Enter        ○ B   Esc (back)      □ X   J (攻)
    △ Y                 Y (異轉)     Start Esc (menu)       Select Tab (出招表)

  While a fight is sampling input the face buttons stay 攻 跳 防 (○ never opens the pause menu
  mid-combo); only the pad's 攻 also presses J so a talk box or a shop counter can be answered.
*/
import { getBindings, inGame } from "./input";

type Key = { key: string; code: string };
const K = (key: string, code = key): Key => ({ key, code });
const ARROWS: Record<"up" | "down" | "left" | "right", Key> = {
  up: K("ArrowUp"),
  down: K("ArrowDown"),
  left: K("ArrowLeft"),
  right: K("ArrowRight"),
};
const MENU: Record<number, Key> = { 0: K("Enter"), 1: K("Escape"), 2: K("j", "KeyJ") };
const ALWAYS: Record<number, Key> = { 3: K("y", "KeyY"), 8: K("Tab"), 9: K("Escape") };

const REPEAT_DELAY = 380;
const REPEAT_EVERY = 110;

function press(k: Key, type: "keydown" | "keyup", repeat = false) {
  const target =
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent(type, { ...k, bubbles: true, cancelable: true, repeat }));
}

let started = false;
export function startPadBridge() {
  if (started || typeof navigator === "undefined" || !navigator.getGamepads) return;
  started = true;
  const held = new Map<string, { k: Key; since: number; last: number }>();

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const pad = [...navigator.getGamepads()].find((p) => p?.connected);
    const want = new Map<string, Key>();
    if (pad && document.visibilityState === "visible") {
      const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
      const [ax = 0, ay = 0] = pad.axes;
      if (btn(12) || ay < -0.5) want.set("up", ARROWS.up);
      if (btn(13) || ay > 0.5) want.set("down", ARROWS.down);
      if (btn(14) || ax < -0.5) want.set("left", ARROWS.left);
      if (btn(15) || ax > 0.5) want.set("right", ARROWS.right);
      for (const [i, k] of Object.entries(ALWAYS)) if (btn(Number(i))) want.set(`b${i}`, k);
      if (!inGame()) {
        for (const [i, k] of Object.entries(MENU)) if (btn(Number(i))) want.set(`b${i}`, k);
      } else if (btn(getBindings().pad.attack)) want.set("attack", MENU[2]);
    }
    for (const [id, h] of held)
      if (!want.has(id)) {
        press(h.k, "keyup");
        held.delete(id);
      }
    for (const [id, k] of want) {
      const h = held.get(id);
      if (!h) {
        press(k, "keydown");
        held.set(id, { k, since: now, last: now });
      } else if (
        !inGame() &&
        id in ARROWS &&
        now - h.since > REPEAT_DELAY &&
        now - h.last > REPEAT_EVERY
      ) {
        // menus scroll while a direction is held; in a fight the engine reads the stick itself
        press(k, "keydown", true);
        h.last = now;
      }
    }
  };
  requestAnimationFrame(frame);
}
