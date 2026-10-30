#!/usr/bin/env bash
# CIVIC AI 전체 서비스를 로컬에서 함께 실행합니다. 사용법은 저장소 루트의 README.md를 참고하세요.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state="$root/.local"
logs="$state/logs"
pids="$state/pids"
infra="$root/scripts/local/infra.yaml"

export CIVIC_LOCAL_PORT="${CIVIC_LOCAL_PORT:-3000}"
export CIVIC_LOCAL_LANDING_PORT="${CIVIC_LOCAL_LANDING_PORT:-3100}"
export CIVIC_LOCAL_COMMUNITY_PORT="${CIVIC_LOCAL_COMMUNITY_PORT:-3101}"
export CIVIC_LOCAL_AUTH_PORT="${CIVIC_LOCAL_AUTH_PORT:-8080}"
export CIVIC_LOCAL_AUTH_WORKER_PORT="${CIVIC_LOCAL_AUTH_WORKER_PORT:-8081}"
export CIVIC_LOCAL_CHAT_PORT="${CIVIC_LOCAL_CHAT_PORT:-8082}"
export CIVIC_LOCAL_VOTE_PORT="${CIVIC_LOCAL_VOTE_PORT:-8083}"
export CIVIC_LOCAL_AUTH_DB_PORT="${CIVIC_LOCAL_AUTH_DB_PORT:-15432}"
export CIVIC_LOCAL_VOTE_DB_PORT="${CIVIC_LOCAL_VOTE_DB_PORT:-15433}"
export CIVIC_LOCAL_REDIS_PORT="${CIVIC_LOCAL_REDIS_PORT:-16379}"
export CIVIC_LOCAL_MONGO_PORT="${CIVIC_LOCAL_MONGO_PORT:-27117}"
export CIVIC_LOCAL_SMTP_PORT="${CIVIC_LOCAL_SMTP_PORT:-11025}"
export CIVIC_LOCAL_MAIL_UI_PORT="${CIVIC_LOCAL_MAIL_UI_PORT:-18025}"

origin="http://localhost:$CIVIC_LOCAL_PORT"
services="gateway landing community vote chat auth-worker auth"

log() { printf '[civic-local] %s\n' "$1"; }
die() { printf '[civic-local] 오류: %s\n' "$1" >&2; exit 1; }

compose() { docker compose --file "$infra" "$@"; }

is_running() {
  local pid_file="$pids/$1.pid"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

# 직전 종료 직후에는 포트가 잠시 남아 있을 수 있어 몇 번 더 확인합니다.
port_busy() {
  local tries=0
  while (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -lt 6 ] || return 0
    sleep 2
  done
  return 1
}

select_docker_context() {
  docker version >/dev/null 2>&1 && return 0
  local context
  for context in desktop-linux colima; do
    if docker --context "$context" version >/dev/null 2>&1; then
      export DOCKER_CONTEXT="$context"
      return 0
    fi
  done
  die "Docker가 실행 중이 아닙니다. Docker를 먼저 시작하세요."
}

java_major() {
  java -version 2>&1 | awk -F '[".]' '/version/ { print $2; exit }'
}

# Chat과 Vote는 Gradle toolchain으로 JDK 21을 정확히 요구합니다.
select_java_21() {
  if [ "$(java_major 2>/dev/null)" = "21" ]; then
    return 0
  fi
  if [ -x /usr/libexec/java_home ] && /usr/libexec/java_home -F -v 21 >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home -F -v 21)"
    export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"
    return 0
  fi
  die "JDK 21이 필요합니다. 설치 후 JAVA_HOME과 PATH를 JDK 21로 지정하세요. 현재: $(java_major 2>/dev/null || echo 없음)"
}

