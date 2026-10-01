import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
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
*/
let hdSet: Promise<Set<string>> | null = null;
function hdFiles() {
  hdSet ??= fetch(`${BASE}/hd.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
    .then((a) => new Set(a))
    .catch(() => new Set<string>());
  return hdSet;
}

/** URL of an asset under /assets/game, preferring its 2× HD twin when the pipeline made one. */
export async function gameArt(rel: string) {
  return (await hdFiles()).has(rel)
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

export type CharAssets = { data: CharData; textures: Map<number, Texture> };
const charCache = new Map<string, Promise<CharAssets>>();

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
  if (!p) {
    const dir = path.slice(0, path.lastIndexOf("/"));
    p = (async () => {
      const data = (await fetch(`${BASE}/${path}.json`, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`no sprite data for ${path}`);
        return r.json();
      })) as CharData;
      const pages = await Promise.all(data.pages.map((f) => loadArt(`${dir}/${f}`, data.version)));
      for (const pg of pages) pg.source.scaleMode = "linear";
      const textures = new Map<number, Texture>();
      for (const [pid, [page, x, y, w, h]] of Object.entries(data.rects))
        textures.set(
          Number(pid),
          new Texture({ source: pages[page].source, frame: new Rectangle(x, y, w, h) }),
        );
      return { data, textures };
    })();
    charCache.set(path, p);
    p.catch(() => charCache.delete(path));
  }
  return p;
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

/* ───────── one fighter on screen ───────── */

export class FighterView extends Container {
  private readonly shadow = new Graphics()
    .ellipse(0, 0, 30, 8)
    .fill({ color: 0x000000, alpha: 0.35 });
  private readonly body = new Sprite();
  // the frame anchor (cx, cy): mirrored by facing and turned by a carried item's angle
  private readonly rig = new Container();
  // HP / MP / SP under the feet, as the client draws them for every enemy
  private readonly bars = new Graphics();
  // an element's overlay (ice, fire, thunder, stone) and the ring over a dizzy head
  private readonly aura = new Sprite();
  private readonly auraTop = new Sprite();
  private readonly ring = new Sprite();

  constructor(
    readonly fighter: Fighter,
    private readonly assets: CharAssets,
  ) {
    super();
    this.rig.addChild(this.body);
    this.addChild(this.shadow, this.rig, this.aura, this.auraTop, this.ring, this.bars);
    void loadStatusSheet();
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
    const mid = f.z + f.y - BODY_MID;
    this.place(this.aura, kind?.[1] ?? null, f.x, mid);
    this.place(this.auraTop, kind?.[2] ?? null, f.x, mid);
    this.aura.alpha = this.auraTop.alpha = kind?.[0] === "freeze" ? 0.85 : 1;
    this.place(this.ring, f.anim === "DIZZY" ? "DIZZYRING" : null, f.x, f.z + f.y - HEAD);
    // poison shows on the skin
    this.body.tint = f.status.has("poison") ? 0xb8ffb0 : 0xffffff;
  }

  sync() {
    const f = this.fighter;
    const fr = f.frame;
    const rect = this.assets.data.rects[String(fr.p)];
    const tex = this.assets.textures.get(fr.p);
    if (!rect || !tex || f.hidden) {
      this.rig.visible = false;
      this.shadow.visible = false;
      this.aura.visible = this.auraTop.visible = this.ring.visible = false;
      return;
    }
    const [, , , , , ox, oy] = rect;
    this.rig.visible = true;
    this.body.texture = tex;
    this.body.position.set(ox - fr.cx, oy - fr.cy);
    this.rig.position.set(f.x, f.z + f.y);
    this.rig.scale.x = f.facing;
    // Pixi scales before it rotates, so a mirrored item turns the other way
    this.rig.rotation = f.angle * f.facing;
    // the shadow stays on the floor and shrinks with height
    const lift = Math.min(1, -f.y / 200);
    this.shadow.visible = !f.effect && f.itemState !== "held";
    this.shadow.position.set(f.x, f.z);
    this.shadow.scale.set((1 - lift * 0.5) * (f.isItem ? 0.5 : 1));
    this.shadow.alpha = 1 - lift * 0.6;
    this.drawBars();
    this.syncStatus();
    this.zIndex = f.z;
  }

  private drawBars() {
    const f = this.fighter;
    const g = this.bars;
    g.clear();
    if (!f.showBars || f.dead || f.hp <= 0) return;
    const x = Math.round(f.x - BAR_W / 2);
    const y = Math.round(f.z + 8);
    const rows: [number, number][] = [
      [f.hp / Math.max(1, f.maxHp), 0xff0000],
      [f.mp / Math.max(1, f.maxMp), 0x0000ff],
      [1, 0xffffff],
    ];
    g.rect(x - 1, y - 1, BAR_W + 2, rows.length * 3 + 1).fill({ color: 0x000000, alpha: 0.55 });
    rows.forEach(([ratio, color], i) => {
      const w = Math.max(0, Math.min(1, ratio)) * BAR_W;
      if (w > 0) g.rect(x, y + i * 3, w, 2).fill({ color });
    });
  }
}

/** HP / MP / SP bars under an enemy: 32 px wide, 2 px tall, 1 px apart, on the floor below its feet. */
const BAR_W = 32;

/* ───────── scene ───────── */

export type SceneOptions = {
  stage?: StageArt;
  /** showcase = a single fighter, big and centred, no floor (select screen) */
  showcase?: { scale: number; anchorX: number; floorY: number };
  /** externally driven camera (story rooms): world x at the left edge, world units per screen height */
  camera?: () => { x: number; height: number };
};

export class Scene {
  readonly app = new Application();
  protected readonly world = new Container({ sortableChildren: true });
  protected readonly actors = new Container({ sortableChildren: true });
  private readonly fx = new Container();
  private views = new Map<number, FighterView>();
  protected shake = 0;
  private camX = 0;
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
    this.ready = this.init();
  }

  private async init() {
    await this.app.init({
      resizeTo: this.host,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(devicePixelRatio, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.veil.alpha = 0;
    this.app.stage.addChild(this.world, this.veil);
    if (this.opts.stage) {
      const tex = await loadArt(this.opts.stage.url.slice(BASE.length + 1));
      this.world.addChild(new Sprite(tex));
    }
    this.world.addChild(this.actors, this.fx);
  }

  async add(f: Fighter, assets: CharAssets) {
    await this.ready;
    if (this.destroyed) return;
    const v = new FighterView(f, assets);
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

  /** Draw the world; `focus` is the fighter the camera follows. */
  draw(focus?: Fighter) {
    if (this.destroyed || !this.app.renderer) return;
    for (const v of this.views.values()) v.sync();
    const { width: sw, height: sh } = this.app.screen;
    const show = this.opts.showcase;
    if (show) {
      this.world.scale.set(show.scale);
      const f = focus ?? [...this.views.values()][0]?.fighter;
      this.world.position.set(
        sw * show.anchorX - (f?.x ?? 0) * show.scale,
        sh * show.floorY - (f?.z ?? 0) * show.scale,
      );
    } else if (this.opts.camera) {
      const c = this.opts.camera();
      const s = sh / c.height;
      this.stepTween(sw, sh);
      // zoomed about a world point that stays where it is on screen
      const { k, x: zx, y: zy } = this.zoom;
      this.world.scale.set(s * k);
      this.world.position.set((zx - c.x) * s - zx * s * k, zy * s - zy * s * k);
      this.layout(c.x);
    } else if (this.opts.stage) {
      const s = sh / this.opts.stage.height;
      this.world.scale.set(s);
      const target = focus ? focus.x * s - sw / 2 : 0;
      const max = Math.max(0, this.opts.stage.width * s - sw);
      this.camX += (Math.min(max, Math.max(0, target)) - this.camX) * 0.12;
      this.world.position.set(-this.camX, 0);
    }
    if (this.shake > 0.1) {
      this.world.x += (Math.random() - 0.5) * this.shake;
      this.world.y += (Math.random() - 0.5) * this.shake;
      this.shake *= 0.82;
    }
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
    const g = new Graphics();
    const color = blocked ? 0x9fd0ff : 0xfff1a8;
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.4;
      const r = 18 + Math.random() * 16;
      g.moveTo(0, 0).lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.stroke({ color, width: 3, alpha: 0.95 });
    g.circle(0, 0, 9).fill({ color: 0xffffff, alpha: 0.9 });
    g.position.set(x, y);
    this.fx.addChild(g);
    this.tween(g, 180, (k) => {
      g.scale.set(0.6 + k * 0.9);
      g.alpha = 1 - k;
    });
  }

  damage(x: number, y: number, amount: number, blocked: boolean) {
    const t = new Text({
      text: blocked ? `${amount}` : `${amount}`,
      style: {
        fontFamily: "Satoshi, Noto Sans TC, sans-serif",
        fontWeight: "900",
        fontStyle: "italic",
        fontSize: blocked ? 20 : 30,
        fill: blocked ? 0x9fd0ff : 0xffffff,
        stroke: { color: 0x000000, width: 5 },
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
      if (this.app.renderer) this.app.destroy(true, { children: true });
    });
  }
}

/* ───────── fixed-step loop ───────── */

/** Runs `step` at TICK_HZ and `draw` once per animation frame. Returns a stop function. */
export function runLoop(world: World, step: () => void, draw: () => void) {
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
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  void world;
  return () => cancelAnimationFrame(raf);
}
