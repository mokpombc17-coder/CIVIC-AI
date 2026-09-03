#!/usr/bin/env bash

set -Eeuo pipefail

A1_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
A1_PLATFORM="linux/arm64"
A1_SSH_USER="ubuntu"
A1_PUBLIC_HOST="civic-ai.co.kr"
A1_NGINX_CONFIG="/etc/civic/nginx/nginx-single-ingress.conf.candidate"
A1_NGINX_MAIN_CONFIG="/etc/civic/nginx/nginx.conf"
A1_NGINX_TLS_DIR="/etc/civic/nginx/tls"
A1_NGINX_CONTAINER="civic-public-nginx"
A1_FRONT_NODE_IMAGE="node:24.18.0-bookworm-slim"
A1_FRONT_PNPM_STORE_VOLUME="civic-a1-front-pnpm-store"
A1_DEFAULT_SSH_KEY="/Users/junseok/Downloads/civic-a1-deploy/ssh/civic-ai-dev_ed25519"
A1_DEFAULT_HOST_IP="140.238.17.223"
A1_DEFAULT_DOCKER_CONFIG="/Users/junseok/.config/civic-a1/docker"
A1_DEFAULT_DOCKER_PLUGIN_DIR="/Users/junseok/.docker/cli-plugins"
A1_DRY_RUN=false
A1_COMPOSE_PROJECT=""
A1_SOURCE_ROOT=""
A1_SOURCE_BRANCH=""
A1_SOURCE_COMMIT=""
A1_SOURCE_DIRTY=""
A1_SOURCE_STATE_SHA256=""

a1_die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

a1_log() {
  printf '[a1-image-patch] %s\n' "$1" >&2
}

a1_usage() {
  local command_name="$1"
  cat <<EOF
Usage: ${command_name} [--action deploy|rollback] [options]

Defaults for this computer:
  --ssh-key PATH           ${A1_DEFAULT_SSH_KEY}
  --host-ip PUBLIC_IPV4    ${A1_DEFAULT_HOST_IP}
  --action deploy          Deploy the current working tree

Options:
  --sha SHA                Deploy snapshot ID to confirm, or required rollback release ID
  --ssh-user USER          SSH user (default: ubuntu)
  --public-host HOST       HTTPS host (default: civic-ai.co.kr)
  --compose-project NAME   Existing Compose project name
  --nginx-config PATH      Public Nginx config (default: /etc/civic/nginx/nginx-public.conf)
  --nginx-container NAME   Public Nginx container (default: civic-public-nginx)
  --dry-run                Validate inputs and print the local-working-tree deployment plan
  --help                   Show this help
EOF
}

