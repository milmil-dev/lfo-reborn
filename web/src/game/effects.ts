import type { Fighter, FighterEvent } from "./core/fighter";
import type { CharData } from "./core/types";
import type { World } from "./core/world";
import { type CharAssets, loadSprite } from "./render";

/**
 * Skill effects and projectiles (the .spt `bla` spawns). Their sprite data is preloaded
 * whenever a fighter joins, so spawning stays synchronous inside the fixed tick.
 */
export class Effects {
  private readonly ready = new Map<number, CharAssets>();
  private readonly pending = new Set<number>();

  constructor(
    private readonly world: World,
    private readonly view: { add(f: Fighter, a: CharAssets): unknown; remove(f: Fighter): void },
  ) {}

  /** Loads every object `data` can spawn, following spawns of spawns. */
  preload(data: CharData) {
    for (const f of Object.values(data.frames))
      for (const b of f.bla ?? []) {
        if (!b.type || this.ready.has(b.type) || this.pending.has(b.type)) continue;
        this.pending.add(b.type);
        loadSprite(`sprites/${b.type}`)
          .then((a) => {
            this.ready.set(b.type, a);
            this.preload(a.data);
          })
          .catch(() => {});
      }
  }

  /** Call after each world step with its events. */
  update(events: FighterEvent[]) {
    for (const e of events) {
      // a picked-up item can spawn things of its own (a bow's arrows): have them ready
      if (e.type === "pick") {
        const item = this.world.fighters.find((f) => f.id === e.item);
        if (item) this.preload(item.data);
        continue;
      }
      if (e.type !== "spawn") continue;
      const owner = this.world.fighters.find((f) => f.id === e.fighter);
      const assets = this.ready.get(e.bla.type);
      if (!owner || !assets) continue;
      void this.view.add(this.world.spawnEffect(owner, e.bla, assets.data), assets);
    }
    for (const f of [...this.world.fighters])
      if (f.dead) {
        this.world.remove(f);
        this.view.remove(f);
      }
  }
}
