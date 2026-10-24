import {
  Application,
  Assets,
  BitmapFont,
  BitmapText,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import type { Fighter } from "./core/fighter";
import { TICK_HZ, type CharData } from "./core/types";
import type { World } from "./core/world";
import { ASSETS } from "@/lib/assets";

export const BASE = `${ASSETS}/game`;

/* ───────── assets ───────── */

/*
  HD art: pipeline/game-hd.ts writes <file>@2x.webp next to atlases, room layers and stages and
  lists them in hd.json. Pixi reads "@2x" as resolution 2, so frame rects stay in original pixels.

  A character page is 4096 × 3166 at 2× — about 50 MB decoded. A driver whose MAX_TEXTURE_SIZE
  is 4096 can hold that page only exactly at its limit, and some make a mess of it: the Mali-G72
  (Kirin 970, driver r18p0) turns one such page into gigabytes of its own memory, so the tab hits
  the OS's low-memory killer and reloads (measured on a BLA-L29: 3.7 GB resident at 2×, 1.1 GB at
  1×, and the crash goes away). So the 2× twin is only used when the GPU has room to spare.
*/
let hdSet: Promise<Set<string>> | null = null;
function hdFiles() {
  hdSet ??= fetch(`${BASE}/hd.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
    .then((a) => new Set(a))
    .catch(() => new Set<string>());
  return hdSet;
}

/** The GPU's largest texture edge, or 0 when WebGL is unavailable (jsdom, a locked-down browser). */
function maxTextureSize() {
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl2") ??
    canvas.getContext("webgl")) as WebGLRenderingContext | null;
  if (!gl) return 0;
  const size = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  // a phone keeps only a handful of live contexts: let this probe's go
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return size;
}

/** 2× pages are 4096 px wide; only a driver that can hold twice that is given one. */
const HD_MIN_TEXTURE = 8192;

let hdAllowed: boolean | null = null;
function hdEnabled() {
  hdAllowed ??= typeof document !== "undefined" && maxTextureSize() >= HD_MIN_TEXTURE;
  return hdAllowed;
}

/** URL of an asset under /assets/game, preferring its 2× HD twin when the GPU can hold it. */
export async function gameArt(rel: string) {
  return hdEnabled() && (await hdFiles()).has(rel)
    ? `${BASE}/${rel.replace(/\.(png|webp)$/, "@2x.webp")}`
    : `${BASE}/${rel}`;
}

/** Loads a texture, making sure an @2x file is treated as resolution 2 (original-size layout). */
export async function loadArt(rel: string, version?: string) {
  const url = (await gameArt(rel)) + (version ? `?v=${version}` : "");
  const tex = await Assets.load<Texture>(url);
  if (url.includes("@2x") && tex.source.resolution !== 2) tex.source.resolution = 2;
  return tex;
}

export type CharAssets = {
  data: CharData;
  textures: Map<number, Texture>;
  /** a paper doll (the 摩摩星): the part worn in each layer slot, drawn by the frames' eff rows */
  layers?: Map<number, CharAssets>;
};
const charCache = new Map<string, Promise<CharAssets>>();
const dataCache = new Map<string, Promise<CharData>>();

export const loadChar = (key: string) => loadSprite(`chars/${key}`);

let charIndex: Promise<{ key: string; id: number }[]> | null = null;
/** 異轉: the transformed form of a character (base id + 7000), or null when it has none. */
export async function loadForm(id: number): Promise<CharAssets | null> {
  if (id >= 7000) return null;
  charIndex ??= fetch(`${BASE}/chars/index.json`).then((r) => (r.ok ? r.json() : []));
  const form = (await charIndex).find((c) => c.id === id + 7000);
  return form ? loadChar(form.key) : null;
}

/** Loads any exported sprite: "chars/<key>" for playable characters, "sprites/<id>" for everything else. */
export function loadSprite(path: string): Promise<CharAssets> {
  let p = charCache.get(path);
  if (!p && path.startsWith("momo:")) {
    // a 摩摩星 in an outfit (game/momo.ts): the base creature with its five parts as layers
    p = (async () => {
      const ids = path.slice(5).split(",").map(Number);
      const [base, ...parts] = await Promise.all([
        loadSprite("sprites/3500"),
        ...ids.map((id) => loadSprite(`sprites/${id}`).catch(() => null)),
      ]);
      const layers = new Map<number, CharAssets>();
      ids.forEach((id, i) => {
        const part = parts[i];
        if (part) layers.set(Math.floor(id / 10000) * 10000, part);
      });
      return { ...base, layers };
    })();
    charCache.set(path, p);
    p.catch(() => charCache.delete(path));
    return p;
  }
  if (!p) {
    p = loadData(path).then((data) => cachedAtlas(path, data));
    charCache.set(path, p);
    p.catch(() => charCache.delete(path));
  }
  return p;
}

/**
 * Frame data alone, without its atlas. A skill's effects are preloaded from the frames that
 * spawn them (`bla` rows), and one character can name dozens of them: 星奇's list is fifteen
 * sheets whose pages decode to 787 MB, which a phone cannot hold. The data is what the tick
 * needs — a few hundred KB of JSON — so that is fetched ahead; the pictures follow on first use.
 */
export function loadData(path: string): Promise<CharData> {
  let p = dataCache.get(path);
  if (!p) {
    p = fetch(`${BASE}/${path}.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`no sprite data for ${path}`);
      return r.json() as Promise<CharData>;
    });
    dataCache.set(path, p);
    p.catch(() => dataCache.delete(path));
  }
  return p;
}

