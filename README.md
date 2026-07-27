# Next.js + Expo WebView Starter

하나의 Next.js 애플리케이션을 데스크톱/모바일 브라우저와 Expo WebView에서 함께 사용하는 템플릿이다.
React Native는 별도의 제품 UI를 다시 구현하지 않고, WebView와 모바일 운영체제 기능을 연결하는 얇은 셸로 유지한다.

기준 시점: **2026-07-27**

## 구성

```text
Browser ─────────────────────────────┐
                                     │ HTTPS
Expo native shell                    ▼
└─ WebView ────────────────────→ Next.js web/BFF ──→ Spring Boot ──→ DB
   └─ Bridge ↔ native capability      │
                                      └─ HTML, RSC, JSON, client chunks
```

```text
apps/web
  Next.js App Router, Server Components, Server Actions, Route Handlers

apps/mobile
  Expo development build, WebView, app lifecycle, deep links, native bridge

packages/bridge
  웹과 네이티브가 공유하는 버전된 Zod 메시지 계약

packages/typescript-config
  공통 TypeScript 엄격성 설정
```

## 포함한 의사결정

- **pnpm workspace 모노레포**: 웹과 모바일이 브리지 계약을 같은 커밋에서 변경한다.
- **Turborepo 미사용**: 앱 2개와 공유 패키지 2개 수준에서는 pnpm filter만으로 충분하다.
- **Expo Router 미사용**: 네이티브 화면은 WebView 하나이므로 라우팅 소유자는 Next.js다.
- **TanStack Query 미포함**: 페이지 초기 조회는 Server Component를 기본으로 하고, 클라이언트가 서버 상태를 소유해야 할 화면에서만 추가한다.
- **Tailwind CSS 포함**: 웹의 기본 스타일링 도구로 Tailwind CSS를 사용한다.
- **운영 DB 직접 접근 없음**: Next.js는 Spring Boot API를 호출하는 웹 프레젠테이션 서버/BFF다.
- **브리지 최소화**: 일반 HTTP와 WebSocket은 WebView의 Next.js가 직접 처리하고, 공유·푸시·딥링크 같은 네이티브 경계만 브리지를 사용한다.

## 버전 정책

- Node.js는 `.nvmrc`, `.node-version`, `engines`에서 동일하게 고정한다.
- pnpm은 `packageManager`에서 정확한 버전을 고정한다.
- Prettier는 패치 버전까지 고정한다. 버전 차이에 따른 불필요한 포맷 diff를 방지하기 위해서다.
- TypeScript는 최신 7.0 계열 대신 6.0.3을 사용한다. 템플릿 기준 시점에 7.0이 출시된 지 얼마 되지 않아 Next.js/Expo 플러그인 호환성을 우선했다.
- ESLint는 10이 아니라 9.39.5를 사용한다. Next.js 16.2의 공식 config와 ESLint 10 호환이 정리된 뒤 함께 올린다.
- Expo 네이티브 패키지는 SDK가 권장하는 `~` 범위를 사용한다.
- pnpm 11의 dependency build-script 차단을 유지하고 `@parcel/watcher`, `esbuild`, `sharp`만 `allowBuilds`로 허용한다. 새 패키지가 build script를 요구하면 자동 허용하지 말고 `pnpm approve-builds`에서 검토한다.

## 최초 실행

### 1. Node.js와 pnpm

```bash
nvm use
corepack enable
corepack prepare pnpm@11.15.1 --activate
```

### 2. 환경 변수

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
```

### 3. 의존성 설치

```bash
pnpm install
```

`pnpm-lock.yaml`이 생성되면 **반드시 저장소에 커밋**한다. 이후 CI와 배포에서는 `pnpm install --frozen-lockfile`을 사용한다.

### 4. 정적 검사

```bash
pnpm check
```

### 5. Next.js 실행

```bash
pnpm dev:web
```

기본 주소는 `http://localhost:3000`이다. 운영 Spring Boot가 없어도 홈과 브리지 예제는 동작한다.
`/api/upstream-health` 예제만 `OPERATIONS_API_URL`의 서버를 호출한다.

