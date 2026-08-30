#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: deploy/patch-front2-a1.sh [options]

Builds the current origin/main commit as an immutable linux/arm64 Front2 image,
transfers a checksummed image archive, and replaces only the A1 web service.
Repository tests and the Docker verification target are intentionally skipped.

Options:
  --ssh-key PATH       SSH key (default: $HOME/.ssh/civic-ai-dev_ed25519)
  --host-ip IPV4       A1 address (default: 140.238.17.223)
  --ssh-user USER      SSH user (default: ubuntu)
  --public-host HOST   Public HTTPS host (default: civic-ai.co.kr)
  --dry-run            Validate source and inputs, then print the release plan
  --help               Show this help
EOF
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[front2-a1-patch] %s\n' "$1" >&2
}

validate_private_file() {
  python3 - "$1" "$(id -u)" <<'PY'
import os
import stat
import sys

path = os.path.abspath(sys.argv[1])
owner = int(sys.argv[2])
try:
    metadata = os.lstat(path)
except OSError:
    raise SystemExit(1)
if stat.S_ISLNK(metadata.st_mode):
    raise SystemExit(1)
if not stat.S_ISREG(metadata.st_mode):
    raise SystemExit(1)
if metadata.st_uid != owner or stat.S_IMODE(metadata.st_mode) != 0o600:
    raise SystemExit(1)
PY
}

ssh_key="${CIVIC_A1_SSH_KEY:-${HOME:?HOME is required}/.ssh/civic-ai-dev_ed25519}"
host_ip="${CIVIC_A1_HOST_IP:-140.238.17.223}"
ssh_user="${CIVIC_A1_SSH_USER:-ubuntu}"
public_host="${CIVIC_A1_PUBLIC_HOST:-civic-ai.co.kr}"
dry_run=false

while (($#)); do
  case "$1" in
    --ssh-key) ssh_key="${2:-}"; shift 2 ;;
    --host-ip) host_ip="${2:-}"; shift 2 ;;
    --ssh-user) ssh_user="${2:-}"; shift 2 ;;
    --public-host) public_host="${2:-}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

command -v python3 >/dev/null 2>&1 || die "python3 is required"
validate_private_file "$ssh_key" \
  || die "SSH key must be a current-user mode-0600 regular file and not a symlink"
[[ "$ssh_user" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "invalid SSH user"
[[ "$public_host" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "invalid public host"

host_ip="$(python3 - "$host_ip" <<'PY'
import ipaddress
import sys

try:
    address = ipaddress.ip_address(sys.argv[1])
    if address.version != 4 or not address.is_global:
        raise ValueError
except ValueError:
    raise SystemExit(1)
print(address)
PY
)" || die "host IP must be a public IPv4 address"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(git -C "$script_dir/.." rev-parse --show-toplevel 2>/dev/null)" \
  || die "the script must remain inside the Front2 Git repository"
repository_url="$(git -C "$repository_root" remote get-url origin)" \
  || die "origin remote is required"
case "$repository_url" in
  https://github.com/Ham-n-Cheeze/civic-ai-frontend2|https://github.com/Ham-n-Cheeze/civic-ai-frontend2.git|git@github.com:Ham-n-Cheeze/civic-ai-frontend2.git) ;;
  *) die "origin is not the CIVIC Front2 repository" ;;
esac

git -C "$repository_root" fetch origin main
[[ "$(git -C "$repository_root" symbolic-ref --short HEAD 2>/dev/null)" == main ]] \
  || die "Front2 patch releases must run from main"
source_sha="$(git -C "$repository_root" rev-parse HEAD)"
origin_sha="$(git -C "$repository_root" rev-parse origin/main)"
[[ "$source_sha" == "$origin_sha" ]] \
  || die "HEAD must equal origin/main before deployment"
[[ -z "$(git -C "$repository_root" status --porcelain=v1 --untracked-files=all)" ]] \
  || die "working tree must be clean before deployment"

release_tag="${source_sha:0:12}"
image="civic-release/web:${release_tag}"
source_url="https://github.com/Ham-n-Cheeze/civic-ai-frontend2"
target="${ssh_user}@${host_ip}"

if [[ "$dry_run" == true ]]; then
  printf '%s\n' \
    'status=dry-run' \
    'service=front2' \
    "source_sha=$source_sha" \
    "image=$image" \
    'platform=linux/arm64' \
    'docker_target=runtime' \
    'repository_tests=skipped' \
    'docker_verification_target=skipped' \
    'server_build=false' \
    'cutover=web-only-no-build-no-deps' \
    'deployment_lock=/var/lock/civic-image-patch.lock' \
    'source_discovery=script-location' \
    'nginx_reload=false' \
    "target=$target" \
    "public_origin=https://${public_host}"
  exit 0
fi

for command in docker gzip shasum ssh scp curl; do
  command -v "$command" >/dev/null 2>&1 || die "required command not found: $command"
done
docker buildx version >/dev/null 2>&1 || die "Docker Buildx is required"
case "${DOCKER_HOST:-}" in
  ""|unix://*) ;;
  *) die "remote Docker endpoints are forbidden; use the local Docker daemon" ;;
esac
docker version >/dev/null 2>&1 || die "local Docker daemon is unavailable"
builder_details="$(docker buildx inspect default --bootstrap 2>/dev/null)" \
  || die "Docker Buildx default builder is unavailable"
[[ "$builder_details" == *"linux/arm64"* ]] \
  || die "Docker Buildx default builder does not support linux/arm64"

workdir="$(mktemp -d "${TMPDIR:-/tmp}/civic-front2-a1-patch.XXXXXX")"
remote_stage=""
ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -i "$ssh_key")

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$remote_stage" ]]; then
    ssh "${ssh_options[@]}" "$target" "rm -rf -- '$remote_stage'" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$workdir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

