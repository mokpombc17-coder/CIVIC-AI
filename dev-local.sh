#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker_cli=(docker)

usage() {
  printf '%s\n' \
    'Usage:' \
    '  ./dev-local.sh          Start Main/Auth 8080, PostgreSQL 15432, and Redis 16379' \
    '  ./dev-local.sh down     Stop local PostgreSQL and Redis containers' \
    '  ./dev-local.sh reset    Delete local PostgreSQL and Redis data' \
    '  ./dev-local.sh --help   Show this help'
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command is not installed: %s\n' "$1" >&2
    exit 1
  fi
}

select_docker_cli() {
  if "${docker_cli[@]}" version >/dev/null 2>&1; then
    return
  fi

  for context in desktop-linux colima; do
    if docker context inspect "$context" >/dev/null 2>&1 \
        && docker --context "$context" version >/dev/null 2>&1; then
      docker_cli=(docker --context "$context")
      printf 'Using Docker context for this command only: %s\n' "$context"
      return
    fi
  done

  printf '%s\n' 'Docker daemon is not running. Start Docker Desktop or Docker Engine and retry.' >&2
  exit 1
}

command_name="${1:-start}"
case "$command_name" in
  -h|--help|help)
    usage
    exit 0
    ;;
  down|reset)
    require_command docker
    select_docker_cli
    compose=(
      "${docker_cli[@]}" compose
      --project-name civic-main-auth-local
      --file "$script_dir/compose.local.yaml"
    )
    if [ "$command_name" = reset ]; then
      printf '%s\n' 'Deleting the civic-main-auth-local containers and volumes...'
      "${compose[@]}" down --volumes
    else
      "${compose[@]}" down
    fi
    exit 0
    ;;
  start)
    ;;
  *)
    printf 'Unknown command: %s\n' "$command_name" >&2
    usage >&2
    exit 2
    ;;
esac

require_command docker
require_command java
select_docker_cli

compose=(
  "${docker_cli[@]}" compose
  --project-name civic-main-auth-local
  --file "$script_dir/compose.local.yaml"
)

server_port="${CIVIC_LOCAL_SERVER_PORT:-8080}"
postgres_port="${CIVIC_LOCAL_POSTGRES_PORT:-15432}"
redis_port="${CIVIC_LOCAL_REDIS_PORT:-16379}"
database_name="${CIVIC_LOCAL_DB_NAME:-civic_main}"
database_user="${CIVIC_LOCAL_DB_USER:-civic_main}"
database_password="${CIVIC_LOCAL_DB_PASSWORD:-civic-main-local-only}"

if ! "${docker_cli[@]}" compose version >/dev/null 2>&1; then
  printf '%s\n' 'Docker Compose v2 is required. Install or update Docker Desktop/Docker Engine.' >&2
  exit 1
fi

java_major="$(java -version 2>&1 | awk -F '[".]' '/version/ { print $2; exit }')"
if [[ ! "$java_major" =~ ^[0-9]+$ ]] || (( java_major < 21 )); then
  printf 'JDK 21 or newer is required; detected major version: %s\n' "${java_major:-unknown}" >&2
  exit 1
fi

printf 'Starting PostgreSQL 16.9 on %s and Redis 7.4 on %s...\n' "$postgres_port" "$redis_port"
"${compose[@]}" up --detach --wait

printf '%s\n' \
  "Starting Main/Auth at http://localhost:$server_port" \
  'Local accounts are created automatically on the first database startup.' \
  'Press Ctrl+C to stop Main/Auth. Run ./dev-local.sh down to stop PostgreSQL and Redis.'

cd "$script_dir"
SPRING_PROFILES_ACTIVE=local \
CIVIC_RUNTIME_MODE=server \
SERVER_PORT="$server_port" \
CIVIC_DB_URL="jdbc:postgresql://localhost:$postgres_port/$database_name" \
CIVIC_DB_USER="$database_user" \
CIVIC_DB_PASSWORD="$database_password" \
CIVIC_REDIS_URL="redis://localhost:$redis_port" \
CIVIC_ISSUER="${CIVIC_ISSUER:-http://localhost:$server_port}" \
CIVIC_BROWSER_ORIGIN="${CIVIC_BROWSER_ORIGIN:-http://localhost:$server_port}" \
  ./gradlew bootRun --no-daemon --console=plain