a1_parse_args() {
  local command_name="$1"
  shift
  A1_SSH_KEY="$A1_DEFAULT_SSH_KEY"
  A1_HOST_IP="$A1_DEFAULT_HOST_IP"
  A1_SHA=""
  A1_ACTION="deploy"
  while (($#)); do
    case "$1" in
      --ssh-key) A1_SSH_KEY="${2:-}"; shift 2 ;;
      --host-ip) A1_HOST_IP="${2:-}"; shift 2 ;;
      --sha) A1_SHA="${2:-}"; shift 2 ;;
      --action) A1_ACTION="${2:-}"; shift 2 ;;
      --ssh-user) A1_SSH_USER="${2:-}"; shift 2 ;;
      --public-host) A1_PUBLIC_HOST="${2:-}"; shift 2 ;;
      --compose-project) A1_COMPOSE_PROJECT="${2:-}"; shift 2 ;;
      --nginx-config) A1_NGINX_CONFIG="${2:-}"; shift 2 ;;
      --nginx-container) A1_NGINX_CONTAINER="${2:-}"; shift 2 ;;
      --dry-run) A1_DRY_RUN=true; shift ;;
      --help|-h) a1_usage "$command_name"; exit 0 ;;
      *) a1_die "unknown option: $1" ;;
    esac
  done

  a1_validate_mode_0600_file "$A1_SSH_KEY" \
    || a1_die "SSH key must be a current-user mode-0600 regular file and not a symlink"
  case "$A1_ACTION" in deploy|rollback) ;; *) a1_die "action must be deploy or rollback" ;; esac
  if [[ -n "$A1_SHA" ]]; then
    [[ "$A1_SHA" =~ ^[0-9a-f]{40}$ ]] \
      || a1_die "SHA must be 40 lowercase hexadecimal characters"
  fi
  if [[ "$A1_ACTION" == rollback && -z "$A1_SHA" ]]; then
    a1_die "rollback requires --sha with the deployed snapshot ID"
  fi
  [[ "$A1_SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || a1_die "invalid SSH user"
  [[ "$A1_PUBLIC_HOST" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || a1_die "invalid public host"
  [[ "$A1_NGINX_CONFIG" == /* && "$A1_NGINX_CONFIG" != *".."* ]] || a1_die "Nginx path must be absolute"
  [[ "$A1_NGINX_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || a1_die "invalid Nginx container"
  if [[ -n "$A1_COMPOSE_PROJECT" ]]; then
    [[ "$A1_COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || a1_die "invalid Compose project"
  fi

  A1_HOST_IP="$(python3 - "$A1_HOST_IP" <<'PY'
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
  )" || a1_die "host IP must be a public IPv4 address"
  A1_PUBLIC_ORIGIN="https://${A1_PUBLIC_HOST}"
  A1_TARGET="${A1_SSH_USER}@${A1_HOST_IP}"
  A1_SSH_OPTIONS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -i "$A1_SSH_KEY")
}

a1_validate_mode_0600_file() {
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

a1_prepare_local_docker() {
  local config_dir="${A1_DOCKER_CONFIG:-$A1_DEFAULT_DOCKER_CONFIG}"
  local plugin_dir="${A1_DOCKER_PLUGIN_DIR:-$A1_DEFAULT_DOCKER_PLUGIN_DIR}"
  local plugin source target

  mkdir -p "$config_dir/cli-plugins"
  chmod 0700 "$config_dir" "$config_dir/cli-plugins"
  if [[ ! -e "$config_dir/config.json" && ! -L "$config_dir/config.json" ]]; then
    (umask 077; printf '%s\n' '{}' > "$config_dir/config.json")
  fi
  if [[ ! -f "$config_dir/config.json" || -L "$config_dir/config.json" ]]; then
    a1_die "dedicated Docker config must be a regular file: $config_dir/config.json"
  fi
  chmod 0600 "$config_dir/config.json"

  for plugin in docker-buildx docker-compose; do
    source="$plugin_dir/$plugin"
    target="$config_dir/cli-plugins/$plugin"
    if [[ ! -e "$target" && ! -L "$target" ]]; then
      [[ -x "$source" ]] || a1_die "Docker CLI plugin not found: $source"
      ln -s "$source" "$target"
    fi
  done

  export DOCKER_CONFIG="$config_dir"
  export DOCKER_CONTEXT="${A1_DOCKER_CONTEXT:-default}"
}

a1_require_commands() {
  a1_prepare_local_docker
  local command
  for command in git docker gzip shasum ssh scp node python3; do
    command -v "$command" >/dev/null 2>&1 || a1_die "required command not found: $command"
  done
  docker buildx version >/dev/null 2>&1 || a1_die "Docker Buildx is required"
  case "${DOCKER_HOST:-}" in
    ""|unix://*) ;;
    *) a1_die "remote Docker endpoints are forbidden; use the local Docker daemon" ;;
  esac
  local daemon_architecture builder_platforms
  daemon_architecture="$(docker version --format '{{.Server.Arch}}')" \
    || a1_die "local Docker daemon is unavailable"
  builder_platforms="$(docker buildx inspect default 2>/dev/null \
    | sed -n 's/^Platforms:[[:space:]]*//p')"
  [[ ",${builder_platforms// /}," == *,linux/arm64,* ]] \
    || a1_die "default Buildx builder does not support linux/arm64 (daemon: ${daemon_architecture:-unknown})"
}

a1_make_workdir() {
  local work_root="${HOME}/.cache"
  mkdir -p "$work_root"
  chmod 0700 "$work_root"
  A1_WORKDIR="$(mktemp -d "${work_root}/civic-a1-image-patch.XXXXXX")"
  trap 'status=$?; trap - EXIT HUP INT TERM; rm -rf -- "${A1_WORKDIR:-}"; exit "$status"' EXIT HUP INT TERM
}

a1_source_state_sha256() {
  local source="$1"
  python3 - "$source" <<'PY'
import hashlib
import os
import pathlib
import stat
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()
paths = subprocess.check_output(
    ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"]
).split(bytes([0]))
digest = hashlib.sha256()
for raw_path in sorted(path for path in paths if path):
    digest.update(len(raw_path).to_bytes(8, "big"))
    digest.update(raw_path)
    path = root / os.fsdecode(raw_path)
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        digest.update(b"missing")
        continue
    digest.update(stat.S_IMODE(metadata.st_mode).to_bytes(4, "big"))
    if path.is_symlink():
        digest.update(b"symlink" + bytes([0]) + os.fsencode(os.readlink(path)))
    elif path.is_file():
        digest.update(b"file" + bytes([0]))
        with path.open("rb") as source_file:
            for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
                digest.update(chunk)
    else:
        digest.update(b"other" + bytes([0]))
print(digest.hexdigest())
PY
}

a1_resolve_local_source() {
  local requested_sha="$A1_SHA"
  A1_SOURCE_ROOT="$(git -C "$A1_SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" \
    || a1_die "scripts/a1 must be inside the Git repository being deployed"
  [[ "$A1_SCRIPT_DIR" == "$A1_SOURCE_ROOT/scripts/a1" ]] \
    || a1_die "scripts must be installed at the repository root under scripts/a1"
  A1_SOURCE_COMMIT="$(git -C "$A1_SOURCE_ROOT" rev-parse HEAD)" \
    || a1_die "could not resolve the current local commit"
  A1_SOURCE_BRANCH="$(git -C "$A1_SOURCE_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null \
    || printf 'detached')"
  if [[ -n "$(git -C "$A1_SOURCE_ROOT" status --porcelain=v1 --untracked-files=all)" ]]; then
    A1_SOURCE_DIRTY=true
  else
    A1_SOURCE_DIRTY=false
  fi
  A1_SOURCE_STATE_SHA256="$(a1_source_state_sha256 "$A1_SOURCE_ROOT")" \
    || a1_die "could not fingerprint the current working tree"
  A1_SHA="${A1_SOURCE_STATE_SHA256:0:40}"
  if [[ -n "$requested_sha" && "$requested_sha" != "$A1_SHA" ]]; then
    a1_die "--sha does not match the current working-tree snapshot; expected $A1_SHA"
  fi
}

a1_copy_local_source() {
  local destination="$1"
  [[ ! -e "$destination" ]] || a1_die "temporary source snapshot already exists"
  python3 - "$A1_SOURCE_ROOT" "$destination" <<'PY'
import os
import pathlib
import shutil
import subprocess
import sys

source = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2])
destination.mkdir(mode=0o700, parents=True)
paths = subprocess.check_output(
    ["git", "-C", str(source), "ls-files", "-z", "--cached", "--others", "--exclude-standard"]
).split(bytes([0]))
for raw_path in (path for path in paths if path):
    relative = pathlib.Path(os.fsdecode(raw_path))
    source_path = source / relative
    if not source_path.exists() and not source_path.is_symlink():
        continue
    destination_path = destination / relative
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    if source_path.is_symlink():
        destination_path.symlink_to(os.readlink(source_path))
    elif source_path.is_file():
        shutil.copy2(source_path, destination_path, follow_symlinks=False)
PY
  a1_assert_source_unchanged
}

a1_assert_source_unchanged() {
  local actual
  actual="$(a1_source_state_sha256 "$A1_SOURCE_ROOT")" \
    || a1_die "could not fingerprint the working tree after the build"
  [[ "$actual" == "$A1_SOURCE_STATE_SHA256" ]] \
    || a1_die "the build changed source files; restore the working tree before deploying"
}

a1_build_front_image() {
  local source="$1" image="$2"
  local node_runtime_image runtime_context
  a1_log "resolving the Linux ARM64 Node build/runtime image"
  docker pull --platform "$A1_PLATFORM" "$A1_FRONT_NODE_IMAGE"
  node_runtime_image="$(docker image inspect "$A1_FRONT_NODE_IMAGE" --format '{{index .RepoDigests 0}}')"
  [[ "$node_runtime_image" == *@sha256:* ]] \
    || a1_die "could not resolve an immutable Node runtime digest"
  docker volume create "$A1_FRONT_PNPM_STORE_VOLUME" >/dev/null
  a1_log "building the Front standalone artifact in local ARM64 Linux"
  docker run --rm --platform "$A1_PLATFORM" \
    -e PNPM_STORE_DIR=/pnpm/store \
    -e "NEXT_PUBLIC_CHAT_API_URL=$A1_PUBLIC_ORIGIN" \
    -e "NEXT_PUBLIC_VOTE_API_URL=$A1_PUBLIC_ORIGIN" \
    -v "$A1_FRONT_PNPM_STORE_VOLUME:/pnpm/store" \
    -v "$source:/workspace" \
    -v "$A1_SCRIPT_DIR/build-front-artifact.sh:/usr/local/bin/civic-build-front:ro" \
    -w /workspace \
    "$node_runtime_image" bash /usr/local/bin/civic-build-front
  a1_assert_source_unchanged
  runtime_context="$source/apps/web/.next/standalone"
  [[ -f "$runtime_context/apps/web/server.js" ]] \
    || a1_die "Front standalone runtime context is incomplete"
  a1_log "packaging the prebuilt standalone artifact as an immutable runtime image"
  docker buildx build --builder default --platform "$A1_PLATFORM" --load \
    --build-arg "NODE_RUNTIME_IMAGE=$node_runtime_image" \
    --label "org.opencontainers.image.revision=${A1_SOURCE_COMMIT}" \
    --label "co.civic.source.snapshot=${A1_SHA}" \
    --label "co.civic.source.dirty=${A1_SOURCE_DIRTY}" \
    --label "org.opencontainers.image.source=https://github.com/Ham-n-Cheeze/civic-ai-frontend" \
    --tag "$image" --file "$A1_SCRIPT_DIR/templates/front.runtime.Dockerfile" "$runtime_context"
}

a1_verify_image() {
  local image="$1"
  local platform revision snapshot
  platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
  revision="$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  snapshot="$(docker image inspect "$image" --format '{{index .Config.Labels "co.civic.source.snapshot"}}')"
  [[ "$platform" == "$A1_PLATFORM" ]] || a1_die "built image platform is ${platform}, expected ${A1_PLATFORM}"
  [[ "$revision" == "$A1_SOURCE_COMMIT" ]] || a1_die "built image revision label does not match the local commit"
  [[ "$snapshot" == "$A1_SHA" ]] || a1_die "built image snapshot label does not match the working tree"
}

a1_archive_image() {
  local image="$1" destination="$2"
  a1_log "saving the image as a checksummed archive"
  docker save "$image" | gzip -9 > "$destination"
  (cd "$(dirname "$destination")" && shasum -a 256 "$(basename "$destination")" > "$(basename "$destination").sha256")
  A1_ARCHIVE_SHA256="$(cut -d' ' -f1 < "${destination}.sha256")"
  A1_IMAGE_ID="$(python3 - "$destination" "$image" <<'PY'
import json
import sys
import tarfile

archive = sys.argv[1]
with tarfile.open(archive, mode="r:gz") as bundle:
    index_member = bundle.extractfile("index.json")
    if index_member is None:
        raise SystemExit(1)
    index = json.load(index_member)
entries = index.get("manifests", [])
if len(entries) != 1:
    raise SystemExit(1)
digest = entries[0].get("digest", "")
if not digest.startswith("sha256:") or len(digest) != 71:
    raise SystemExit(1)
if any(character not in "0123456789abcdef" for character in digest.removeprefix("sha256:")):
    raise SystemExit(1)
print(digest)
PY
  )" || a1_die "could not resolve the canonical image manifest digest from the archive"
}

a1_extract_front_assets() {
  local image="$1" output="$2" extraction_root="$3"
  local container_id
  mkdir -p "$extraction_root/static" "$extraction_root/public"
  container_id="$(docker create "$image")"
  trap 'docker rm -f "${container_id:-}" >/dev/null 2>&1 || true' RETURN
  docker cp "${container_id}:/app/apps/web/.next/static/." "$extraction_root/static/"
  docker cp "${container_id}:/app/apps/web/public/." "$extraction_root/public/"
  (
    cd "$extraction_root/static"
    find . -type f -print | LC_ALL=C sort | sed 's#^\./#/_next/static/#'
    cd "$extraction_root/public"
    find . -type f -print | LC_ALL=C sort | sed 's#^\./#/#'
  ) | LC_ALL=C sort -u > "$output"
  docker rm -f "$container_id" >/dev/null
  trap - RETURN
  [[ -s "$output" ]] || a1_die "Front asset extraction produced an empty manifest"
}

a1_fetch_live_nginx() {
  local output="$1"
  ssh "${A1_SSH_OPTIONS[@]}" "$A1_TARGET" sudo test -f "$A1_NGINX_CONFIG" \
    || a1_die "server Nginx config was not found"
  ssh "${A1_SSH_OPTIONS[@]}" "$A1_TARGET" sudo cat "$A1_NGINX_CONFIG" > "$output"
  [[ -s "$output" ]] || a1_die "server Nginx config is empty"
}

a1_write_release_env() {
  local output="$1" service="$2" image="$3" project="$4" compose_service="$5" \
    port="$6" protected_path="$7"
  {
    printf 'SERVICE=%s\n' "$service"
    printf 'SOURCE_SHA=%s\n' "$A1_SHA"
    printf 'SOURCE_COMMIT=%s\n' "$A1_SOURCE_COMMIT"
    printf 'SOURCE_DIRTY=%s\n' "$A1_SOURCE_DIRTY"
    printf 'SOURCE_STATE_SHA256=%s\n' "$A1_SOURCE_STATE_SHA256"
    printf 'IMAGE_REF=%s\n' "$image"
    printf 'IMAGE_ID=%s\n' "$A1_IMAGE_ID"
    printf 'ARCHIVE_SHA256=%s\n' "$A1_ARCHIVE_SHA256"
    printf 'COMPOSE_PROJECT=%s\n' "$project"
    printf 'COMPOSE_SERVICE=%s\n' "$compose_service"
    printf 'SERVICE_PORT=%s\n' "$port"
    printf 'PROTECTED_PATH=%s\n' "$protected_path"
    printf 'PUBLIC_HOST=%s\n' "$A1_PUBLIC_HOST"
    printf 'PUBLIC_ORIGIN=%s\n' "$A1_PUBLIC_ORIGIN"
    printf 'NGINX_CONFIG=%s\n' "$A1_NGINX_CONFIG"
    printf 'NGINX_MAIN_CONFIG=%s\n' "$A1_NGINX_MAIN_CONFIG"
    printf 'NGINX_TLS_DIR=%s\n' "$A1_NGINX_TLS_DIR"
    printf 'NGINX_CONTAINER=%s\n' "$A1_NGINX_CONTAINER"
  } > "$output"
  chmod 0600 "$output"
}

a1_stage_and_run_remote() {
  local service="$1" stage="$2"
  local remote_stage="/tmp/civic-a1-${service}-${A1_SHA}-$$"
  local remote_status
  ssh "${A1_SSH_OPTIONS[@]}" "$A1_TARGET" mkdir -m 0700 "$remote_stage"
  scp "${A1_SSH_OPTIONS[@]}" "$stage"/* "$A1_TARGET:$remote_stage/"
  if ssh "${A1_SSH_OPTIONS[@]}" "$A1_TARGET" sudo bash "$remote_stage/remote-release.sh" \
    "$A1_ACTION" "$service" "$A1_SHA" "$remote_stage"; then
    remote_status=0
  else
    remote_status=$?
  fi
  ssh "${A1_SSH_OPTIONS[@]}" "$A1_TARGET" rm -rf -- "$remote_stage" || true
  return "$remote_status"
}
