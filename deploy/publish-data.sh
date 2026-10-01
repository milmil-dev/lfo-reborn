#!/usr/bin/env bash
# Publish the pipeline's output to Cloudflare R2 after `make data`:
#
#   data/assets/**      -> public bucket (R2_ASSETS_BUCKET), what VITE_ASSETS_URL serves
#   fixtures.tar.gz     -> private bucket (R2_DATA_BUCKET): data/lfo.db plus the
#                          game JSON the tests read; CI unpacks it (.github/actions/fixtures)
#
# Needs rclone and, in the environment or a root .env:
#   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  (read+write on both buckets)
#   R2_ASSETS_BUCKET (default lfo-assets), R2_DATA_BUCKET (default lfo-data)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?set R2_SECRET_ACCESS_KEY}"
assets_bucket="${R2_ASSETS_BUCKET:-lfo-assets}"
data_bucket="${R2_DATA_BUCKET:-lfo-data}"

command -v rclone >/dev/null || { echo "rclone not found (brew install rclone)" >&2; exit 1; }
[ -f data/lfo.db ] || { echo "data/lfo.db missing; run \`make data\` first" >&2; exit 1; }

# An rclone remote named "r2", configured from the environment (no rclone.conf).
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# --checksum: `make data` rewrites every file, so mtimes always differ; compare
# content instead and only upload what actually changed. Asset names are not
# content-hashed, hence the short cache lifetime.
echo "Syncing data/assets -> r2:$assets_bucket"
rclone sync data/assets "r2:$assets_bucket" \
  --checksum --fast-list --transfers 32 --checkers 64 \
  --header-upload "Cache-Control: public, max-age=3600" \
  --exclude ".DS_Store" \
  --stats-one-line --stats 10s

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Packing fixtures"
{
  echo data/lfo.db
  find data/assets/game -name '*.json'
} | COPYFILE_DISABLE=1 tar -czf "$tmp/fixtures.tar.gz" -T -
echo "Uploading fixtures.tar.gz ($(du -h "$tmp/fixtures.tar.gz" | cut -f1)) -> r2:$data_bucket"
rclone copyto "$tmp/fixtures.tar.gz" "r2:$data_bucket/fixtures.tar.gz"
