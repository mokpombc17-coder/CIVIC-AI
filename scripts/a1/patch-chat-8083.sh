#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib-a1-image-patch.sh
. "$script_dir/lib-a1-image-patch.sh"

A1_SERVICE="chat"
repository="https://github.com/Ham-n-Cheeze/chat-resource-server.git"
a1_parse_args "$(basename "$0")" "$@"
A1_COMPOSE_PROJECT="${A1_COMPOSE_PROJECT:-civic-chat-8083}"
if [[ "$A1_ACTION" == deploy ]]; then
  a1_resolve_local_source
  [[ -f "$A1_SOURCE_ROOT/src/main/resources/application-stage.yaml" ]] \
    || a1_die "this script must run from the Chat repository with application-stage.yaml"
fi

if [[ "$A1_DRY_RUN" == true ]]; then
  printf '%s\n' \
    'service=chat' \
    "source_root=$A1_SOURCE_ROOT" \
    "branch=$A1_SOURCE_BRANCH" \
    "commit=$A1_SOURCE_COMMIT" \
    "working_tree_dirty=$A1_SOURCE_DIRTY" \
    "snapshot_id=$A1_SHA" \
    "source_state_sha256=$A1_SOURCE_STATE_SHA256" \
    'profiles=stage,auth-main' \
    'source_policy=local-working-tree' \
    'stage_profile_required=true' \
    'build_platform=linux/arm64' \
    'server_build=false' \
    'delivery=checksummed-image-archive' \
    'edge_proxy=nginx' \
    'tls=preserve-existing' \
    'build_daemon=local' \
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
  || a1_die "Chat deploy requires --data-volume with the existing Mongo volume name"
source_snapshot="$A1_WORKDIR/source"
a1_copy_local_source "$source_snapshot"
image="civic-local/chat-8083:${A1_SHA}"

python3 - "$source_snapshot/src/main/java/com/hamcheeze/chat/websocket/config/RuntimeProfileValidator.java" <<'PY'
import pathlib
import re
import sys

validator = pathlib.Path(sys.argv[1])
if not validator.exists():
    raise SystemExit(0)
text = validator.read_text(encoding="utf-8")
match = re.search(
    r"SUPPORTED_RUNTIME_PROFILES\s*=\s*Set\.of\((.*?)\);",
    text,
    flags=re.DOTALL,
)
if match is None or '"stage"' not in match.group(1):
    print(
        "error: requested Chat SHA does not accept stage as a runtime profile; "
        "source patching and local-profile fallback are forbidden",
        file=sys.stderr,
    )
    raise SystemExit(1)
PY

a1_build_java_image "$source_snapshot" "$image" "$repository"
a1_verify_image "$image"
a1_fetch_live_nginx "$A1_WORKDIR/nginx.live.conf"
shasum -a 256 "$A1_WORKDIR/nginx.live.conf" | cut -d' ' -f1 > "$stage/nginx.base.sha256"
node "$A1_SCRIPT_DIR/render-api-nginx.mjs" \
  --base "$A1_WORKDIR/nginx.live.conf" \
  --service chat \
  --host "$A1_PUBLIC_HOST" \
  --output "$stage/candidate.nginx.conf"
install -m 0600 "$A1_SCRIPT_DIR/templates/chat.compose.yaml" "$stage/compose.yaml"
a1_archive_image "$image" "$stage/image.tar.gz"
a1_write_release_env "$stage/release.env" chat "$image" "$A1_COMPOSE_PROJECT" \
  chat-resource-server 8083 /api/v1/rooms
a1_stage_and_run_remote "$A1_SERVICE" "$stage"