check_tools() {
  command -v docker >/dev/null 2>&1 || die "Docker가 필요합니다."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2가 필요합니다."
  select_docker_context
  command -v curl >/dev/null 2>&1 || die "curl이 필요합니다."
  select_java_21

  if [ "$(node -v 2>/dev/null | cut -d. -f1)" != "v24" ] && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    set +eu
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null
    nvm use 24 >/dev/null 2>&1
    set -eu
  fi
  [ "$(node -v 2>/dev/null | cut -d. -f1)" = "v24" ] || die "Node.js 24가 필요합니다. 현재: $(node -v 2>/dev/null || echo 없음)"
  if ! command -v pnpm >/dev/null 2>&1; then
    command -v corepack >/dev/null 2>&1 || die "pnpm 또는 corepack이 필요합니다."
    corepack enable
  fi
}

check_ports() {
  local name port
  for name in PORT LANDING_PORT COMMUNITY_PORT AUTH_PORT AUTH_WORKER_PORT CHAT_PORT VOTE_PORT \
      AUTH_DB_PORT VOTE_DB_PORT REDIS_PORT MONGO_PORT SMTP_PORT MAIL_UI_PORT; do
    port="$(eval "printf '%s' \"\$CIVIC_LOCAL_$name\"")"
    if port_busy "$port"; then
      die "포트 $port 이(가) 사용 중입니다. CIVIC_LOCAL_$name=<다른 포트> 를 지정해 다시 실행하세요."
    fi
  done
}

# 소스나 공개 주소가 바뀌었을 때만 다시 빌드합니다.
needs_build() {
  local name="$1" dir="$2" stamp="$state/$1.build"
  local current
  current="$(git -C "$root" rev-parse HEAD 2>/dev/null || echo none)|$origin|$(git -C "$root" status --porcelain -- "$dir" 2>/dev/null | cksum)"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$current" ]; then
    return 1
  fi
  printf '%s' "$current" >"$stamp.next"
  return 0
}

mark_built() { mv "$state/$1.build.next" "$state/$1.build"; }

build_backend() {
  local name="$1" dir="$2"
  if needs_build "$name" "$dir"; then
    log "$name 빌드 중..."
    (cd "$root/$dir" && ./gradlew bootJar --console=plain) >"$logs/$name-build.log" 2>&1 \
      || die "$name 빌드에 실패했습니다. $logs/$name-build.log 를 확인하세요."
    mark_built "$name"
  fi
}

backend_jar() {
  find "$root/$1/build/libs" -maxdepth 1 -name '*.jar' ! -name '*-plain.jar' | head -n 1
}

landing_vars() {
  exec env CIVIC_BROWSER_ORIGIN="$origin" \
    MAIN_AUTH_INTERNAL_URL="http://localhost:$CIVIC_LOCAL_AUTH_PORT" \
    CHAT_INTERNAL_URL="http://localhost:$CIVIC_LOCAL_CHAT_PORT" \
    VOTE_INTERNAL_URL="http://localhost:$CIVIC_LOCAL_VOTE_PORT" \
    "$@"
}

community_vars() {
  exec env OPERATIONS_API_URL="http://localhost:$CIVIC_LOCAL_AUTH_PORT" \
    NEXT_PUBLIC_CHAT_API_URL="$origin" \
    NEXT_PUBLIC_VOTE_API_URL="$origin" \
    SITE_URL="$origin" \
    "$@"
}

build_frontend() {
  local name="$1" dir="$2" env_fn="$3"
  if needs_build "$name" "$dir"; then
    log "$name 의존성 설치 및 빌드 중... (처음에는 몇 분 걸립니다)"
    (
      cd "$root/$dir"
      pnpm install --frozen-lockfile
      "$env_fn" pnpm --filter @app/web run build
    ) >"$logs/$name-build.log" 2>&1 \
      || die "$name 빌드에 실패했습니다. $logs/$name-build.log 를 확인하세요."
    mark_built "$name"
  fi
}

start() {
  local name="$1"
  shift
  nohup "$@" >"$logs/$name.log" 2>&1 &
  printf '%s' "$!" >"$pids/$name.pid"
}

wait_http() {
  local name="$1" url="$2" tries=0 code
  until code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null)" \
      && [ "$code" != "000" ] && [ "$code" != "502" ]; do
    is_running "$name" || die "$name 이(가) 시작하지 못했습니다. $logs/$name.log 를 확인하세요."
    tries=$((tries + 1))
    [ "$tries" -lt 120 ] || die "$name 시작 시간이 초과되었습니다. $logs/$name.log 를 확인하세요."
    sleep 2
  done
  log "$name 준비 완료"
}

