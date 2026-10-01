import { Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { ASSETS } from "@/lib/assets";
import type { CharAssets } from "../render";
import { loadArt, loadSprite, Scene } from "../render";
import type { Layer, Room } from "./types";

/*
  Exit arrows, as LFO.exe draws them over every open exit: misc/arrowred19 (104 × 62, pointing
  up), centred on the exit box, turned by its direction (1 up 0, 2 down π — kept above y 524 —,
  3 left 3π/2, 4 right π/2), pivoting on its top centre and gently pulsing.
*/
const ARROW_TURN: Record<number, number> = {
  1: 0,
  2: Math.PI,
  3: (3 * Math.PI) / 2,
  4: Math.PI / 2,
};
let arrowTexture: Promise<Texture> | null = null;
function arrowArt() {
  arrowTexture ??= Assets.load<Texture>(`${ASSETS}/ui-hd/misc/arrowred19.webp`);
  return arrowTexture;
}

type Placed = { sprite: Sprite; layer: Layer; i: number };
/** an animated object layer: its sprite assets and where it is in its frame chain */
type Actor = { sprite: Sprite; layer: Layer; assets: CharAssets; frame: number; left: number };

/** A story room: the .bg layers sorted by depth together with the actors, with parallax. */
export class RoomScene extends Scene {
  private placed: Placed[] = [];
  private arrows: Sprite[] = [];
  private objects: Actor[] = [];
  private clock = 0;
  // a stitched strip's parallax layers, each kept inside its own room (masked)
  private clips: Container[] = [];
  private exitsOpen = true;
  private token = 0;

  /** Load a room's art ahead of time (the room behind a door the player is walking up to). */
  preload(room: Room) {
    return Promise.all(
      room.layers.map((l) => loadArt(`bg/${l.img.replace(/\.\w+$/, ".webp")}`).catch(() => null)),
    ).then(() => undefined);
  }

  /** Show or hide the exit arrows (a story room opens its exits once its phase is clear). */
  showExits(open: boolean) {
    this.exitsOpen = open;
  }

  constructor(host: HTMLElement, camera: () => { x: number; height: number }) {
    super(host, { camera });
  }

  async setRoom(room: Room) {
    const token = ++this.token;
    await this.ready;
    const textures = await Promise.all(
      room.layers.map((l) =>
        l.sprite
          ? Promise.resolve(null)
          : loadArt(`bg/${l.img.replace(/\.\w+$/, ".webp")}`).catch(() => null),
      ),
    );
    const animated = await Promise.all(
      room.layers.map((l) =>
        l.sprite ? loadSprite(l.sprite).catch(() => null) : Promise.resolve(null),
      ),
    );
    if (token !== this.token || this.destroyed) return;
    for (const p of this.placed) p.sprite.destroy();
    this.placed = [];
    for (const o of this.objects) o.sprite.destroy();
    this.objects = [];
    for (const c of this.clips) c.destroy({ children: true });
    this.clips = [];
    const clipFor = new Map<string, Container>();
    // parallax layers of a stitched room: far ones behind everything, near ones (ratio > 1) in
    // front, each group masked to its own room so neighbours never overlap at the seams
    const clipped = (clip: [number, number], front: boolean) => {
      const key = `${clip[0]}:${front}`;
      let c = clipFor.get(key);
      if (!c) {
        c = new Container({ sortableChildren: true });
        const mask = new Graphics().rect(clip[0], -2000, clip[1] - clip[0], 5000).fill(0xffffff);
        c.addChild(mask);
        c.mask = mask;
        c.zIndex = front ? 2e6 : -2e6;
        this.actors.addChild(c);
        this.clips.push(c);
        clipFor.set(key, c);
      }
      return c;
    };
    for (const a of this.arrows) a.destroy();
    this.arrows = [];
    const arrow = await arrowArt().catch(() => null);
    if (arrow && token === this.token && !this.destroyed)
      for (const e of room.exits) {
        const sprite = new Sprite(arrow);
        sprite.anchor.set(0.5, 0);
        sprite.rotation = ARROW_TURN[e.dir] ?? 0;
        sprite.position.set(
          e.x + e.w / 2,
          e.dir === 2 ? Math.min(524, e.z + e.h / 2) : e.z + e.h / 2,
        );
        sprite.zIndex = 1e6;
        this.actors.addChild(sprite);
        this.arrows.push(sprite);
      }
    room.layers.forEach((layer, n) => {
      const assets = animated[n];
      if (assets) {
        // an animated object: starts on its STAND loop (or its first frame)
        const sprite = new Sprite();
        sprite.zIndex = layer.z - 0.5 + n / 10000;
        const start = assets.data.actions.STAND ?? Number(Object.keys(assets.data.frames)[0]);
        const actor = {
          sprite,
          layer,
          assets,
          frame: start,
          left: (assets.data.frames[start]?.d ?? 0) + 1,
        };
        if (layer.clip) clipped(layer.clip, layer.ratio > 1).addChild(sprite);
        else this.actors.addChild(sprite);
        this.objects.push(actor);
        return;
      }
      const tex = textures[n];
      if (!tex) return;
      tex.source.scaleMode = "linear";
      for (let i = 0; i < Math.max(1, layer.span); i++) {
        const sprite = new Sprite(tex);
        // scenery sorts against actors by depth; the order in the file breaks ties
        sprite.zIndex = layer.z - 0.5 + n / 10000;
        if (layer.clip) clipped(layer.clip, layer.ratio > 1).addChild(sprite);
        else this.actors.addChild(sprite);
        this.placed.push({ sprite, layer, i });
      }
    });
  }

  /** Advance the animated objects (30 ticks a second) and place them. */
  private animate(camX: number) {
    const tick = Math.floor(performance.now() / (1000 / 30));
    const steps = this.clock ? Math.min(5, tick - this.clock) : 0;
    this.clock = tick;
    for (const o of this.objects) {
      const frames = o.assets.data.frames;
      for (let i = 0; i < steps; i++)
        if (--o.left <= 0) {
          const next = frames[o.frame]?.nx ?? -1;
          o.frame = next >= 0 && frames[next] ? next : o.frame;
          o.left = (frames[o.frame]?.d ?? 0) + 1;
        }
      const f = frames[o.frame];
      const tex = f && o.assets.textures.get(f.p);
      const rect = f && o.assets.data.rects[String(f.p)];
      if (!f || !tex || !rect) {
        o.sprite.visible = false;
        continue;
      }
      // placed like a character: (x, z) is where its frame anchor (cx, cy) stands, y its height
      o.sprite.visible = true;
      o.sprite.texture = tex;
      o.sprite.x = o.layer.x - f.cx + rect[5] + camX * (1 - o.layer.ratio);
      o.sprite.y = o.layer.z + o.layer.y - f.cy + rect[6];
    }
  }

  protected override layout(camX: number) {
    this.animate(camX);
    const pulse = 0.9 + 0.1 * Math.sin(performance.now() / 160);
    for (const a of this.arrows) {
      a.visible = this.exitsOpen;
      // the HD piece is 4× the original 104 × 62
      a.scale.set(pulse / 4);
    }
    for (const { sprite, layer, i } of this.placed) {
      sprite.x = layer.x + i * layer.step + camX * (1 - layer.ratio);
      sprite.y = layer.y + layer.z;
    }
  }
}
