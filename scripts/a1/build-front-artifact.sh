#!/usr/bin/env bash

set -Eeuo pipefail

export CI=true
export NEXT_TELEMETRY_DISABLED=1

npm install --global pnpm@11.15.1
pnpm config set store-dir "${PNPM_STORE_DIR:-/pnpm/store}"
pnpm install --frozen-lockfile
pnpm run build:web

[[ -f "apps/web/.next/standalone/apps/web/server.js" ]] \
  || { printf 'error: Next standalone server was not generated\n' >&2; exit 1; }

mkdir -p apps/web/.next/standalone/apps/web/public
cp -R apps/web/public/. apps/web/.next/standalone/apps/web/public/

mkdir -p apps/web/.next/standalone/apps/web/.next/static
cp -R apps/web/.next/static/. apps/web/.next/standalone/apps/web/.next/static/