start_auth() {
  local jar
  jar="$(backend_jar backend/auth-resource-server)"
  start auth env SPRING_PROFILES_ACTIVE=local \
    CIVIC_RUNTIME_MODE=server \
    SERVER_PORT="$CIVIC_LOCAL_AUTH_PORT" \
    CIVIC_DB_URL="jdbc:postgresql://localhost:$CIVIC_LOCAL_AUTH_DB_PORT/civic_main" \
    CIVIC_DB_USER=civic_main \
    CIVIC_DB_PASSWORD=civic-main-local-only \
    CIVIC_REDIS_URL="redis://localhost:$CIVIC_LOCAL_REDIS_PORT" \
    CIVIC_SMTP_HOST=localhost \
    CIVIC_SMTP_PORT="$CIVIC_LOCAL_SMTP_PORT" \
    CIVIC_ISSUER="$origin" \
    CIVIC_BROWSER_ORIGIN="$origin" \
    CIVIC_COOKIES_SECURE=true \
    java -jar "$jar"
  wait_http auth "http://localhost:$CIVIC_LOCAL_AUTH_PORT/.well-known/openid-configuration"

  start auth-worker env SPRING_PROFILES_ACTIVE=local \
    CIVIC_RUNTIME_MODE=worker \
    SERVER_PORT="$CIVIC_LOCAL_AUTH_WORKER_PORT" \
    CIVIC_LOCAL_SEED_ENABLED=false \
    CIVIC_DB_URL="jdbc:postgresql://localhost:$CIVIC_LOCAL_AUTH_DB_PORT/civic_main" \
    CIVIC_DB_USER=civic_main \
    CIVIC_DB_PASSWORD=civic-main-local-only \
    CIVIC_REDIS_URL="redis://localhost:$CIVIC_LOCAL_REDIS_PORT" \
    CIVIC_SMTP_HOST=localhost \
    CIVIC_SMTP_PORT="$CIVIC_LOCAL_SMTP_PORT" \
    CIVIC_ISSUER="$origin" \
    CIVIC_BROWSER_ORIGIN="$origin" \
    CIVIC_COOKIES_SECURE=true \
    java -jar "$jar"
}

start_chat() {
  start chat env SPRING_PROFILES_ACTIVE=local,auth-main \
    SERVER_PORT="$CIVIC_LOCAL_CHAT_PORT" \
    CHAT_MONGODB_URI="mongodb://localhost:$CIVIC_LOCAL_MONGO_PORT/chat_local?replicaSet=rs0&retryWrites=true&w=majority" \
    CHAT_JWT_ISSUER_URI="$origin" \
    CHAT_JWT_JWKS_URI="http://localhost:$CIVIC_LOCAL_AUTH_PORT/.well-known/jwks.json" \
    CHAT_BROWSER_ORIGIN="$origin" \
    CHAT_WEBSOCKET_ALLOWED_ORIGINS_0="$origin" \
    CHAT_SECURITY_CORS_ALLOWED_ORIGINS_0="$origin" \
    java -jar "$(backend_jar backend/chat-resource-server)"
  wait_http chat "http://localhost:$CIVIC_LOCAL_CHAT_PORT/api/v1/room-categories"
}

start_vote() {
  start vote env SPRING_PROFILES_ACTIVE=local,auth-main \
    SERVER_PORT="$CIVIC_LOCAL_VOTE_PORT" \
    VOTE_DB_URL="jdbc:postgresql://localhost:$CIVIC_LOCAL_VOTE_DB_PORT/vote" \
    VOTE_DB_USERNAME=vote \
    VOTE_DB_PASSWORD=vote \
    VOTE_JWT_ISSUER_URI="$origin" \
    VOTE_JWT_JWKS_URI="http://localhost:$CIVIC_LOCAL_AUTH_PORT/.well-known/jwks.json" \
    VOTE_BROWSER_ORIGIN="$origin" \
    java -jar "$(backend_jar backend/vote-resource-server)"
  wait_http vote "http://localhost:$CIVIC_LOCAL_VOTE_PORT/api/v1/me/tasks"
}