/**
 * The atlas for frame data already in hand (the counterpart of `loadData`). Shares `charCache`
 * with `loadSprite`, so a sprite fetched both ways is still decoded once.
 */
export function atlasFor(path: string, data: CharData): Promise<CharAssets> {
  let p = charCache.get(path);
  if (!p) {
    p = cachedAtlas(path, data);
    charCache.set(path, p);
    p.catch(() => charCache.delete(path));
  }
  return p;
}

/** Decodes the pages of `data` into a texture per picture rect (no cache: see `atlasFor`). */
function cachedAtlas(path: string, data: CharData): Promise<CharAssets> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  return Promise.all(data.pages.map((f) => loadArt(`${dir}/${f}`, data.version))).then((pages) => {
    for (const pg of pages) pg.source.scaleMode = "linear";
    const textures = new Map<number, Texture>();
    for (const [pid, [page, x, y, w, h]] of Object.entries(data.rects))
      textures.set(
        Number(pid),
        new Texture({ source: pages[page].source, frame: new Rectangle(x, y, w, h) }),
      );
    return { data, textures };
  });
}

export type StageArt = { url: string; width: number; height: number };
export async function loadStage(name: string): Promise<StageArt> {
  const meta = (await fetch(`${BASE}/stages/${name}.json`, { cache: "no-cache" }).then((r) =>
    r.json(),
  )) as {
    width: number;
    height: number;
  };
  return { url: `${BASE}/stages/${name}.webp`, ...meta };
}

/* ───────── element overlays (the client's shared effect sheet, chars/effect) ───────── */

let statusSheet: CharAssets | null = null;
let statusSheetLoading: Promise<void> | null = null;
function loadStatusSheet() {
  statusSheetLoading ??= loadChar("effect")
    .then((a) => {
      statusSheet = a;
    })
    .catch(() => {
      // no sheet: elements still work, just without their overlays
    });
  return statusSheetLoading;
}

type Loop = { p: number; cx: number; cy: number; ticks: number }[];
const loops = new Map<string, Loop>();
/** An action of the effect sheet as a list of frames, following nx until it comes back round. */
function loopOf(action: string): Loop | null {
  const sheet = statusSheet;
  if (!sheet) return null;
  let l = loops.get(action);
  if (l) return l;
  l = [];
  const start = sheet.data.actions[action];
  let id = start;
  for (let n = 0; n < 32 && id !== undefined; n++) {
    const f = sheet.data.frames[String(id)];
    if (!f) break;
    l.push({ p: f.p, cx: f.cx, cy: f.cy, ticks: f.d + 1 });
    if (f.nx === start || f.nx === id || f.nx <= 0) break;
    id = f.nx;
  }
  loops.set(action, l);
  return l;
}
/** what is drawn over a fighter in each element, base layer and the layer in front */
const OVERLAY: [kind: "stone" | "freeze" | "burn" | "shock", base: string, top: string][] = [
  ["stone", "ROCK", "ROCKTOP"],
  ["freeze", "ICE", "ICETOP"],
  ["burn", "FIRE", "FIRETOP"],
  ["shock", "THUNDER", "THUNDERTOP"],
];
/** body centre above the feet, where the element overlays and the dizzy ring hang */
const BODY_MID = 45;
const HEAD = 100;

