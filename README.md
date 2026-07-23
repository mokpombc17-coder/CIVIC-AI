# Next.js + Expo WebView Starter

하나의 Next.js 애플리케이션을 데스크톱/모바일 브라우저와 Expo WebView에서 함께 사용하는 템플릿이다.
React Native는 별도의 제품 UI를 다시 구현하지 않고, WebView와 모바일 운영체제 기능을 연결하는 얇은 셸로 유지한다.

기준 시점: **2026-07-23**

## 구성

```text
Browser ─────────────────────────────┐
                                    │ HTTPS
Expo native shell                   ▼
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
- **Tailwind 미포함**: 렌더링 구조와 배포 경계를 확인하는 템플릿이므로 스타일 도구를 강제하지 않는다.
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

### 6. Expo 개발 빌드

WebView 자체는 Expo Go에서도 시험할 수 있지만, 실제 앱 개발은 development build를 기준으로 한다.
최초 한 번 네이티브 앱을 빌드한다.

```bash
# Android
pnpm --filter @app/mobile run android

# iOS (macOS)
pnpm --filter @app/mobile run ios
```

네이티브 설정을 바꾸지 않고 TypeScript만 수정할 때는 이후 다음 명령만 실행한다.

```bash
pnpm dev:mobile
```

## 로컬 WebView 주소

### iOS Simulator

```dotenv
EXPO_PUBLIC_WEB_APP_URL=http://localhost:3000
```

### Android Emulator

호스트의 3000 포트를 에뮬레이터 localhost로 전달한다.

```bash
adb reverse tcp:3000 tcp:3000
```

그 뒤 모바일 환경 변수는 다음처럼 유지할 수 있다.

```dotenv
EXPO_PUBLIC_WEB_APP_URL=http://localhost:3000
```

### 실제 기기

동일 Wi-Fi의 개발 PC LAN 주소나 HTTPS 개발 터널을 사용한다.

```dotenv
EXPO_PUBLIC_WEB_APP_URL=https://your-dev-tunnel.example
```

운영 빌드에서는 반드시 HTTPS origin을 사용한다.

## 딥링크 준비

`apps/mobile/app.config.ts`에서 다음 값을 실제 서비스에 맞게 바꾼다.

- `scheme`
- `ios.bundleIdentifier`
- `android.package`
- `EXPO_PUBLIC_APP_HOST`

Universal Links/App Links를 활성화하려면 웹 origin에 다음 파일도 제공해야 한다.

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

세부 절차는 `docs/deep-linking.md`를 참고한다.

## 운영 배포

```text
Internet :443
→ Nginx
→ Next.js :3000
→ Spring Boot internal address
```

## 실제 서비스 연결 시 수정할 부분

```text
1. 서비스 식별자
    Next WebView Shell
    next-webview-shell
    com.example.nextwebviewshell
    nextwebview://
    app.example.com

2. 스프링부트 주소
    OPERATIONS_API_URL=http://operations-server:8080

3. 인증 연결
    apps/web/lib/server/operations-api.ts

4. 딥링크 검증 파일 작성
    apple-app-site-association
    assetlinks.json


5. 브리지 capability 추가
    packages/bridge
    → GET_PUSH_TOKEN 메시지 계약

    apps/mobile
    → Expo Notifications 호출

    apps/web
    → 받은 token을 Next BFF로 등록
```

`apps/web/next.config.ts`는 `output: "standalone"`을 사용한다. Nginx document root에 `.next`를 복사하는 방식이 아니라,
Next.js Node 프로세스가 `.next` 결과를 사용해 HTML/RSC/JS/CSS/API를 제공한다.
`deploy/nginx/next-webview.conf`는 reverse proxy 시작점이다.
