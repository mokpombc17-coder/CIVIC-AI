#!/usr/bin/env bash

set -Eeuo pipefail

die() {
  printf 'error: %s\n' "$1" >&2
  # Returning lets an active ERR trap restore the prior app and Nginx release.
  # Before a trap is installed, `set -e` still terminates the script normally.
  return 1
}

action="${1:-}"
service="${2:-}"
source_sha="${3:-}"
stage="${4:-}"
[[ "$action" == deploy || "$action" == rollback ]] || die "invalid action"
[[ "$service" == front ]] || die "invalid service"
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || die "invalid source SHA"
[[ "$stage" == /tmp/civic-a1-* && "$stage" != *".."* ]] || die "invalid stage path"

command -v flock >/dev/null 2>&1 || die "flock is required"
exec 9>/var/lock/civic-image-patch.lock
flock -n 9 || die "another CIVIC image deployment is running"

root="/opt/civic/image-patches/${service}"
releases="$root/releases"
release="$releases/$source_sha"
current="$root/current"
previous="$root/previous"

load_env() {
  local directory="$1"
  [[ -f "$directory/release.env" && ! -L "$directory/release.env" ]] || die "release metadata missing"
  set -a
  # release.env is generated locally from validated, non-secret values.
  . "$directory/release.env"
  set +a
  [[ "$SERVICE" == "$service" && "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "release metadata mismatch"
  [[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || die "invalid source commit"
  [[ "$PUBLIC_HOST" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "invalid public host"
  [[ "$PUBLIC_ORIGIN" == "https://${PUBLIC_HOST}" ]] || die "public origin mismatch"
  for path in "$NGINX_CONFIG" "$NGINX_MAIN_CONFIG" "$NGINX_TLS_DIR"; do
    [[ "$path" == /* && "$path" != *".."* ]] || die "invalid Nginx path"
  done
  [[ "$NGINX_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || die "invalid Nginx container"
  [[ "$COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "invalid Compose project"
  [[ "$COMPOSE_SERVICE" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || die "invalid Compose service"
  [[ "$SERVICE_PORT" =~ ^[0-9]+$ ]] || die "invalid service port"
  [[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || die "invalid image manifest digest"
  [[ "$ARCHIVE_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "invalid archive digest"
}

compose() {
  local directory="$1"
  shift
  FRONT_IMAGE="$IMAGE_REF" docker compose -p "$COMPOSE_PROJECT" \
    -f "$directory/compose.yaml" "$@"
}

ensure_nginx_runtime() {
  [[ -f "$NGINX_CONFIG" && ! -L "$NGINX_CONFIG" ]] || die "live Nginx config missing"
  [[ -f "$NGINX_MAIN_CONFIG" && ! -L "$NGINX_MAIN_CONFIG" ]] || die "Nginx main config missing"
  [[ -d "$NGINX_TLS_DIR" && ! -L "$NGINX_TLS_DIR" ]] || die "Nginx TLS directory missing"
  for certificate in fullchain.pem privkey.pem; do
    [[ -f "$NGINX_TLS_DIR/$certificate" && ! -L "$NGINX_TLS_DIR/$certificate" ]] \
      || die "Nginx TLS file missing: $certificate"
  done
  docker inspect "$NGINX_CONTAINER" >/dev/null || die "public Nginx container missing"
  [[ "$(docker inspect "$NGINX_CONTAINER" --format '{{.State.Running}}')" == true ]] \
    || die "public Nginx container is not running"
}

tls_fingerprint() {
  sha256sum "$NGINX_TLS_DIR/fullchain.pem" "$NGINX_TLS_DIR/privkey.pem" | sha256sum | cut -d' ' -f1
}

validate_nginx() {
  local candidate="$1" nginx_image nginx_user
  local -a user_args=()
  [[ -f "$candidate" && ! -L "$candidate" ]] || die "Nginx candidate missing"
  nginx_image="$(docker inspect "$NGINX_CONTAINER" --format '{{.Config.Image}}')"
  nginx_user="$(docker inspect "$NGINX_CONTAINER" --format '{{.Config.User}}')"
  [[ -z "$nginx_user" ]] || user_args=(--user "$nginx_user")
  docker run --rm --network host "${user_args[@]}" \
    -v "$NGINX_MAIN_CONFIG:/etc/nginx/nginx.conf:ro" \
    -v "$candidate:/etc/nginx/conf.d/default.conf:ro" \
    -v "$NGINX_TLS_DIR:/etc/nginx/tls:ro" \
    "$nginx_image" nginx -t >/dev/null
}

reload_nginx() {
  docker exec "$NGINX_CONTAINER" nginx -t >/dev/null
  docker exec "$NGINX_CONTAINER" nginx -s reload >/dev/null
}

copy_nginx_in_place() {
  local source="$1"
  [[ -f "$source" && ! -L "$source" ]] || die "Nginx source missing"
  [[ -f "$NGINX_CONFIG" && ! -L "$NGINX_CONFIG" ]] || die "live Nginx config missing"
  cp -- "$source" "$NGINX_CONFIG"
  chmod 0644 "$NGINX_CONFIG"
}

merge_service_nginx_blocks() {
  local source="$1" output="$2"
  python3 - "$NGINX_CONFIG" "$source" "$output" <<'PY'
import pathlib
import sys

live_path, source_path, output_path = sys.argv[1:]
markers = [
    ("# BEGIN CIVIC FRONT 3001 IMAGE MAP MANAGED", "# END CIVIC FRONT 3001 IMAGE MAP MANAGED"),
    ("# BEGIN CIVIC FRONT 3001 MANAGED", "# END CIVIC FRONT 3001 MANAGED"),
]
live = pathlib.Path(live_path).read_text(encoding="utf-8").splitlines()
source_lines = pathlib.Path(source_path).read_text(encoding="utf-8").splitlines()

def bounds(lines, begin, end):
    starts = [index for index, line in enumerate(lines) if line.strip() == begin]
    finishes = [index for index, line in enumerate(lines) if line.strip() == end]
    if len(starts) != 1 or len(finishes) != 1 or starts[0] >= finishes[0]:
        raise SystemExit(f"invalid managed Nginx block: {begin}")
    return starts[0], finishes[0]

for begin, end in markers:
    source_start, source_end = bounds(source_lines, begin, end)
    live_start, live_end = bounds(live, begin, end)
    live[live_start:live_end + 1] = source_lines[source_start:source_end + 1]
pathlib.Path(output_path).write_text("\n".join(live).rstrip() + "\n", encoding="utf-8")
PY
  chmod 0600 "$output"
}

wait_healthy() {
  local directory="$1" container_id status
  for _ in $(seq 1 36); do
    container_id="$(compose "$directory" ps -q "$COMPOSE_SERVICE")"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect "$container_id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')"
      [[ "$status" == healthy || "$status" == running ]] && return 0
      [[ "$status" == unhealthy || "$status" == exited || "$status" == dead ]] && break
    fi
    sleep 5
  done
  compose "$directory" logs --tail=120 "$COMPOSE_SERVICE" >&2 || true
  return 1
}

smoke() {
  local health_path health_status public_status
  health_path="/chat"
  health_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "http://127.0.0.1:${SERVICE_PORT}${health_path}" || true)"
  [[ "$health_status" =~ ^(200|301|302|303|307|308|401)$ ]] \
    || die "direct Front smoke failed: HTTP $health_status"
  public_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "https://${PUBLIC_HOST}${PROTECTED_PATH}" || true)"
  [[ "$public_status" =~ ^(200|301|302|303|307|308|401)$ ]] \
    || die "public smoke failed: HTTP $public_status"
}

activate_release() {
  local directory="$1"
  load_env "$directory"
  compose "$directory" config --quiet
  compose "$directory" up -d --no-build
  wait_healthy "$directory" || die "container did not become healthy"
}

reject_foreign_port_owner() {
  local container_id owner
  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    owner="$(docker inspect "$container_id" --format '{{index .Config.Labels "com.docker.compose.project"}}')"
    [[ "$owner" == "$COMPOSE_PROJECT" ]] \
      || die "loopback port ${SERVICE_PORT} is owned by another Compose project: ${owner:-unlabelled}"
  done < <(docker ps --filter "publish=${SERVICE_PORT}" --format '{{.ID}}')
}

mkdir -p "$releases"

if [[ "$action" == rollback ]]; then
  [[ -L "$current" && -L "$previous" ]] || die "rollback requires current and previous releases"
  old_current="$(readlink -f "$current")"
  rollback_release="$(readlink -f "$previous")"
  [[ "$old_current" == "$releases/"* && "$rollback_release" == "$releases/"* ]] || die "release links escaped release root"
  load_env "$old_current"
  ensure_nginx_runtime
  tls_before="$(tls_fingerprint)"
  rollback_candidate="$(mktemp /tmp/civic-nginx-rollback.XXXXXX)"
  live_before="$(mktemp /tmp/civic-nginx-before-rollback.XXXXXX)"
  cp -- "$NGINX_CONFIG" "$live_before"
  merge_service_nginx_blocks "$rollback_release/nginx.conf.candidate" "$rollback_candidate"
  validate_nginx "$rollback_candidate"

  restore_failed_rollback() {
    local status="$?"
    trap - ERR
    copy_nginx_in_place "$live_before" || true
    reload_nginx || true
    ln -sfn "$old_current" "$current"
    activate_release "$old_current" || true
    rm -f -- "$rollback_candidate" "$live_before"
    exit "$status"
  }
  trap restore_failed_rollback ERR
  copy_nginx_in_place "$rollback_candidate"
  reload_nginx
  ln -sfn "$rollback_release" "$current"
  activate_release "$rollback_release"
  load_env "$rollback_release"
  smoke
  [[ "$(tls_fingerprint)" == "$tls_before" ]] || die "TLS files changed during rollback"
  ln -sfn "$old_current" "$previous"
  rm -f -- "$rollback_candidate" "$live_before"
  trap - ERR
  printf 'status=rolled-back\nservice=%s\nrelease=%s\nimage=%s\nimage_id=%s\nedge_proxy=nginx\n' \
    "$service" "$(basename "$rollback_release")" "$IMAGE_REF" "$IMAGE_ID"
  exit 0
fi

[[ -d "$stage" && ! -L "$stage" ]] || die "staging directory missing"
for required in image.tar.gz image.tar.gz.sha256 compose.yaml candidate.nginx.conf nginx.base.sha256 release.env; do
  [[ -f "$stage/$required" && ! -L "$stage/$required" ]] || die "staged file missing: $required"
done
(cd "$stage" && sha256sum -c image.tar.gz.sha256)
load_env "$stage"
[[ "$SOURCE_SHA" == "$source_sha" ]] || die "staged SHA mismatch"
gzip -dc "$stage/image.tar.gz" | docker load >/dev/null
actual_id="$(docker image inspect "$IMAGE_REF" --format '{{.Id}}')"
actual_platform="$(docker image inspect "$IMAGE_REF" --format '{{.Os}}/{{.Architecture}}')"
actual_revision="$(docker image inspect "$IMAGE_REF" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
actual_snapshot="$(docker image inspect "$IMAGE_REF" --format '{{index .Config.Labels "co.civic.source.snapshot"}}')"
[[ "$actual_id" == "$IMAGE_ID" ]] || die "loaded image ID mismatch"
[[ "$actual_platform" == linux/arm64 ]] || die "loaded image platform mismatch: $actual_platform"
[[ "$actual_revision" == "$SOURCE_COMMIT" ]] || die "loaded image revision mismatch"
[[ "$actual_snapshot" == "$source_sha" ]] || die "loaded image snapshot mismatch"

if [[ -e "$release" ]]; then
  [[ -d "$release" && ! -L "$release" ]] || die "release path is not a directory"
  cmp -s "$stage/release.env" "$release/release.env" || die "existing release metadata differs"
  cmp -s "$stage/compose.yaml" "$release/compose.yaml" || die "existing release Compose differs"
  cmp -s "$stage/candidate.nginx.conf" "$release/nginx.conf.candidate" \
    || die "existing release Nginx candidate differs; use a new source SHA or roll back first"
else
  install -d -m 0700 "$release"
  install -m 0600 "$stage/compose.yaml" "$release/compose.yaml"
  install -m 0600 "$stage/release.env" "$release/release.env"
  install -m 0600 "$stage/candidate.nginx.conf" "$release/nginx.conf.candidate"
  install -m 0600 "$stage/nginx.base.sha256" "$release/nginx.base.sha256"
fi

load_env "$release"
reject_foreign_port_owner
ensure_nginx_runtime
expected_nginx_hash="$(tr -d '[:space:]' < "$release/nginx.base.sha256")"
[[ "$expected_nginx_hash" =~ ^[0-9a-f]{64}$ ]] || die "invalid Nginx base hash"
actual_nginx_hash="$(sha256sum "$NGINX_CONFIG" | cut -d' ' -f1)"
[[ "$actual_nginx_hash" == "$expected_nginx_hash" ]] \
  || die "public Nginx config changed after the candidate was rendered; rebuild the release candidate"
validate_nginx "$release/nginx.conf.candidate"
cp -- "$NGINX_CONFIG" "$release/nginx.conf.before"
chmod 0600 "$release/nginx.conf.before"
tls_before="$(tls_fingerprint)"

prior=""
if [[ -L "$current" ]]; then
  prior="$(readlink -f "$current")"
  [[ "$prior" == "$releases/"* ]] || die "current release link escaped release root"
fi

rollback_failed_deploy() {
  local status="$?"
  trap - ERR
  if [[ -f "$release/nginx.conf.before" ]]; then
    copy_nginx_in_place "$release/nginx.conf.before" || true
    reload_nginx || true
  fi
  if [[ -n "$prior" && -d "$prior" ]]; then
    ln -sfn "$prior" "$current"
    activate_release "$prior" || true
  else
    compose "$release" stop "$COMPOSE_SERVICE" || true
    rm -f -- "$current"
  fi
  exit "$status"
}
trap rollback_failed_deploy ERR

ln -sfn "$release" "$current"
activate_release "$release"
copy_nginx_in_place "$release/nginx.conf.candidate"
reload_nginx
smoke
[[ "$(tls_fingerprint)" == "$tls_before" ]] || die "TLS files changed during deployment"
if [[ -n "$prior" && "$prior" != "$release" ]]; then
  ln -sfn "$prior" "$previous"
fi
trap - ERR

printf 'status=deployed\nservice=%s\nsha=%s\nimage=%s\nimage_id=%s\narchive_sha256=%s\nplatform=linux/arm64\ncompose_project=%s\nedge_proxy=nginx\npublic_origin=%s\n' \
  "$service" "$source_sha" "$IMAGE_REF" "$IMAGE_ID" "$ARCHIVE_SHA256" "$COMPOSE_PROJECT" "$PUBLIC_ORIGIN"
