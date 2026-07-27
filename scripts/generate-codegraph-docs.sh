#!/usr/bin/env bash

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
OUTPUT="$ROOT/docs/codegraph/repository-map.md"

cd "$ROOT"
mkdir -p "$(dirname "$OUTPUT")"

{
  printf '# Repository Code Map\n\n'
  printf '> CodeGraph 인덱스를 기준으로 생성한 코드베이스 스냅샷입니다.\n'
  printf '> 재생성: `pnpm codegraph:docs`\n\n'

  printf '## Index Status\n\n'
  printf '```json\n'
  codegraph status --json
  printf '\n```\n\n'

  printf '## Repository Structure\n\n'
  printf '```text\n'
  codegraph files --max-depth 4
  printf '\n```\n\n'

  printf '## Web–Bridge–Mobile Flow\n\n'
  codegraph explore --max-files 8 \
    "apps/web, packages/bridge, apps/mobile 사이의 메시지 계약, 주요 진입점, 호출 관계 및 변경 영향 범위를 조사"
  printf '\n'
} > "$OUTPUT"

printf 'Generated: %s\n' "$OUTPUT"