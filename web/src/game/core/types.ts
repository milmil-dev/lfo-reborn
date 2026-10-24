// Character data exported by pipeline/sprites.ts (data/assets/game/chars/<key>.json).

export type Box = [x: number, y: number, w: number, h: number];

export type Atk = {
  box: Box;
  hp: number;
  fall: number;
  dizzy: number;
  dx: number;
  dy: number;
  dz: number;
  effect: number;
};

export type Frame = {
  n: string; // animation name, e.g. STAND, ATTACK1, TOP_PUNCH_m
  s: number; // state
  p: number; // picture id -> rects
  cx: number; // anchor (feet) inside the frame canvas
  cy: number;
  d: number; // duration: the frame is shown for d + 1 ticks
  nx: number; // next frame, -1 = back to the default action
  dvx: number; // velocity set on entering the frame (x along facing)
  dvy: number;
  dvz: number;
  bdy?: Box[]; // hurt boxes, canvas coords
  atk?: Atk[]; // hit boxes, canvas coords
  bla?: Bla[]; // objects this frame spawns (skill effects, projectiles)
  snd?: string;
  wpn?: Wpn;
  /**
   * 摩摩星 paper-doll layers (sprite 3500): draw the part in slot `part` (10000 body, 20000
   * head, 30000 face, 40000 backpack, 50000 skin) in its action `aid` at (x, y), depth z
   */
  eff?: { part: number; x: number; y: number; z: number; o: number; aid: number }[];
};

/**
 * Weapon point: where a held item sits on this frame (see pipeline/sprite-lib.ts). type 100 hand
 * weapon, 200 heavy object, 500 potion, 900 bow; o = rotation in radians; dx/dy/dz non-zero on the
 * frame that throws it; aid = the item's action to show (0 held, 100 / 110 attack, 300 / 310 bow).
 */
export type Wpn = {
  type: number;
  x: number;
  y: number;
  z: number;
  o: number;
  dx: number;
  dy: number;
  dz: number;
  aid: number;
  facing: number;
};

/**
 * A spawned object: sprite id, canvas-space position on the owner's frame, depth offset, launch
 * velocity (mx along the owner's facing, my, mz; older exports lack it), start frame.
 */
export type Bla = {
  type: number;
  x: number;
  y: number;
  z: number;
  mx?: number;
  my?: number;
  mz?: number;
  aid: number;
  hp?: number;
  facing: number;
};

/** A special move from the .spt `spm` table: inputs, MP cost, optional chain source, target frame. */
export type Move = { keys: string[]; mp: number; from: number; to: number; slot: number };

export type CharData = {
  key: string;
  name: string;
  nameEn: string;
  attrs: {
    id: number;
    /** .spt chr type: 0 character; items 100 weapon, 200 heavy, 300 long weapon, 400 throwable, 500 potion, 600 shield, 900 bow, 1000 arrow */
    type?: number;
    hp: number;
    mp: number;
    walk: number;
    run: number;
    jumpH: number;
    jumpD: number;
    runJumpH: number;
    runJumpD: number;
    weight: number;
  };
  actions: Record<string, number>; // action name -> start frame
  /** action id -> start frame (items: 0 held, 50 sky, 60 ground, 100… attack, 200 thrown) */
  acts?: Record<string, number>;
  /**
   * A frame whose chain ends here (nx = -1) and what the client enters next: the act table's
   * next-action column. 散彈氣功波's wind-up ends at 8202 and continues into its loop at 8210.
   */
  cont?: Record<string, number>;
  moves: Move[];
  frames: Record<string, Frame>;
  pages: string[];
  /** export stamp, appended to page URLs to bust stale caches */
  version?: string;
  /** picture id -> [page, x, y, w, h, offsetX, offsetY] (trimmed image inside the frame canvas) */
  rects: Record<string, [number, number, number, number, number, number, number]>;
};

/** Logical buttons. Directions are absolute (screen); moves resolve F/B against facing. */
export type Button =
  | "left"
  | "right"
  | "up"
  | "down"
  | "attack"
  | "jump"
  | "defend"
  /** take out the item bar's selected item / drop what is in hand (the game layer handles them) */
  | "item"
  | "drop";
export type InputState = Record<Button, boolean>;
export const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  attack: false,
  jump: false,
  defend: false,
  item: false,
  drop: false,
};

export const TICK_HZ = 30;
