# Deploy

```
make data ─► deploy/publish-data.sh ─► R2 lfo-data (private): fixtures.tar.gz, assets.tar
                                                │ one read each per CI run
push / PR ─► .github/workflows/web.yml ─► check · test · build ─► + assets.tar ─► Cloudflare Pages
         └─► .github/workflows/api.yml ─► vet · test · build    (no deploy yet)
```

Players only ever hit Cloudflare Pages. The game's art, audio and JSON ship inside the Pages deployment
under `/assets` (the default `ASSETS` base), and Pages static requests are free and unmetered, so traffic
cannot run up a bill. R2 is never public: it only holds the two archives CI copies from.

`data/` comes from the original game client and never enters git. Publish it from a machine that has
the client, after every `make data`:

```bash
deploy/publish-data.sh
```

`assets.tar` keeps only what the game client requests (~15k files, ~2 GB); the filter and the reasons
for each exclusion are in the script.

## Free-tier budget

| Service        | Free limit                               | This project                                         |
| -------------- | ---------------------------------------- | ---------------------------------------------------- |
| Pages requests | unlimited, no bandwidth charge           | all player traffic                                   |
| Pages deploys  | 500 / month                              | one per push to main or same-repo PR push            |
| Pages files    | 20,000 per deployment, 25 MiB per file   | ~15,300 (script warns above 19,000), largest 5.7 MB  |
| R2 storage     | 10 GB-month                              | ~2.1 GB                                              |
| R2 Class A     | 1M writes / month                        | ~40 per publish (64 MB multipart parts)              |
| R2 Class B     | 10M reads / month                        | 1–2 per CI run                                       |
| R2 egress      | free                                     | ~2 GB per deploy, free                               |
| GitHub Actions | 2,000 min / month (private repo)         | path filters; PR runs cancel superseded ones         |

The one thing to watch is the file count: `bg/` alone is 8,310 files. If the game grows past 20,000,
move `game/bg` to an R2 custom domain behind the Cloudflare cache.

## One-time setup

1. Create the private bucket and the Pages project (done once with `wrangler`):

   ```bash
   bunx wrangler@4 r2 bucket create lfo-data
   bunx wrangler@4 pages project create lfo-reborn --production-branch main
   ```

2. **R2 API tokens** (dashboard → R2 → Manage API tokens):
   - *publish*: Object Read & Write, bucket `lfo-data` → local `.env`
   - *CI*: Object Read only, bucket `lfo-data` → GitHub secrets

3. **Pages API token** (My Profile → API Tokens → Custom): *Account · Cloudflare Pages · Edit*.

4. **Local `.env`** (gitignored), read by `publish-data.sh`:

   ```
   CLOUDFLARE_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   ```

5. **GitHub** (`milmil-dev/lfo-reborn` → Settings → Secrets and variables → Actions):

   | Kind     | Name                    | Value                          |
   | -------- | ----------------------- | ------------------------------ |
   | secret   | `CLOUDFLARE_ACCOUNT_ID` | account ID                     |
   | secret   | `CLOUDFLARE_API_TOKEN`  | Pages: Edit token              |
   | secret   | `R2_ACCESS_KEY_ID`      | CI token (read `lfo-data`)     |
   | secret   | `R2_SECRET_ACCESS_KEY`  | CI token secret                |
   | variable | `R2_DATA_BUCKET`        | optional, default `lfo-data`   |
   | variable | `CF_PAGES_PROJECT`      | optional, default `lfo-reborn` |

Without the R2 secrets CI still passes, but skips the data-backed tests (with a warning) and does not deploy.

## Not deployed yet

The Go API (`/api/v1`, and the `/ws/lobby` WebSocket from the online mode) has no host yet, so on
Pages anything that calls `/api/v1` (item and skill details, for instance) gets no data; screens that only
read `ASSETS` work. When the API gets a host it needs a single long-running instance (the lobby keeps its
state in memory), `data/lfo.db` alongside it, and `LFO_CORS_ORIGINS` set to the Pages domain.
