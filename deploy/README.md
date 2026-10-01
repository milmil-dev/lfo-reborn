# Deploy

```
make data ─► deploy/publish-data.sh ─► R2 lfo-data (private): fixtures.tar.gz, assets.tar
                                                │ one read each per CI run
push / PR ─► .github/workflows/web.yml ─► check · test · build ─► + assets.tar ─► Cloudflare Pages
         └─► .github/workflows/api.yml ─► vet · test · build    (no deploy yet)
```

Players only ever hit the `lfo-reborn` Cloudflare Pages project. The game's art, audio and JSON ship inside
each deployment under `/assets` (the default `ASSETS` base), and Pages static requests are free and
unmetered, so traffic cannot run up a bill. R2 is never public: it only holds the two archives CI copies from.

- production: push to `main` → https://www.lforeborn.v6.rocks (also https://lfo-reborn.pages.dev)
- previews: same-repo PRs → `https://<branch>.lfo-reborn.pages.dev` (wrangler prints the exact URL)

It is classic Pages rather than Workers static assets on purpose: a Worker custom domain needs the zone on
Cloudflare, while a Pages project takes a subdomain whose DNS lives elsewhere. `lforeborn.v6.rocks` is a
dynv6 free zone, so `www` there is a CNAME to `lfo-reborn.pages.dev` (see the setup below). wrangler 4
creates new "Pages" projects as Workers unless `pages project create` gets `--force`.

`data/` comes from the original game client and never enters git. Publish it from a machine that has
the client, after every `make data`:

```bash
deploy/publish-data.sh
```

`assets.tar` keeps only what the game client requests (~15k files, ~2 GB); the filter and the reasons
for each exclusion are in the script.

## Free-tier budget

| Service                 | Free limit                              | This project                                         |
| ----------------------- | --------------------------------------- | ---------------------------------------------------- |
| Static asset requests   | unlimited, no bandwidth charge          | all player traffic                                   |
| Pages deploys           | 500 / month                             | one per push to main or same-repo PR push            |
| Static asset files      | 20,000 per deployment, 25 MiB per file  | ~16,400 (script warns above 19,000), largest 5.7 MB  |
| R2 storage              | 10 GB-month                             | ~2.1 GB                                              |
| R2 Class A              | 1M writes / month                       | ~40 per publish (64 MB multipart parts)              |
| R2 Class B              | 10M reads / month                       | 1–2 per CI run                                       |
| R2 egress               | free                                    | ~2 GB per deploy, free                               |
| GitHub Actions          | 2,000 min / month (private repo)        | path filters; PR runs cancel superseded ones         |

The one thing to watch is the file count: `bg/` alone is 8,310 files. If the game grows past 20,000,
move `game/bg` to an R2 custom domain behind the Cloudflare cache.

Never add Pages Functions (a `functions/` directory or `_worker.js`) without rechecking this table: requests
that run them count against the metered 100k/day Workers budget.

## One-time setup

1. ✅ R2 bucket `lfo-data` and the `lfo-reborn` Pages project exist (account sinhong516@gmail.com,
   `a6e84c062625ea7cab3dde95d8aba5aa`).

2. **R2 API tokens** (dashboard → R2 → Manage API tokens):
   - *publish*: Object Read & Write, bucket `lfo-data` → local `.env`
   - *CI*: Object Read only, bucket `lfo-data` → GitHub secrets

3. **Deploy API token** (My Profile → API Tokens → Custom): *Account · Cloudflare Pages · Edit*.

4. **Local `.env`** (gitignored), read by `publish-data.sh`:

   ```
   CLOUDFLARE_ACCOUNT_ID=a6e84c062625ea7cab3dde95d8aba5aa
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   ```

5. **GitHub** (`milmil-dev/lfo-reborn` → Settings → Secrets and variables → Actions):

   | Kind     | Name                    | Value                          |
   | -------- | ----------------------- | ------------------------------ |
   | secret   | `CLOUDFLARE_ACCOUNT_ID` | account ID                     |
   | secret   | `CLOUDFLARE_API_TOKEN`  | Cloudflare Pages: Edit token   |
   | secret   | `R2_ACCESS_KEY_ID`      | CI token (read `lfo-data`)     |
   | secret   | `R2_SECRET_ACCESS_KEY`  | CI token secret                |
   | variable | `R2_DATA_BUCKET`        | optional, default `lfo-data`   |

   Also: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"
   (release-please).

6. **Custom domain** `www.lforeborn.v6.rocks`:
   - Cloudflare: Pages project `lfo-reborn` → Custom domains → `www.lforeborn.v6.rocks`
   - dynv6: zone `lforeborn.v6.rocks` → Records → CNAME, name `www`, data `lfo-reborn.pages.dev`

   Cloudflare verifies the CNAME and issues the certificate (minutes, sometimes longer). The zone root
   `lforeborn.v6.rocks` can only hold A/AAAA at dynv6, so it is not used.

Without the R2 secrets CI still passes, but skips the data-backed tests (with a warning) and does not deploy.

## Not deployed yet

The Go API is not hosted: the site reads its responses as a static snapshot (`api/cmd/export`, refreshed by
`make data` and `publish-data.sh`). The `/ws/lobby` WebSocket from the online mode does need a server; when the
API gets a host it needs a single long-running instance (the lobby keeps its state in
memory), `data/lfo.db` alongside it, and `LFO_CORS_ORIGINS` set to the site's domain.