/* ───────── damage numbers: digits rasterised once, never text at hit time ───────── */

const DMG_FONT = { hit: "lfo-damage", block: "lfo-damage-blocked" };
let damageFonts: Promise<void> | null = null;
/**
 * Installs the two bitmap fonts the damage numbers use (white 30 px, blue 20 px, both with a
 * black stroke). A Pixi Text would rasterise a fresh canvas and upload a texture on every hit;
 * these ten glyphs per font are drawn once and shared.
 */
function installDamageFonts() {
  damageFonts ??= (async () => {
    // give the web font a moment to arrive so the glyphs are not baked in the fallback face
    await Promise.race([
      document.fonts.load("italic 900 30px Satoshi").catch(() => undefined),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    const style = (fontSize: number, fill: number) => ({
      fontFamily: "Satoshi, Noto Sans TC, sans-serif",
      fontWeight: "900" as const,
      fontStyle: "italic" as const,
      fontSize,
      fill,
      stroke: { color: 0x000000, width: 5 },
    });
    const chars = "0123456789";
    BitmapFont.install({ name: DMG_FONT.hit, style: style(30, 0xffffff), chars, resolution: 2 });
    BitmapFont.install({ name: DMG_FONT.block, style: style(20, 0x9fd0ff), chars, resolution: 2 });
  })();
  return damageFonts;
}

/* ───────── one fighter on screen ───────── */

/** The frame being drawn: how far (0 … 1) the clock is between tick `tick` and the next. */
export type Frame = { alpha: number; tick: number };

type Pos = { x: number; y: number; z: number };
/** a move larger than this in one tick is a teleport (door, reset, spawn): drawn without a slide */
const SNAP = 160;

/** Textures every fighter shares, generated once per scene by the renderer. */
type SceneKit = { shadow: Texture; sparks: { hit: Texture[]; block: Texture[] } };

export class FighterView extends Container {
  private readonly shadow: Sprite;
  private readonly body = new Sprite();
  // a paper doll's part layers, reused frame to frame
  private readonly parts: Sprite[] = [];
  // the frame anchor (cx, cy): mirrored by facing and turned by a carried item's angle
  private readonly rig = new Container();
  // HP / MP / SP under the feet, as the client draws them for every enemy: stretched white pixels
  private readonly bars = new Container();
  private readonly barBack: Sprite;
  private readonly barRows: Sprite[];
  // an element's overlay (ice, fire, thunder, stone) and the ring over a dizzy head
  private readonly aura = new Sprite();
  private readonly auraTop = new Sprite();
  private readonly ring = new Sprite();
  // the engine moves at TICK_HZ; frames in between draw the fighter between its last two ticks
  private prev: Pos;
  private cur: Pos;
  private seen = -1;
  /** where the fighter is drawn this frame */
  rx: number;
  ry: number;
  rz: number;

  constructor(
    readonly fighter: Fighter,
    private readonly assets: CharAssets,
    kit: SceneKit,
  ) {
    super();
    this.shadow = new Sprite(kit.shadow);
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x000000;
    const pixel = (tint: number, alpha = 1) => {
      const s = new Sprite(Texture.WHITE);
      s.tint = tint;
      s.alpha = alpha;
      return s;
    };
    this.barBack = pixel(0x000000, 0.55);
    this.barRows = [pixel(0xff0000), pixel(0x0000ff), pixel(0xffffff)];
    this.bars.addChild(this.barBack, ...this.barRows);
    this.rig.addChild(this.body);
    this.addChild(this.shadow, this.rig, this.aura, this.auraTop, this.ring, this.bars);
    this.prev = this.cur = { x: fighter.x, y: fighter.y, z: fighter.z };
    this.rx = fighter.x;
    this.ry = fighter.y;
    this.rz = fighter.z;
    void loadStatusSheet();
  }

  /** Note the position the tick left the fighter at and pick where to draw it this frame. */
  private interpolate(frame?: Frame) {
    const f = this.fighter;
    if (!frame) {
      this.rx = f.x;
      this.ry = f.y;
      this.rz = f.z;
      return;
    }
    if (frame.tick !== this.seen) {
      const first = this.seen < 0;
      this.seen = frame.tick;
      this.prev = this.cur;
      this.cur = { x: f.x, y: f.y, z: f.z };
      const p = this.prev;
      if (
        first ||
        Math.abs(this.cur.x - p.x) > SNAP ||
        Math.abs(this.cur.y - p.y) > SNAP ||
        Math.abs(this.cur.z - p.z) > SNAP
      )
        this.prev = this.cur;
    }
    const a = frame.alpha;
    const { prev, cur } = this;
    this.rx = prev.x + (cur.x - prev.x) * a;
    this.ry = prev.y + (cur.y - prev.y) * a;
    this.rz = prev.z + (cur.z - prev.z) * a;
  }

  /** Place frame `t` of an effect-sheet loop with its anchor at (x, y). */
  private place(s: Sprite, action: string | null, x: number, y: number) {
    const l = action ? loopOf(action) : null;
    const sheet = statusSheet;
    if (!l?.length || !sheet) {
      s.visible = false;
      return;
    }
    const total = l.reduce((n, f) => n + f.ticks, 0);
    let t = Math.floor(performance.now() / (1000 / 30)) % total;
    let f = l[0];
    for (const g of l) {
      if (t < g.ticks) {
        f = g;
        break;
      }
      t -= g.ticks;
    }
    const rect = sheet.data.rects[String(f.p)];
    const tex = sheet.textures.get(f.p);
    if (!rect || !tex) {
      s.visible = false;
      return;
    }
    s.visible = true;
    s.texture = tex;
    s.position.set(x + rect[5] - f.cx, y + rect[6] - f.cy);
  }

  private syncStatus() {
    const f = this.fighter;
    const kind = OVERLAY.find(([k]) => f.status.has(k));
    const mid = this.rz + this.ry - BODY_MID;
    this.place(this.aura, kind?.[1] ?? null, this.rx, mid);
    this.place(this.auraTop, kind?.[2] ?? null, this.rx, mid);
    this.aura.alpha = this.auraTop.alpha = kind?.[0] === "freeze" ? 0.85 : 1;
    this.place(
      this.ring,
      f.anim === "DIZZY" ? "DIZZYRING" : null,
      this.rx,
      this.rz + this.ry - HEAD,
    );
    // poison shows on the skin
    this.body.tint = f.status.has("poison") ? 0xb8ffb0 : 0xffffff;
  }

  /** A paper doll's frame: each eff layer is its slot's part in that action, nearest last. */
  private syncLayers() {
    const f = this.fighter;
    const layers = [...(f.frame.eff ?? [])].sort((a, b) => a.z - b.z);
    let n = 0;
    for (const l of layers) {
      const part = this.assets.layers?.get(l.part);
      if (!part) continue;
      const pf = part.data.acts?.[String(l.aid)] ?? part.data.acts?.["0"] ?? 0;
      const frame = part.data.frames[String(pf)] ?? part.data.frames["0"];
      const rect = frame && part.data.rects[String(frame.p)];
      const tex = frame && part.textures.get(frame.p);
      if (!frame || !rect || !tex) continue;
      let s = this.parts[n];
      if (!s) {
        s = new Sprite();
        this.parts.push(s);
        this.rig.addChild(s);
      }
      s.visible = true;
      s.texture = tex;
      s.rotation = l.o;
      // the doll's own frame anchor moves every layer (its idle bob), as a picture's would
      s.position.set(l.x - f.frame.cx + rect[5] - frame.cx, l.y - f.frame.cy + rect[6] - frame.cy);
      this.rig.setChildIndex(s, this.rig.children.length - 1);
      n++;
    }
    for (let i = n; i < this.parts.length; i++) this.parts[i].visible = false;
    return n > 0;
  }

  sync(frame?: Frame) {
    this.interpolate(frame);
    const f = this.fighter;
    const fr = f.frame;
    if (this.assets.layers) {
      const drawn = !f.hidden && this.syncLayers();
      this.body.visible = false;
      this.rig.visible = drawn;
      this.shadow.visible = drawn;
      if (!drawn) return;
      // the doll is drawn where the tick was interpolated to, like a picture's frame below
      this.rig.position.set(this.rx, this.rz + this.ry);
      this.rig.scale.x = f.facing;
      this.shadow.position.set(this.rx, this.rz);
      this.drawBars();
      this.syncStatus();
      this.zIndex = this.rz;
      return;
    }
    const rect = this.assets.data.rects[String(fr.p)];
    const tex = this.assets.textures.get(fr.p);
    if (!rect || !tex || f.hidden) {
      this.rig.visible = false;
      this.shadow.visible = false;
      this.bars.visible = false;
      this.aura.visible = this.auraTop.visible = this.ring.visible = false;
      return;
    }
    const [, , , , , ox, oy] = rect;
    const { rx, ry, rz } = this;
    this.rig.visible = true;
    this.body.texture = tex;
    this.body.position.set(ox - fr.cx, oy - fr.cy);
    this.rig.position.set(rx, rz + ry);
    this.rig.scale.x = f.facing;
    // Pixi scales before it rotates, so a mirrored item turns the other way
    this.rig.rotation = f.angle * f.facing;
    // the shadow stays on the floor and shrinks with height
    const lift = Math.min(1, -ry / 200);
    this.shadow.visible = !f.effect && f.itemState !== "held";
    this.shadow.position.set(rx, rz);
    this.shadow.scale.set((1 - lift * 0.5) * (f.isItem ? 0.5 : 1));
    this.shadow.alpha = SHADOW_ALPHA * (1 - lift * 0.6);
    this.drawBars();
    this.syncStatus();
    this.zIndex = rz;
  }

  private drawBars() {
    const f = this.fighter;
    const show = f.showBars && !f.dead && f.hp > 0;
    this.bars.visible = show;
    if (!show) return;
    const x = Math.round(this.rx - BAR_W / 2);
    const y = Math.round(this.rz + 8);
    this.barBack.position.set(x - 1, y - 1);
    this.barBack.width = BAR_W + 2;
    this.barBack.height = this.barRows.length * 3 + 1;
    const ratios = [f.hp / Math.max(1, f.maxHp), f.mp / Math.max(1, f.maxMp), 1];
    this.barRows.forEach((s, i) => {
      const w = Math.max(0, Math.min(1, ratios[i])) * BAR_W;
      s.visible = w > 0;
      if (w <= 0) return;
      s.position.set(x, y + i * 3);
      s.width = w;
      s.height = 2;
    });
  }
}

/** HP / MP / SP bars under an enemy: 32 px wide, 2 px tall, 1 px apart, on the floor below its feet. */
const BAR_W = 32;
const SHADOW_ALPHA = 0.35;

/* ───────── scene ───────── */

export type SceneOptions = {
  stage?: StageArt;
  /** showcase = a single fighter, big and centred, no floor (select screen) */
  showcase?: { scale: number; anchorX: number; floorY: number };
  /** externally driven camera (story rooms): world x at the left edge, world units per screen height */
  camera?: () => { x: number; height: number };
};

/** a camera move larger than this in one tick is a cut (a door, a script), not a pan */
const CAMERA_SNAP = 400;

export class Scene {
  readonly app = new Application();
  protected readonly world = new Container({ sortableChildren: true });
  protected readonly actors = new Container({ sortableChildren: true });
  private readonly fx = new Container();
  private views = new Map<number, FighterView>();
  private kit: SceneKit | null = null;
  protected shake = 0;
  private camX = 0;
  // the external camera moves per tick like the fighters: drawn between its last two positions
  private cam = { prev: 0, cur: 0, seen: -1, x: 0 };
  // door transitions: a zoom about a world point and a veil over the picture
  private zoom = { k: 1, x: 0, y: 0 };
  private readonly veil = new Graphics();
  private doorTween: {
    from: { k: number; v: number };
    to: { k: number; v: number };
    t0: number;
    ms: number;
    done: () => void;
  } | null = null;
  protected ready: Promise<void>;
  protected destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly opts: SceneOptions = {},
  ) {
    void installDamageFonts();
    this.ready = this.init();
  }

  private async init() {
    await this.app.init({
      resizeTo: this.host,
      // the picture fills the view, so the canvas can be opaque: no blending with the page
      // behind it when the browser composites (the showcase floats over the select screen)
      background: 0x000000,
      backgroundAlpha: this.opts.showcase ? 0 : 1,
      // sprites and HD art are textured quads: MSAA smooths no edge they have and costs the GPU
      // a multisampled canvas every frame
      antialias: false,
      resolution: Math.min(devicePixelRatio, 2),
      autoDensity: true,
      powerPreference: "high-performance",
      // draw() renders at the end of the game loop's own animation frame, after the fighters
      // are placed, instead of Pixi's ticker racing it on a second one
      autoStart: false,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.kit = this.makeKit();
    this.veil.alpha = 0;
    this.app.stage.addChild(this.world, this.veil);
    if (this.opts.stage) {
      const tex = await loadArt(this.opts.stage.url.slice(BASE.length + 1));
      this.world.addChild(new Sprite(tex));
    }
    this.world.addChild(this.actors, this.fx);
  }

  /** Shared textures: a soft shadow ellipse and a few spark bursts in each colour, drawn once. */
  private makeKit(): SceneKit {
    const bake = (g: Graphics) => {
      const t = this.app.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
      g.destroy();
      return t;
    };
    const shadow = bake(new Graphics().ellipse(30, 8, 30, 8).fill(0xffffff));
    const burst = (color: number) => {
      const g = new Graphics();
      for (let i = 0; i < 7; i++) {
        const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.4;
        const r = 18 + Math.random() * 16;
        g.moveTo(0, 0).lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.stroke({ color, width: 3, alpha: 0.95 });
      g.circle(0, 0, 9).fill({ color: 0xffffff, alpha: 0.9 });
      return bake(g);
    };
    const variants = (color: number) => Array.from({ length: 4 }, () => burst(color));
    return { shadow, sparks: { hit: variants(0xfff1a8), block: variants(0x9fd0ff) } };
  }

  async add(f: Fighter, assets: CharAssets) {
    await this.ready;
    if (this.destroyed || !this.kit) return;
    const v = new FighterView(f, assets, this.kit);
    this.views.set(f.id, v);
    this.actors.addChild(v);
  }

  remove(f: Fighter) {
    const v = this.views.get(f.id);
    if (v) {
      v.destroy();
      this.views.delete(f.id);
    }
  }

  /** Where a fighter is drawn this frame (between its last two ticks), for overlays in the DOM. */
  renderPos(f: Fighter): Pos {
    const v = this.views.get(f.id);
    return v ? { x: v.rx, y: v.ry, z: v.rz } : { x: f.x, y: f.y, z: f.z };
  }

  /** World x at the left edge of the screen as drawn this frame (external camera scenes). */
  get cameraX() {
    return this.cam.x;
  }

  private smoothCamera(x: number, frame?: Frame) {
    const c = this.cam;
    if (!frame) return (c.x = x);
    if (frame.tick !== c.seen) {
      const first = c.seen < 0;
      c.seen = frame.tick;
      c.prev = c.cur;
      c.cur = x;
      if (first || Math.abs(x - c.prev) > CAMERA_SNAP) c.prev = x;
    }
    return (c.x = c.prev + (c.cur - c.prev) * frame.alpha);
  }

  /**
   * Draw the world and render the frame; `focus` is the fighter the camera follows. `frame`
   * (from runLoop) places everything between the last tick and the next; without it the
   * fighters are drawn exactly where the engine has them.
   */
  draw(focus?: Fighter, frame?: Frame) {
    if (this.destroyed || !this.app.renderer) return;
    for (const v of this.views.values()) v.sync(frame);
    const { width: sw, height: sh } = this.app.screen;
    const show = this.opts.showcase;
    if (show) {
      this.world.scale.set(show.scale);
      const v = (focus && this.views.get(focus.id)) ?? this.views.values().next().value;
      this.world.position.set(
        sw * show.anchorX - (v?.rx ?? 0) * show.scale,
        sh * show.floorY - (v?.rz ?? 0) * show.scale,
      );
    } else if (this.opts.camera) {
      const c = this.opts.camera();
      const cx = this.smoothCamera(c.x, frame);
      const s = sh / c.height;
      this.stepTween(sw, sh);
      // zoomed about a world point that stays where it is on screen
      const { k, x: zx, y: zy } = this.zoom;
      this.world.scale.set(s * k);
      this.world.position.set((zx - cx) * s - zx * s * k, zy * s - zy * s * k);
      this.layout(cx);
    } else if (this.opts.stage) {
      const s = sh / this.opts.stage.height;
      this.world.scale.set(s);
      const fx = focus ? (this.views.get(focus.id)?.rx ?? focus.x) : null;
      const target = fx !== null ? fx * s - sw / 2 : 0;
      const max = Math.max(0, this.opts.stage.width * s - sw);
      this.camX += (Math.min(max, Math.max(0, target)) - this.camX) * 0.12;
      this.world.position.set(-this.camX, 0);
    }
    if (this.shake > 0.1) {
      this.world.x += (Math.random() - 0.5) * this.shake;
      this.world.y += (Math.random() - 0.5) * this.shake;
      this.shake *= 0.82;
    }
    // one ticker step: the effect tweens, then Pixi's render of the stage
    this.app.ticker.update(performance.now());
  }

  /**
   * Door transition: zoom about a world point from the current zoom to `k` while the veil goes
   * to `veil` (0 clear … 1 opaque), over `ms`. Resolves when it is there.
   */
  zoomTo(x: number, y: number, k: number, veil: number, ms: number) {
    this.zoom.x = x;
    this.zoom.y = y;
    const from = { k: this.zoom.k, v: this.veil.alpha };
    return new Promise<void>((done) => {
      this.doorTween?.done();
      this.doorTween = { from, to: { k, v: veil }, t0: performance.now(), ms, done };
    });
  }

  private stepTween(sw: number, sh: number) {
    const t = this.doorTween;
    if (this.veil.width !== sw || this.veil.height !== sh)
      this.veil.clear().rect(0, 0, sw, sh).fill(0x06080c);
    if (!t) return;
    const p = Math.min(1, (performance.now() - t.t0) / t.ms);
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // ease in-out
    this.zoom.k = t.from.k + (t.to.k - t.from.k) * e;
    this.veil.alpha = t.from.v + (t.to.v - t.from.v) * e;
    if (p >= 1) {
      this.doorTween = null;
      t.done();
    }
  }

  /** Hook for subclasses that place scenery against the camera (parallax). */
  protected layout(_camX: number) {}

  /* ───────── effects ───────── */

  spark(x: number, y: number, blocked: boolean) {
    const set = blocked ? this.kit?.sparks.block : this.kit?.sparks.hit;
    if (!set?.length) return;
    const s = new Sprite(set[Math.floor(Math.random() * set.length)]);
    s.anchor.set(0.5);
    s.rotation = Math.random() * Math.PI * 2;
    s.position.set(x, y);
    this.fx.addChild(s);
    this.tween(s, 180, (k) => {
      s.scale.set(0.6 + k * 0.9);
      s.alpha = 1 - k;
    });
  }

  damage(x: number, y: number, amount: number, blocked: boolean) {
    const t = new BitmapText({
      text: `${amount}`,
      style: {
        fontFamily: blocked ? DMG_FONT.block : DMG_FONT.hit,
        fontSize: blocked ? 20 : 30,
        fill: blocked ? 0x9fd0ff : 0xffffff,
      },
    });
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() - 0.5) * 20, y - 20);
    this.fx.addChild(t);
    this.tween(t, 700, (k) => {
      t.y -= 1.2;
      t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      t.scale.set(k < 0.12 ? 1.6 - k * 5 : 1);
    });
  }

  quake(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  private tween(obj: Container, ms: number, fn: (k: number) => void) {
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      fn(k);
      if (k >= 1) {
        this.app.ticker?.remove(tick);
        obj.destroy();
      }
    };
    this.app.ticker.add(tick);
  }

  destroy() {
    this.destroyed = true;
    void this.ready.then(() => {
      if (this.kit) {
        this.kit.shadow.destroy(true);
        for (const t of [...this.kit.sparks.hit, ...this.kit.sparks.block]) t.destroy(true);
        this.kit = null;
      }
      if (this.app.renderer) this.app.destroy(true, { children: true });
    });
  }
}

/* ───────── fixed-step loop ───────── */

/**
 * Runs `step` at TICK_HZ and `draw` once per animation frame, telling it how far the clock is
 * into the current tick so the view can place things between ticks. Returns a stop function.
 */
export function runLoop(world: World, step: () => void, draw: (frame: Frame) => void) {
  const dt = 1000 / TICK_HZ;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    acc += Math.min(250, now - last);
    last = now;
    while (acc >= dt) {
      step();
      acc -= dt;
    }
    draw({ alpha: acc / dt, tick: world.tick });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