log "building ${image} from origin/main without repository tests"
docker buildx build --builder default --platform linux/arm64 --target runtime --load \
  --label "org.opencontainers.image.revision=${source_sha}" \
  --label "org.opencontainers.image.source=${source_url}" \
  --tag "$image" \
  "$repository_root"

[[ "$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')" == linux/arm64 ]] \
  || die "built image is not linux/arm64"
[[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$source_sha" ]] \
  || die "built image revision label does not match origin/main"
[[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.source"}}')" == "$source_url" ]] \
  || die "built image source label is invalid"
[[ "$(docker image inspect "$image" --format '{{.Config.User}}')" == 10001:10001 ]] \
  || die "built image runtime user is not 10001:10001"

archive_name="front2-${release_tag}-linux-arm64.tar.gz"
checksum_name="${archive_name}.sha256"
log "creating checksummed image archive"
docker save "$image" | gzip -9 > "$workdir/$archive_name"
(
  cd "$workdir"
  shasum -a 256 "$archive_name" > "$checksum_name"
)

remote_stage="/tmp/civic-front2-${release_tag}-$$"
ssh "${ssh_options[@]}" "$target" "mkdir -m 0700 '$remote_stage'"
scp "${ssh_options[@]}" \
  "$workdir/$archive_name" "$workdir/$checksum_name" \
  "$target:$remote_stage/"

log "loading and cutting over Front2 on A1"
ssh "${ssh_options[@]}" "$target" sudo bash -s -- \
  "$remote_stage" "$source_sha" "$image" "$source_url" "$public_host" \
  "$archive_name" "$checksum_name" <<'REMOTE'
set -Eeuo pipefail

stage="$1"
source_sha="$2"
new_image="$3"
source_url="$4"
public_host="$5"
archive_name="$6"
checksum_name="$7"

container="civic-a1-dev-web-1"
nginx_container="civic-public-nginx"
release_tag="${source_sha:0:12}"
release_overlay="/etc/civic/front2-main-${release_tag}.yaml"
rollback_overlay="/etc/civic/front2-main-${release_tag}.rollback.yaml"
changed=false
completed=false

die() {
  printf 'error: %s\n' "$1" >&2
  return 1
}

command -v flock >/dev/null 2>&1 || die "flock is required on A1"
exec 9>/var/lock/civic-image-patch.lock
flock -n 9 || die "another CIVIC image deployment is running"

label() {
  docker inspect "$container" --format "{{index .Config.Labels \"$1\"}}"
}

wait_healthy() {
  local attempt state health
  for attempt in $(seq 1 90); do
    state="$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null || true)"
    health="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>/dev/null || true)"
    if [[ "$state" == running && "$health" == healthy ]]; then
      return 0
    fi
    if [[ "$state" == exited || "$state" == dead || "$health" == unhealthy ]]; then
      break
    fi
    sleep 2
  done
  docker logs --tail 120 "$container" >&2 || true
  return 1
}

require_status() {
  local expected="$1" path="$2" actual
  actual="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    "https://${public_host}${path}" || true)"
  [[ "$actual" == "$expected" ]] \
    || die "${path} expected HTTP ${expected}, got ${actual:-request-failed}"
}

smoke_public() {
  local home_html assets_file asset result status content_type asset_count
  home_html="$(mktemp /tmp/civic-front2-home.XXXXXX)"
  assets_file="$(mktemp /tmp/civic-front2-assets.XXXXXX)"
  if ! curl --silent --show-error --fail "https://${public_host}/home" > "$home_html"; then
    rm -f -- "$home_html" "$assets_file"
    return 1
  fi
  python3 - "$home_html" > "$assets_file" <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import sys

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = set()

    def handle_starttag(self, _tag, attributes):
        for name, value in attributes:
            if name not in {"src", "href"} or value is None:
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or parsed.fragment:
                continue
            if not parsed.path.startswith("/main-assets/_next/static/"):
                continue
            if not parsed.path.endswith((".js", ".css")):
                continue
            self.values.add(urlunsplit(("", "", parsed.path, parsed.query, "")))

parser = Assets()
parser.feed(Path(sys.argv[1]).read_text(encoding="utf-8"))
for value in sorted(parser.values):
    print(value)
PY
  asset_count="$(wc -l < "$assets_file" | tr -d ' ')"
  if [[ "$asset_count" == 0 ]]; then
    printf 'error: /home did not reference any /main-assets Next.js assets\n' >&2
    rm -f -- "$home_html" "$assets_file"
    return 1
  fi
  if grep -E '(src|href)="/_next/static/' "$home_html" >/dev/null; then
    printf 'error: /home contains an unprefixed /_next/static asset\n' >&2
    rm -f -- "$home_html" "$assets_file"
    return 1
  fi
  while IFS= read -r asset; do
    [[ -n "$asset" ]] || continue
    result="$(curl --silent --show-error --output /dev/null \
      --write-out '%{http_code} %{content_type}' "https://${public_host}${asset}" || true)"
    status="${result%% *}"
    content_type="${result#* }"
    [[ "$status" == 200 ]] || {
      printf 'error: asset %s returned HTTP %s\n' "$asset" "$status" >&2
      rm -f -- "$home_html" "$assets_file"
      return 1
    }
    case "${asset%%\?*}" in
      *.js) [[ "$content_type" == application/javascript* || "$content_type" == text/javascript* ]] ;;
      *.css) [[ "$content_type" == text/css* ]] ;;
    esac || {
      printf 'error: asset %s returned unexpected content type %s\n' "$asset" "$content_type" >&2
      rm -f -- "$home_html" "$assets_file"
      return 1
    }
  done < "$assets_file"
  rm -f -- "$home_html" "$assets_file"

  require_status 200 /healthz
  require_status 200 /home
  require_status 401 /api/v1/auth/me
  require_status 401 /api/v1/admin/tasks
  printf 'public_asset_count=%s\n' "$asset_count"
}

