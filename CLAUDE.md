# LFO 資料博物館

Fan museum for Little Fighter Online, rebuilt from the original game client.
Monorepo in the same shape as TraderMemos (Go API + React web); its tech stack, not its visual style.

```
pipeline/   Bun + sharp — reads the original client, writes data/lfo.db + data/assets/**
api/        Go — echo v5, sqlc, modernc SQLite (read-only), serves /api/v1 only (data, no static files)
web/        Vite+ (vp) React 19 SPA — TanStack Router/Query/Virtual, Tailwind v4, coss ui, Lingui, GSAP, motion
realtime/   Cloudflare Worker — one Durable Object per online game room (seats, rules, input sequencer)
legacy/     the old museum's MDX pages and extracted JSON, kept as source material for later content work
prototype/relogin/  story-mode prototype (Bun), to be ported into web/
```

## Design

Read `DESIGN.md` before any visual or UI decision. Direction: *Arcade Editorial* — the original art is the
hero, entity colour comes from the art, GSAP scroll motion, no decorative borders, no meta-labels.

## Data pipeline (`pipeline/`)

- Needs the original client: set `LFO_SRC=/path/to/lfo-master` (required; no machine-specific default).
- `make data` (or `cd pipeline && bun build.ts`) rebuilds `data/lfo.db` and `data/assets/dex/**`. `data/` and `.cache/` are gitignored.
- The schema lives in `api/internal/db/schema.sql` and is shared with sqlc — change it there, then rebuild data and run `make sqlc`.
- Formats: `.lfo` = ZipCrypto zips (passwords in `pipeline/lfo.ts`, from the Little Fighter Empire forum); `.tzw` image packs;
  `.pak` atlas definitions; UTF-16 string tables; `.spt` character/item definitions; `skill.tzw.bin`. See comments in `pipeline/lfo.ts`.
- Use Bun here (`bun`, `bun:sqlite`, `Bun.file`), not Node.

## Game client (`web/src/game/`, routes `/play`, `/play/$key`)

The site is meant to feel like the game itself, not an encyclopedia: `/play` is a full-screen character
select, `/play/$key` a training ground driven by the original frame data.

- `pipeline/sprites.ts` exports per-character `data/assets/game/chars/<key>.json` (frames, `act` table,
  `spm` moves, attributes, atlas rects) + packed atlas PNGs, stage art, BGM and SFX (`make data` runs it).
- `game/core/` is the engine: pure TypeScript, fixed 30 Hz ticks, input-driven and deterministic so it can
  later run under netcode. Keep DOM/Pixi out of it. Tests in `engine.test.ts` run against real frame data.
- Determinism is a contract: `World.hash()` digests the whole state each tick (peers compare it to catch a
  desync), and `core/determinism.test.ts` replays one script into two worlds and bans `Math.random`,
  `Math.sin/cos/pow/exp/log…`, `Date.now` and locale APIs in `core/`. Chance the game needs goes through a
  seeded generator kept in the world state. Everything that drives a fighter must be data on it (so
  `skillLevels`, not a callback) and must be fed to `Fighter.hash()`.
