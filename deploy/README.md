# Deploy

```
make data ──► deploy/publish-data.sh ──► R2 lfo-assets (public)  ◄── browser, via VITE_ASSETS_URL
                                    └──► R2 lfo-data (private)    ◄── CI: fixtures.tar.gz for tests
push / PR ──► .github/workflows/web.yml ──► check · test · build ──► Cloudflare Pages
          └─► .github/workflows/api.yml ──► vet · test · build   (no deploy yet)
```

`data/` comes from the original game client and never enters git or CI. It is published from a
machine that has the client, after every `make data`:

```bash
deploy/publish-data.sh
```

## One-time setup

1. **R2 buckets** (Cloudflare dashboard → R2, or wrangler):

   ```bash
   bunx wrangler r2 bucket create lfo-assets
   bunx wrangler r2 bucket create lfo-data
   bunx wrangler r2 bucket cors set lfo-assets --file deploy/r2-cors.json
   ```

   Give `lfo-assets` public access: a custom domain (e.g. `assets.<your-domain>`) or the r2.dev URL.
   Keep `lfo-data` private.

2. **R2 API tokens** (R2 → Manage API tokens):
   - *publish*: Object Read & Write on both buckets → local `.env`
   - *CI*: Object Read on `lfo-data` only → GitHub secrets

3. **Pages project**:

   ```bash
   bunx wrangler pages project create lfo-reborn --production-branch main
   ```

   API token for CI (My Profile → API Tokens): *Cloudflare Pages: Edit* on the account.

4. **Local `.env`** (gitignored), read by `publish-data.sh`:

   ```
   CLOUDFLARE_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   ```

5. **GitHub** (`milmil-dev/lfo-reborn` → Settings → Secrets and variables → Actions):

   | Kind     | Name                    | Value                                          |
   | -------- | ----------------------- | ---------------------------------------------- |
   | secret   | `CLOUDFLARE_ACCOUNT_ID` | account ID                                     |
   | secret   | `CLOUDFLARE_API_TOKEN`  | Pages: Edit token                              |
   | secret   | `R2_ACCESS_KEY_ID`      | CI token (read `lfo-data`)                     |
   | secret   | `R2_SECRET_ACCESS_KEY`  | CI token secret                                |
   | variable | `VITE_ASSETS_URL`       | public URL of `lfo-assets`, no trailing slash  |
   | variable | `R2_DATA_BUCKET`        | optional, default `lfo-data`                   |
   | variable | `CF_PAGES_PROJECT`      | optional, default `lfo-reborn`                 |

Without the R2 secrets CI still passes, but skips the data-backed tests and says so in a warning.

## Not deployed yet

The Go API (`/api/v1`, and the `/ws/lobby` WebSocket from the online mode) has no host yet, so on
Pages any screen that calls `/api/v1` gets no data. Screens that only read `ASSETS` (the game) work.
When the API gets a host it needs a single long-running instance (the lobby keeps its state in memory),
`data/lfo.db` alongside it, and `LFO_CORS_ORIGINS` set to the Pages domain.
