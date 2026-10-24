import type { Fighter, FighterEvent } from "./core/fighter";
import type { CharData, Move } from "./core/types";
import type { World } from "./core/world";
import { atlasFor, type CharAssets, loadData } from "./render";

/**
 * Skill effects and projectiles (the .spt `bla` spawns).
 *
 * `World.spawnEffect` needs the object's frame data inside the fixed tick, so every object a
 * fighter can spawn is fetched ahead of time — following spawns of spawns. What is *not* fetched
 * ahead is the art: a single character names a dozen or more sheets (星奇's fifteen decode to
 * 787 MB of atlas pages), and a phone's renderer dies long before that. The data is a few hundred
 * KB; a sheet's pages are fetched when a move that can spawn it starts (`Move.fx`), which gives
 * its wind-up time to arrive, and at the latest when the object is first spawned.
 */
export class Effects {
  private readonly ready = new Map<number, CharData>();
  private readonly pending = new Set<number>();
  /** atlases asked for, by sprite id, so a repeated spawn does not fetch them twice */
  private readonly art = new Map<number, Promise<CharAssets>>();

  constructor(
    private readonly world: World,
    private readonly view: { add(f: Fighter, a: CharAssets): unknown; remove(f: Fighter): void },
  ) {}

  /** Loads the frame data of every object `data` can spawn, following spawns of spawns. */
  preload(data: CharData) {
    for (const f of Object.values(data.frames))
      for (const b of f.bla ?? []) {
        if (!b.type || this.ready.has(b.type) || this.pending.has(b.type)) continue;
        this.pending.add(b.type);
        loadData(`sprites/${b.type}`)
          .then((d) => {
            this.ready.set(b.type, d);
            this.preload(d);
          })
          .catch(() => {})
          .finally(() => this.pending.delete(b.type));
      }
  }

  /**
   * Fetches the art a special can spawn. Called when the move starts: 200 MB of pages takes half
   * a second to decode, and the wind-up is the head start that keeps the first use from being a
   * blank one.
   */
  warm(move: Move) {
    for (const type of move.fx ?? []) {
      const data = this.ready.get(type);
      if (data) void this.artOf(type, data);
    }
  }

  private artOf(type: number, data: CharData) {
    let p = this.art.get(type);
    if (!p) {
      p = atlasFor(`sprites/${type}`, data);
      this.art.set(type, p);
      // a failed fetch must not stick: the next spawn should try again
      p.catch(() => this.art.delete(type));
    }
    return p;
  }

  /** Call after each world step with its events. */
  update(events: FighterEvent[]) {
    for (const e of events) {
      // a picked-up item can spawn things of its own (a bow's arrows): have their data ready
      if (e.type === "pick") {
        const item = this.world.fighters.find((f) => f.id === e.item);
        if (item) this.preload(item.data);
        continue;
      }
      if (e.type === "move") {
        this.warm(e.move);
        continue;
      }
      if (e.type !== "spawn") continue;
      const owner = this.world.fighters.find((f) => f.id === e.fighter);
      const data = this.ready.get(e.bla.type);
      if (!owner || !data) continue;
      // the object exists in the world from this tick; its pictures arrive when they arrive
      const f = this.world.spawnEffect(owner, e.bla, data);
      const type = e.bla.type;
      void this.artOf(type, data)
        .then((a) => {
          // it may have died, or the bout ended, while the pages loaded
          if (!f.dead && this.world.fighters.includes(f)) this.view.add(f, a);
        })
        .catch(() => {});
    }
    for (const f of [...this.world.fighters])
      if (f.dead) {
        this.world.remove(f);
        this.view.remove(f);
      }
  }
}
