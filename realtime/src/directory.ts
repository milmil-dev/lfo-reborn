/*
  The room directory behind 選擇遊戲室: one object for the whole site that every listed room
  reports to when its line-up, rules or phase change, and that forgets a room when it empties.
  Listing is a read of storage, so the object sleeps between requests. A room that vanished
  without a word (its object evicted) would linger, so an entry nobody has touched for a while is
  asked about before it is shown again.
*/
import { DurableObject } from "cloudflare:workers";
import type { RoomSummary } from "../../web/src/game/net/protocol";
import type { Env } from "./index";
import { listing, STALE_MS } from "./listing";

export class Directory extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/report") {
      const s = (await request.json()) as RoomSummary;
      await this.ctx.storage.put(s.code, s);
      return new Response("ok");
    }
    if (request.method === "POST" && url.pathname === "/remove") {
      const { code } = (await request.json()) as { code: string };
      await this.ctx.storage.delete(code);
      return new Response("ok");
    }
    if (url.pathname === "/list") {
      const all = await this.ctx.storage.list<RoomSummary>();
      const now = Date.now();
      const rooms: RoomSummary[] = [];
      await Promise.all(
        [...all.values()].map(async (s) => {
          if (now - s.updatedAt < STALE_MS) return void rooms.push(s);
          // quiet for a long time: still there?
          const live = await this.env.ROOM.get(this.env.ROOM.idFromName(s.code))
            .fetch(new Request("https://room/exists"))
            .then((r) => r.text())
            .catch(() => "0");
          if (live === "0") return void this.ctx.storage.delete(s.code);
          const fresh = JSON.parse(live) as RoomSummary | null;
          if (fresh) {
            rooms.push(fresh);
            await this.ctx.storage.put(fresh.code, fresh);
          } else await this.ctx.storage.delete(s.code);
        }),
      );
      return new Response(JSON.stringify({ rooms: listing(rooms) }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }
}
