# LFO 資料博物館

Fan museum for Little Fighter Online, rebuilt from the original game client.
Monorepo in the same shape as TraderMemos (Go API + React web); its tech stack, not its visual style.

```
pipeline/   Bun + sharp — reads the original client, writes data/lfo.db + data/assets/**
api/        Go — echo v5, sqlc, modernc SQLite (read-only), serves /api/v1 only (data, no static files)
web/        Vite+ (vp) React 19 SPA — TanStack Router/Query/Virtual, Tailwind v4, coss ui, Lingui, GSAP, motion
legacy/     the old museum's MDX pages and extracted JSON, kept as source material for later content work
prototype/relogin/  story-mode prototype (Bun), to be ported into web/
```

## Design

Read `DESIGN.md` before any visual or UI decision. Direction: *Arcade Editorial* — the original art is the
hero, entity colour comes from the art, GSAP scroll motion, no decorative borders, no meta-labels.

## Data pipeline (`pipeline/`)

- Needs the original client: `LFO_SRC=/path/to/lfo-master` (default `/Volumes/Pie/Downloads/lfo-master`).
- `make data` (or `cd pipeline && bun build.ts`) rebuilds `data/lfo.db` and `data/assets/dex/**`. `data/` and `.cache/` are gitignored.
- The schema lives in `api/internal/db/schema.sql` and is shared with sqlc — change it there, then rebuild data and run `make sqlc`.
- Formats: `.lfo` = ZipCrypto zips (passwords in `pipeline/lfo.ts`, from the LFE forum); `.tzw` image packs;
  `.pak` atlas definitions; UTF-16 string tables; `.spt` character/item definitions; `skill.tzw.bin`. See comments in `pipeline/lfo.ts`.
- Use Bun here (`bun`, `bun:sqlite`, `Bun.file`), not Node.

## Game client (`web/src/game/`, routes `/play`, `/play/$key`)

The site is meant to feel like the game itself, not an encyclopedia: `/play` is a full-screen character
select, `/play/$key` a training ground driven by the original frame data.

- `pipeline/sprites.ts` exports per-character `data/assets/game/chars/<key>.json` (frames, `act` table,
  `spm` moves, attributes, atlas rects) + packed atlas PNGs, stage art, BGM and SFX (`make data` runs it).
- `game/core/` is the engine: pure TypeScript, fixed 30 Hz ticks, input-driven and deterministic so it can
  later run under netcode. Keep DOM/Pixi out of it. Tests in `engine.test.ts` run against real frame data.
- Frame rules: a frame lasts `d + 1` ticks; `nx = -1` returns to the default action; entering a frame sets
  `vx = dvx * facing` / `vy = dvy` when non-zero; basic actions come from the `act` table (STAND 0, WALK 10,
  RUN 40, JUMPSTU 400, JUMPU 450, ATTACK1 500 …); specials from `spm` (G 防 A 攻 J 跳, F/B relative to facing,
  `from` = chain source animation).
- `game/render.ts` is the PixiJS view (swappable for a 3D/HD-2D renderer); `game/input.ts` keyboard + gamepad
  (J 攻 K 跳 L 防, arrows/WASD); `game/audio.ts` WebAudio SFX + BGM.
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
  Cloudflare Pages `lfo-reborn`: main → production at www.lforeborn.v6.rocks, other branches → `<branch>.lfo-reborn.pages.dev`) and `api.yml` (`go vet`, `go test`, `go build`; not deployed) run on
  `web/**` / `api/**` changes. `data/` is not in git: `make publish-data` uploads the asset tarball and the test fixtures
  (`data/lfo.db` + `data/assets/game/**/*.json`) to private R2, which CI unpacks — a test reading another path needs the
  fixture list in `deploy/publish-data.sh` updated.
- Versions: Conventional Commits; PRs are squash-merged and their titles are linted (`pr-title.yml`), since release-please
  reads them on main to bump `VERSION`, `web/package.json` and `CHANGELOG.md` and tag `vX.Y.Z` (one SemVer for the repo).
- The web build is stamped with the version and commit (`src/lib/version.ts`: `__APP_VERSION__`, `VITE_GIT_SHA`, "dev"
  locally), shown on the title screen.
