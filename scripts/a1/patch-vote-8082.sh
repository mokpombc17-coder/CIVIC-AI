#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib-a1-image-patch.sh
. "$script_dir/lib-a1-image-patch.sh"

A1_SERVICE="vote"
repository="https://github.com/Ham-n-Cheeze/vote-resource-server.git"
A1_DATA_VOLUME="civic-vote-8082_postgres-data"
A1_SERVER_ENV="/etc/civic/vote-8082.env"
A1_COMPOSE_PROJECT="civic-vote-8082"
a1_parse_args "$(basename "$0")" "$@"
if [[ "$A1_ACTION" == deploy ]]; then
  a1_resolve_local_source
  [[ -f "$A1_SOURCE_ROOT/vote-resource-server/src/main/resources/application-stage.yaml" ]] \
    || a1_die "this script must run from the Vote repository with its nested application"
fi

if [[ "$A1_DRY_RUN" == true ]]; then
  printf '%s\n' \
    'service=vote' \
    "source_root=$A1_SOURCE_ROOT" \
    "branch=$A1_SOURCE_BRANCH" \
    "commit=$A1_SOURCE_COMMIT" \
    "working_tree_dirty=$A1_SOURCE_DIRTY" \
    "snapshot_id=$A1_SHA" \
    "source_state_sha256=$A1_SOURCE_STATE_SHA256" \
    'profiles=local,stage,auth-main' \
    'source_policy=local-working-tree' \
    'build_platform=linux/arm64' \
    'server_build=false' \
    'delivery=checksummed-image-archive' \
    'edge_proxy=nginx' \
    'tls=preserve-existing' \
    'build_daemon=local' \
    "compose_project=$A1_COMPOSE_PROJECT" \
    "public_origin=$A1_PUBLIC_ORIGIN" \
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

[[ -n "$A1_DATA_VOLUME" ]] \
  || a1_die "Vote deploy requires --data-volume with the existing Postgres volume name"
source_snapshot="$A1_WORKDIR/source"
a1_copy_local_source "$source_snapshot"
application_source="$source_snapshot/vote-resource-server"
image="civic-local/vote-8082:${A1_SHA}"
a1_build_java_image "$application_source" "$image" "$repository"
a1_verify_image "$image"
a1_fetch_live_nginx "$A1_WORKDIR/nginx.live.conf"
shasum -a 256 "$A1_WORKDIR/nginx.live.conf" | cut -d' ' -f1 > "$stage/nginx.base.sha256"
node "$A1_SCRIPT_DIR/render-api-nginx.mjs" \
  --base "$A1_WORKDIR/nginx.live.conf" \
  --service vote \
  --host "$A1_PUBLIC_HOST" \
  --output "$stage/candidate.nginx.conf"
install -m 0600 "$A1_SCRIPT_DIR/templates/vote.compose.yaml" "$stage/compose.yaml"
a1_archive_image "$image" "$stage/image.tar.gz"
a1_write_release_env "$stage/release.env" vote "$image" "$A1_COMPOSE_PROJECT" \
  vote-resource-server 8082 /api/v1/me/tasks
a1_stage_and_run_remote "$A1_SERVICE" "$stage"