### 6. 모바일 앱 실행

모바일은 Expo Development Build 기반의 WebView 셸이다. 최초 한 번 네이티브 앱을 빌드한다.

- **브리지 최소화**: 일반 HTTP와 WebSocket은 WebView의 Next.js가 직접 처리하고, 공유·푸시·딥링크 같은 네이티브 경계만 브리지를 사용한다.

WebView bridge의 책임과 처리 흐름은
[`docs/architecture/webview-bridge.md`](./docs/architecture/webview-bridge.md)를 참고한다.

```bash
# Android
pnpm --filter @app/mobile run android

# iOS (macOS)
pnpm --filter @app/mobile run ios
```

로컬 WebView 주소, Development Build, OAuth, 딥링크, 다운로드, 푸시, 권한 및 스토어 배포
설정은 [`apps/mobile/README.md`](./apps/mobile/README.md)를 참고한다.

## 운영 배포

```text
Internet :443
→ Nginx
→ Next.js :3000
→ Spring Boot internal address
```

## 실제 서비스 연결 시 수정할 부분

```text
1. 스프링부트 주소
    OPERATIONS_API_URL=http://operations-server:8080

2. 인증 연결
    apps/web/lib/server/operations-api.ts

3. 모바일 식별자, OAuth, 딥링크, 푸시 및 스토어 설정
    apps/mobile/README.md
```

`apps/web/next.config.ts`는 `output: "standalone"`을 사용한다. Nginx document root에 `.next`를 복사하는 방식이 아니라,
Next.js Node 프로세스가 `.next` 결과를 사용해 HTML/RSC/JS/CSS/API를 제공한다.
`deploy/nginx/next-webview.conf`는 reverse proxy 시작점이다.

## 선택: CodeGraph 및 Codex 연동

CodeGraph는 소스 코드에서 symbol, import, 호출 관계 및 변경 영향 범위를 추출하여 로컬 semantic index를 생성하는 개발 도구다. 웹 및 모바일 애플리케이션 실행에는 필요하지 않다.

CodeGraph 인덱스는 `.codegraph/`에 생성되며 Git에 포함하지 않는다.

### 최초 초기화

```bash
# 익명 사용 통계를 비활성화할 경우 최초 인덱싱 전에 한 번 실행
pnpm exec codegraph telemetry off

# 프로젝트의 로컬 코드 그래프 생성
pnpm codegraph:init

# 인덱스 상태 확인
pnpm codegraph:status
```

### 인덱스 동기화

Codex에서 CodeGraph MCP 서버가 실행 중이면 파일 변경 사항이 자동으로 인덱스에 반영된다. 일반적인 Codex 작업 중에는 수동 동기화가 필요하지 않다.

다음 상황에서는 증분 동기화를 실행한다.

```bash
pnpm codegraph:sync
```

- CodeGraph MCP가 실행되지 않은 동안 파일을 변경한 경우
- 다른 브랜치로 전환하거나 외부 변경 사항을 가져온 경우
- CodeGraph CLI만 직접 사용하는 경우
- `pnpm codegraph:status`에서 pending change 또는 pending reference가 확인된 경우
- 로컬 CodeGraph 보고서를 생성하기 전

전체 그래프를 다시 생성해야 하는 경우에는 다음을 실행한다.

```bash
pnpm codegraph index
```

### Codex 연결 확인

이 저장소의 `.codex/config.toml`은 프로젝트에 설치된 CodeGraph를 Codex MCP 서버로 연결한다.

1. Codex에서 이 프로젝트를 신뢰한다.
2. `pnpm install`과 `pnpm codegraph:init`을 완료한다.
3. Codex CLI 또는 IDE 확장을 재시작한다.
4. 연결 상태를 확인한다.

```bash
codex mcp list
```

Codex TUI에서는 `/mcp` 명령으로 연결 상태를 확인할 수 있다.
