// Story data exported by pipeline/stories.ts (data/assets/game/stories/<key>.json).

export type Layer = {
  img: string;
  x: number;
  y: number;
  z: number; // depth: sorts against actors; screen y = y + z
  ratio: number; // parallax factor
  span: number; // repeat count
  step: number; // repeat spacing
  dy: number;
  fn: number;
  portal: number;
  object: boolean;
  /** an animated object (a .spt: shopkeeper, cloud …): its exported sprite, played in place */
  sprite?: string;
  /** a stitched strip's parallax layer is drawn only over its own room (strip x range) */
  clip?: [number, number];
};

export type Room = {
  name: string;
  width: number;
  upper: number; // walkable floor, depth range
  lower: number;
  friction: number;
  layers: Layer[];
  entries: { link: number; x: number; z: number }[];
  exits: { link: number; x: number; z: number; w: number; h: number; dir: number }[];
  walls: [number, number][][];
};

export type GroupMember = {
  sprite: number;
  level: number;
  qty: number;
  exp: number;
  hpMul: number;
  team: number;
};

export type DialogueLine = { sprite: number; face: number; text: string; portrait: string | null };

export type Command = [string, ...(string | number)[]];

export type StoryData = {
  /** the stage's loot table (.sty itm rows): sprite / item id and drop weight */
  loot?: { sprite: number; p: number }[];
  key: string;
  area: string;
  mapId: number;
  /** the stage's own music (.sty bgm row); scripts may change it */
  bgm?: string | null;
  start: { bg: number; x: number; facing: number };
  rooms: Record<string, Room>;
  links: Record<string, { link: number; toBg: number; toLink: number }[]>;
  groups: Record<string, GroupMember[]>;
  /** [bg, phase, type, ...args] — see EVENT in director.ts */
  events: number[][];
  scripts: { file: string; cmds: Command[] }[];
  dialogue: Record<string, DialogueLine[]>;
  sprites: Record<string, string | null>; // sprite id -> asset path
  names: Record<string, string>;
};
