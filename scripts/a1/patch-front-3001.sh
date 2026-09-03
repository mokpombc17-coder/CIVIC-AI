#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib-a1-image-patch.sh
. "$script_dir/lib-a1-image-patch.sh"

A1_SERVICE="front"
A1_COMPOSE_PROJECT="civic-front-3001"
a1_parse_args "$(basename "$0")" "$@"
if [[ "$A1_ACTION" == deploy ]]; then
  a1_resolve_local_source
  [[ -f "$A1_SOURCE_ROOT/pnpm-workspace.yaml" && -f "$A1_SOURCE_ROOT/apps/web/package.json" ]] \
    || a1_die "this script must run from the civic-ai frontend repository"
fi

if [[ "$A1_DRY_RUN" == true ]]; then
  printf '%s\n' \
    'service=front' \
    "source_root=$A1_SOURCE_ROOT" \
    "branch=$A1_SOURCE_BRANCH" \
    "commit=$A1_SOURCE_COMMIT" \
    "working_tree_dirty=$A1_SOURCE_DIRTY" \
    "snapshot_id=$A1_SHA" \
    "source_state_sha256=$A1_SOURCE_STATE_SHA256" \
    'source_policy=local-working-tree' \
    'build_platform=linux/arm64' \
    'server_build=false' \
    'delivery=checksummed-image-archive' \
    'front_build=linux-standalone-artifact-then-runtime-image' \
    'asset_routing=exact-build-manifest' \
    'edge_proxy=nginx' \
    'tls=preserve-existing' \
    'build_daemon=local' \
    "public_origin=$A1_PUBLIC_ORIGIN" \
    "next_public_chat_api_url=$A1_PUBLIC_ORIGIN" \
    "next_public_vote_api_url=$A1_PUBLIC_ORIGIN" \
    "action=$A1_ACTION"
  exit 0
fi

a1_require_commands
a1_make_workdir
stage="$A1_WORKDIR/stage"
mkdir -p "$stage"
install -m 0700 "$A1_SCRIPT_DIR/remote-release.sh" "$stage/remote-release.sh"

if [[ "$A1_ACTION" == rollback ]]; then
  a1_stage_and_run_remote "$A1_SERVICE" "$stage"
  exit 0
fi

source_snapshot="$A1_WORKDIR/source"
a1_copy_local_source "$source_snapshot"
image="civic-local/front-3001:${A1_SHA}"
a1_build_front_image "$source_snapshot" "$image"
a1_verify_image "$image"
a1_extract_front_assets "$image" "$stage/assets.txt" "$A1_WORKDIR/assets"
a1_fetch_live_nginx "$A1_WORKDIR/nginx.live.conf"
shasum -a 256 "$A1_WORKDIR/nginx.live.conf" | cut -d' ' -f1 > "$stage/nginx.base.sha256"
node "$A1_SCRIPT_DIR/render-front-nginx.mjs" \
  --base "$A1_WORKDIR/nginx.live.conf" \
  --assets "$stage/assets.txt" \
  --host "$A1_PUBLIC_HOST" \
  --output "$stage/candidate.nginx.conf"
install -m 0600 "$A1_SCRIPT_DIR/templates/front.compose.yaml" "$stage/compose.yaml"
a1_archive_image "$image" "$stage/image.tar.gz"
a1_write_release_env "$stage/release.env" front "$image" "$A1_COMPOSE_PROJECT" front 3001 /chat
a1_stage_and_run_remote "$A1_SERVICE" "$stage"