start_in_dir() {
  local name="$1" dir="$2"
  shift 2
  start "$name" /bin/sh -c 'cd "$0" && exec "$@"' "$root/$dir" "$@"
}

start_frontends() {
  start_in_dir landing frontend/landing-auth env CIVIC_BROWSER_ORIGIN="$origin" \
    MAIN_AUTH_INTERNAL_URL="http://localhost:$CIVIC_LOCAL_AUTH_PORT" \
    CHAT_INTERNAL_URL="http://localhost:$CIVIC_LOCAL_CHAT_PORT" \
    VOTE_INTERNAL_URL="http://localhost:$CIVIC_LOCAL_VOTE_PORT" \
    pnpm --filter @app/web exec next start --hostname 127.0.0.1 --port "$CIVIC_LOCAL_LANDING_PORT"
  wait_http landing "http://localhost:$CIVIC_LOCAL_LANDING_PORT/"
  start_in_dir community frontend/chat-vote-survey env OPERATIONS_API_URL="http://localhost:$CIVIC_LOCAL_AUTH_PORT" \
    NEXT_PUBLIC_CHAT_API_URL="$origin" \
    NEXT_PUBLIC_VOTE_API_URL="$origin" \
    SITE_URL="$origin" \
    pnpm --filter @app/web exec next start --hostname 127.0.0.1 --port "$CIVIC_LOCAL_COMMUNITY_PORT"
  wait_http community "http://localhost:$CIVIC_LOCAL_COMMUNITY_PORT/chat"
}

up() {
  local name
  for name in $services; do
    is_running "$name" && die "이미 실행 중입니다. ./scripts/local/stack.sh down 후 다시 실행하세요."
  done
  check_tools
  check_ports
  mkdir -p "$logs" "$pids"

  log "데이터베이스와 메일 서버 시작 중..."
  compose up --detach --wait

  build_backend auth backend/auth-resource-server
  build_backend chat backend/chat-resource-server
  build_backend vote backend/vote-resource-server
  build_frontend landing frontend/landing-auth landing_vars
  build_frontend community frontend/chat-vote-survey community_vars

  start_auth
  start_chat
  start_vote
  start_frontends
  start gateway node "$root/scripts/local/gateway.mjs"
  wait_http gateway "$origin/"

  cat <<DONE

CIVIC AI가 실행되었습니다.
  서비스      $origin
  메일 확인   http://localhost:$CIVIC_LOCAL_MAIL_UI_PORT
  관리자      admin@dev.civic.test / CivicDevAdmin!2026
  사용자      user01@dev.civic.test / CivicDevUser!2026
  로그        $logs
  종료        ./scripts/local/stack.sh down
DONE
}

stop_service() {
  local name="$1" pid_file="$pids/$1.pid" pid
  [ -f "$pid_file" ] || return 0
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    local tries=0
    while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 15 ]; do
      sleep 1
      tries=$((tries + 1))
    done
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

stop_all() {
  local name
  for name in $services; do
    stop_service "$name"
  done
}

status() {
  local name
  for name in $services; do
    if is_running "$name"; then
      printf '%-12s 실행 중\n' "$name"
    else
      printf '%-12s 중지됨\n' "$name"
    fi
  done
  compose ps --format 'table {{.Service}}\t{{.Status}}'
}

case "${1:-up}" in
  up) up ;;
  down)
    select_docker_context
    stop_all
    compose down
    log "모두 종료했습니다. 데이터는 유지됩니다."
    ;;
  reset)
    select_docker_context
    stop_all
    compose down --volumes
    rm -rf "$state"
    log "모두 종료하고 로컬 데이터를 지웠습니다."
    ;;
  status)
    select_docker_context
    status
    ;;
  logs)
    [ -n "${2:-}" ] || die "서비스 이름을 지정하세요: $services"
    exec tail -n 100 -f "$logs/$2.log"
    ;;
  *)
    printf '사용법: %s [up|down|reset|status|logs <서비스>]\n' "$0" >&2
    exit 2
    ;;
esac
