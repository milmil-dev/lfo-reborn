#!/usr/bin/env bash
# Publish the pipeline's output for CI after `make data`. Two archives go to the
# private R2 bucket (R2_DATA_BUCKET):
#
#   fixtures.tar.gz  data/lfo.db + data/assets/game/**/*.json, what the tests read
#   assets.tar       data/assets as the site serves it; CI copies it into the
#                    deployed build, so players never touch R2
#
# assets.tar holds only what the game client requests (see the filter below):
# ~2 GB and ~15k files instead of 4.1 GB / 19k, keeping the deployment under
# the 20,000-file limit.
#
# Needs bun, rclone and, in the environment or a root .env:
#   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  (read+write on the bucket)
#   R2_DATA_BUCKET (default lfo-data)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"
bucket="${R2_DATA_BUCKET:-lfo-data}"

for tool in bun rclone; do
  command -v "$tool" >/dev/null || { echo "$tool not found" >&2; exit 1; }
done
[ -f data/lfo.db ] || { echo "data/lfo.db missing; run \`make data\` first" >&2; exit 1; }

# An rclone remote named "r2", configured from the environment (no rclone.conf).
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export COPYFILE_DISABLE=1 # no macOS ._ resource-fork entries in the archives

echo "Packing fixtures.tar.gz"
{
  echo data/lfo.db
  find data/assets/game -name '*.json'
} | tar -czf "$tmp/fixtures.tar.gz" -T -

echo "Packing assets.tar"
(
  cd data/assets
  # shellcheck disable=SC2016 # JS template literals, not shell
  bun -e '
    // Only what the game client requests. Left out: ui/ (the pre-upscale UI, used
    // only by the /play/kit comparison page), ui-svg/ (unused), and the old
    // museum art in dex/chars, dex/faces, dex/scene.
    const KEEP = ["game/", "ui-hd/", "dex/items/", "dex/skills/", "dex/logo/"];
    // Atlas pages in chars/ and sprites/ always load through gameArt(), which
    // swaps in the @2x twin, so their SD originals are never requested. bg/,
    // faces/ and stages/ SD files are (stage previews, 1x portrait src): keep them.
    const sd = new Set(
      (await Bun.file("game/hd.json").json())
        .filter((r) => /^(chars|sprites)\//.test(r))
        .map((r) => `game/${r}`),
    );
    for await (const f of new Bun.Glob("**/*").scan(".")) {
      if (KEEP.some((k) => f.startsWith(k)) && !sd.has(f) && !f.endsWith(".DS_Store")) console.log(f);
    }
  ' | sort >"$tmp/assets.list"
  # Art and audio are already compressed; gzip would only cost time.
  tar -cf "$tmp/assets.tar" -T "$tmp/assets.list"
)
files=$(wc -l <"$tmp/assets.list" | tr -d ' ')
echo "  $files files, $(du -h "$tmp/assets.tar" | cut -f1)"
if [ "$files" -gt 19000 ]; then
  echo "warning: $files asset files; Workers static assets allow 20,000 per version (incl. the web build)" >&2
fi

for f in fixtures.tar.gz assets.tar; do
  echo "Uploading $f -> r2:$bucket"
  rclone copyto "$tmp/$f" "r2:$bucket/$f" --s3-chunk-size 64M --stats-one-line --stats 10s
done