docker inspect "$container" >/dev/null || die "Front2 container not found: $container"
[[ "$(docker inspect "$container" --format '{{.State.Status}}')" == running ]] \
  || die "current Front2 container is not running"
[[ "$(docker inspect "$container" --format '{{.State.Health.Status}}')" == healthy ]] \
  || die "current Front2 container is not healthy"
docker inspect "$nginx_container" >/dev/null || die "public Nginx container is missing"
[[ "$(docker inspect "$nginx_container" --format '{{.State.Running}}')" == true ]] \
  || die "public Nginx container is not running"

project="$(label com.docker.compose.project)"
service="$(label com.docker.compose.service)"
working_dir="$(label com.docker.compose.project.working_dir)"
config_files_csv="$(label com.docker.compose.project.config_files)"
env_files_csv="$(label com.docker.compose.project.environment_file)"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "invalid Compose project label"
[[ "$service" == web ]] || die "current container is not the Compose web service"
[[ "$working_dir" == /* && "$working_dir" != *".."* && -d "$working_dir" ]] \
  || die "invalid Compose working directory label"
[[ -n "$config_files_csv" && -n "$env_files_csv" ]] \
  || die "current container lacks Compose config/env file labels"

compose=(docker compose -p "$project" --project-directory "$working_dir")
declare -A seen_configs=()
IFS=',' read -r -a config_files <<< "$config_files_csv"
for config_file in "${config_files[@]}"; do
  [[ "$config_file" == /* && "$config_file" != *".."* && -f "$config_file" ]] \
    || die "invalid or missing Compose config file: $config_file"
  if [[ -z "${seen_configs[$config_file]:-}" ]]; then
    compose+=(-f "$config_file")
    seen_configs[$config_file]=1
  fi
done

declare -A seen_envs=()
IFS=',' read -r -a env_files <<< "$env_files_csv"
for env_file in "${env_files[@]}"; do
  [[ "$env_file" == /* && "$env_file" != *".."* && -f "$env_file" ]] \
    || die "invalid or missing Compose env file: $env_file"
  if [[ -z "${seen_envs[$env_file]:-}" ]]; then
    compose+=(--env-file "$env_file")
    seen_envs[$env_file]=1
  fi
done
[[ -n "${seen_envs[/etc/civic/a1-dev.env]:-}" ]] \
  || die "current Compose labels do not include /etc/civic/a1-dev.env"
[[ -n "${seen_envs[/etc/civic/a1-dev-images.env]:-}" ]] \
  || die "current Compose labels do not include /etc/civic/a1-dev-images.env"

old_image="$(docker inspect "$container" --format '{{.Config.Image}}')"
old_image_id="$(docker inspect "$container" --format '{{.Image}}')"
old_started_at="$(docker inspect "$container" --format '{{.State.StartedAt}}')"
old_restart_count="$(docker inspect "$container" --format '{{.RestartCount}}')"

install -d -o root -g root -m 0755 /etc/civic
release_temp="$(mktemp /etc/civic/.front2-release.XXXXXX)"
rollback_temp="$(mktemp /etc/civic/.front2-rollback.XXXXXX)"
chmod 0600 "$release_temp" "$rollback_temp"
printf 'services:\n  web:\n    image: %s\n' "$new_image" > "$release_temp"
printf 'services:\n  web:\n    image: %s\n' "$old_image" > "$rollback_temp"
install -o root -g root -m 0644 "$release_temp" "$release_overlay"
install -o root -g root -m 0644 "$rollback_temp" "$rollback_overlay"
rm -f -- "$release_temp" "$rollback_temp"

"${compose[@]}" -f "$release_overlay" config --quiet
"${compose[@]}" -f "$rollback_overlay" config --quiet
release_rendered_image="$("${compose[@]}" -f "$release_overlay" config --format json \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["web"]["image"])')"
rollback_rendered_image="$("${compose[@]}" -f "$rollback_overlay" config --format json \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["web"]["image"])')"
[[ "$release_rendered_image" == "$new_image" ]] || die "release overlay did not win for web.image"
[[ "$rollback_rendered_image" == "$old_image" ]] || die "rollback overlay did not restore web.image"

cd "$stage"
sha256sum -c "$checksum_name"
gzip -dc "$archive_name" | docker load >/dev/null
new_image_id="$(docker image inspect "$new_image" --format '{{.Id}}')"
[[ "$(docker image inspect "$new_image" --format '{{.Os}}/{{.Architecture}}')" == linux/arm64 ]] \
  || die "loaded image is not linux/arm64"
[[ "$(docker image inspect "$new_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$source_sha" ]] \
  || die "loaded image revision label is invalid"
[[ "$(docker image inspect "$new_image" --format '{{index .Config.Labels "org.opencontainers.image.source"}}')" == "$source_url" ]] \
  || die "loaded image source label is invalid"
[[ "$(docker image inspect "$new_image" --format '{{.Config.User}}')" == 10001:10001 ]] \
  || die "loaded image runtime user is invalid"

restore_on_failure() {
  local status=$?
  if [[ "$completed" == true || "$status" == 0 ]]; then
    return
  fi
  trap - EXIT
  set +e
  if [[ "$changed" == true ]]; then
    printf 'deployment failed; restoring %s\n' "$old_image" >&2
    "${compose[@]}" -f "$rollback_overlay" up -d --no-build --no-deps web
    wait_healthy
    smoke_public
  fi
  exit "$status"
}
trap restore_on_failure EXIT

cutover_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
changed=true
"${compose[@]}" -f "$release_overlay" up -d --no-build --no-deps web
wait_healthy || die "new Front2 container did not become healthy"
[[ "$(docker inspect "$container" --format '{{.Config.Image}}')" == "$new_image" ]] \
  || die "running Front2 image tag is incorrect"
[[ "$(docker inspect "$container" --format '{{.Image}}')" == "$new_image_id" ]] \
  || die "running Front2 image ID is incorrect"
[[ "$(docker inspect "$container" --format '{{.RestartCount}}')" == 0 ]] \
  || die "new Front2 container restarted"
[[ "$(docker inspect "$container" --format '{{.State.OOMKilled}}')" == false ]] \
  || die "new Front2 container was OOM-killed"
docker exec "$container" node -e \
  "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))" \
  || die "direct Front2 health smoke failed"
smoke_public

error_log_count="$(docker logs --since "$cutover_at" "$container" 2>&1 \
  | grep -Eic '(^|[^[:alpha:]])(fatal|panic|uncaught|unhandled|out of memory)([^[:alpha:]]|$)' || true)"
[[ "$error_log_count" == 0 ]] || die "fatal errors appeared in Front2 logs after cutover"

completed=true
trap - EXIT
printf '%s\n' \
  'status=deployed' \
  "source_sha=$source_sha" \
  "image=$new_image" \
  "image_id=$new_image_id" \
  'platform=linux/arm64' \
  'repository_tests=skipped' \
  'docker_verification_target=skipped' \
  "compose_project=$project" \
  "compose_working_dir=$working_dir" \
  "release_overlay=$release_overlay" \
  "rollback_image=$old_image" \
  "rollback_image_id=$old_image_id" \
  "rollback_overlay=$rollback_overlay" \
  "previous_started_at=$old_started_at" \
  "previous_restart_count=$old_restart_count" \
  'container_health=healthy' \
  'db_migration=none' \
  'nginx_reload=false'
REMOTE
