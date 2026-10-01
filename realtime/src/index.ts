/*
  The realtime Worker: one Durable Object per game room (room.ts), reached by its code.

    GET /health            → { ok, protocol }
    GET /rooms             → { rooms }       the listed rooms, for 選擇遊戲室 (directory.ts)
    GET /rooms/new         → { code }        a fresh code nobody is using
    GET /rooms/:code       WebSocket upgrade → the room (the first to arrive hosts it)

  The site (Cloudflare Pages) is another origin, so the plain endpoints answer CORS; the
  WebSocket needs none.
*/
import { PROTOCOL } from "../../web/src/game/net/protocol";
import { CODE, newCode } from "./codes";

export { Directory } from "./directory";
export { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
  DIRECTORY: DurableObjectNamespace;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health") return json({ ok: true, protocol: PROTOCOL });
    if (url.pathname === "/rooms") {
      const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName("rooms"));
      const list = await dir.fetch(new Request("https://directory/list"));
      return json(await list.json(), list.status);
    }
    if (url.pathname === "/rooms/new") {
      // a code already holding a room (its object has state) is skipped
      for (let i = 0; i < 8; i++) {
        const code = newCode(i < 4 ? 4 : 5);
        const probe = await env.ROOM.get(env.ROOM.idFromName(code)).fetch(
          new Request(`https://room/exists`),
        );
        if ((await probe.text()) === "0") return json({ code });
      }
      return json({ error: "busy" }, 503);
    }
    const m = /^\/rooms\/([A-Z0-9]+)$/.exec(url.pathname);
    if (m && CODE.test(m[1])) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return json({ error: "websocket only" }, 426);
      return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(request);
    }
    return json({ error: "not found" }, 404);
  },
};