- Frame rules: a frame lasts `d + 1` ticks; `nx = -1` ends the chain — the act table's next-action column
  (`cont` in the sprite JSON) says what the client enters then, and without it a special stops after its
  wind-up (新生迪雲's 散彈氣功波); entering a frame sets
  `vx = dvx * facing` / `vy = dvy` when non-zero; basic actions come from the `act` table (STAND 0, WALK 10,
  RUN 40, JUMPSTU 400, JUMPU 450, ATTACK1 500 …); specials from `spm` (G 防 A 攻 J 跳, F/B relative to facing,
  `from` = chain source animation).
- `game/render.ts` is the PixiJS view (swappable for a 3D/HD-2D renderer); `game/input.ts` keyboard + gamepad
  (J 攻 K 跳 L 防, arrows/WASD; a second layout TFGH / ZXC / VB for a second player) — `SeatControls` samples one
  device per seat (`kb`, `kb2`, `pad<n>`), `Controls` is the single-player case; `game/audio.ts` WebAudio SFX + BGM.
- VS (`game/vs.ts`, `/play/room`, `/play/vs/$stage`): you + up to three guests at this machine and/or COM players,
  four fighters in all; guests are `Director` fighters of kind `local`, fed through `step(input, locals)`.

## Online rooms (`realtime/`, `web/src/game/net/`, route `/play/online`)

- `realtime/` is a Cloudflare Worker (`pnpm run dev` → ws://localhost:8787, `check`, `test`, `deploy`): `Room`
  is one Durable Object per room code — the waiting room (seats, rules: stage + one level for all, COM seats,
  chat, WebSocket hibernation, line-up persisted in storage) and, once started, the `Sequencer`: a 30 Hz clock
  that stamps each seat's input for tick k into frame k, repeating a late seat's last input. It never runs the
  game. `Directory` is one object for the whole site: listed rooms report to it on every change (and remove
  themselves when they empty), `GET /rooms` reads it for the 選擇遊戲室 screen (`game/net/room-list.tsx`,
  built from the client's `selectroom/` art), and an entry quiet for ten minutes is checked against its room
  before it is shown. `wrangler types` writes `worker-configuration.d.ts` (gitignored).
- A seat is the player's, not the socket's: `hello` carries the seat's token (the browser keeps it in
  `lfo-reborn.seat.<CODE>`), so a refreshed tab comes back to the same seat. In the lobby a dropped socket keeps
  its seat for `SEAT_GRACE_MS`; `bye` (leaving on purpose, `Client.dispose` vs `close`) frees it at once. Mid-bout
  the line-up cannot change, so the seat stays, the room keeps stamping its last input and marks it `online: false`;
  a peer that comes back sends `resume` and gets the frame log from tick 0 in chunks, live frames held back until
  `resume-end` (`rollback.ts` replays it silently, `advance(true)`). A bout with no person online is called off
  after `ABANDON_TICKS`, checked in `step()` rather than by a timer (a socket-less object can be evicted between
  ticks and take the timer with it). Joining a room whose phase is `fight` is refused, and the list says why.
- `web/src/game/net/protocol.ts` is the wire (JSON; inputs as 9-bit masks) and is compiled by both sides: keep it
  free of DOM and `@/` imports. `client.ts` is the socket + snapshot; `net-run.tsx` the bout, with rollback
  (`rollback.ts`): the World runs on the local clock at the room's frame rate, `LEAD` ticks ahead of its latest
  frame; my presses are sent for tick k + `INPUT_DELAY` and are known by then, the other seats are guessed to
  keep their last input, a frame that contradicts the guess restores the snapshot before that tick
  (`Director.snapshot/restore` → `World.snapshot/restore` → `Fighter.save/load`, same objects, same ids) and
  replays silently. The host runs COM brains; everyone reports `World.hash()` of confirmed ticks every
  `HASH_EVERY`. Spawn every fighter identically on every peer (team, facing by seat) and set `Director.arena`
  for a bout — any per-client difference is a desync. New fighter state goes into `save/load` as well as `hash`.
  The bout keeps the lobby's social furniture: a roster strip (each seat's name, team, COM/★, KOs, HP/MP, 離線)
  and the chat, both drawn in the HUD's units so they scale with the stage. A chat line carries the
  speaker's name from the room: seats renumber as people leave, so a line looked up by seat index later
  would be credited to whoever holds that index (or shown as a bare `P3`).
- `VITE_REALTIME_URL` points the site at the Worker (deploy/README.md); unset in production the door stays shut.
- In dev, `window.__lfo` exposes the training world for scripted checks.

## API (`api/`)

- `make dev-api` runs it with `go run` on :8080 (`LFO_DB_PATH`, `LFO_CORS_ORIGINS`, `LFO_HTTP_PORT`).
- The API never serves files: the pipeline's static output (`data/assets`) belongs to the frontend.
- Queries are sqlc (`internal/store/queries/*.sql`, `make sqlc`); JSON-in-TEXT columns map to `jsoncol.Raw`.
  Only FTS5 search is hand-written SQL (`internal/api/search.go`).
- The DB is opened read-only and whole-table lists are cached in memory — restart the API after `make data`.
- `openapi/openapi.yaml` documents every endpoint; keep it in sync. Tests run against the real `data/lfo.db` (`make test-api`).

## Web (`web/`)

- pnpm + Vite+: `pnpm run dev`, `pnpm run check`, `pnpm run test`, `pnpm run build`.
- No API server is deployed: `get()` in `src/lib/api.ts` reads the static snapshot `make snapshot` (`api/cmd/export`) writes to
  `data/assets/api/v1` (`/items?kind=item` → `items/kind/item.json`). A new endpoint the web uses must be added to the exporter.
- Static assets: every URL goes through `ASSETS` (`src/lib/assets.ts`). Dev and `vp preview` serve `data/assets` at
  `/assets` from a middleware in `vite.config.ts`; the deploy (Cloudflare Pages, whose static requests
  are unmetered) unpacks the same tree into `dist/assets` after the build, so `VITE_ASSETS_URL`
  stays unset and the build must never write under `dist/assets/{game,ui-hd,dex}`. Never hard-code `/assets` in components. Assets the game loads must be in the deploy's keep list
  (`deploy/publish-data.sh`: game/, ui-hd/, dex/items|skills|logo).
- File routes in `src/routes/`; `src/routeTree.gen.ts` is generated — don't edit or format it.
- Head tags: `index.html` carries the title screen's tags for the crawlers that never run the app
  (Discord, X, Facebook, Google's first pass); each screen then calls `usePageMeta` (`src/lib/seo.ts`)
  with its own name and description, which rewrites the title, description, canonical and og/twitter
  tags. Dev and live-room screens pass `noindex`. Icons, `og.png` (source: `web/seo/og.html`,
  drawn from the client's own logo and 學校 gate stage in `web/seo/`), `robots.txt`, `sitemap.xml`
  and the manifest live in `web/public/`; the sitemap lists the static
  screens only — character pages come from the data and are found through `/play`. The favicon is
  the client's own `lfo.ico`, and `icon-{192,512}.png` / `apple-touch-icon.png` are that 32 px art
  scaled up with nearest-neighbour (`magick public/favicon.ico -filter point -resize 512x512 …`).
- UI components come from the coss registry: `pnpm dlx shadcn@latest add @coss/<name> --overwrite --yes` (lands in `src/components/ui/`).
- UI copy is authored in zh-HK through Lingui macros; run `pnpm run i18n:extract && pnpm run i18n:compile` after changing strings.
- Motion primitives live in `src/components/motion.tsx`; respect `prefers-reduced-motion`.
- State: server data through TanStack Query; the player's save (profiles, backpack, money, bank, 異轉信物) in the
  Zustand store in `src/game/profiles.ts`, persisted as `lfo-reborn.save` (every browser key is in `src/lib/storage-keys.ts`). Screens read it with its hooks (`useInventory`,
  `useMoney` …) instead of keeping copies; game loops use its plain getters / setters. The fight itself stays in the
  engine classes, outside React.
- Verify UI changes in the browser (both API and web running) before calling them done.

## CI, deploy and versions

- GitHub repo `milmil-dev/lfo-reborn`. `.github/workflows/web.yml` (install, `check`, `test`, `build`, deploy to
  Cloudflare Pages `lfo-reborn`: main → production at lfo-reborn.pages.dev, other branches → `<branch>.lfo-reborn.pages.dev`) and `api.yml` (`go vet`, `go test`, `go build`; not deployed) run on
  `web/**` / `api/**` changes. `data/` is not in git: `make publish-data` uploads the asset tarball and the test fixtures
  (`data/lfo.db` + `data/assets/game/**/*.json`) to private R2 (keys in the main checkout's `.env`, read from any worktree), which CI unpacks — a test reading another path needs the
  fixture list in `deploy/publish-data.sh` updated.
- Versions: Conventional Commits; PRs are squash-merged and their titles are linted (`pr-title.yml`), since release-please
  reads them on main to bump `VERSION`, `web/package.json` and `CHANGELOG.md` and tag `vX.Y.Z` (one SemVer for the repo).
- The web build is stamped with the version and commit (`src/lib/version.ts`: `__APP_VERSION__`, `VITE_GIT_SHA`, "dev"
  locally), shown on the title screen.
