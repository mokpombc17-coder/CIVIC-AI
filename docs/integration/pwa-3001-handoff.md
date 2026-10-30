# 3001 웹 애플리케이션 PWA 연동 Handoff

## 배경

- 브라우저에 노출되는 공개 origin은 `https://example.com` 하나다.
- 내부의 3000/3001 포트는 같은 서버 인스턴스에서 실행되는 서로 다른 Next.js upstream이다.
- Nginx가 URL에 따라 3000과 3001로 요청을 분기한다.
- 3000 애플리케이션에 설치 가능한 최소 PWA 구성이 추가되었다.
- 관련 PR: [civic-ai-frontend2 #79](https://github.com/Ham-n-Cheeze/civic-ai-frontend2/pull/79)

## 목표

3001 애플리케이션이 3000에서 제공하는 공용 PWA manifest와 아이콘을 참조하게 한다. 사용자가 3001이 담당하는 화면에 있더라도 동일한 `CIVIC.AI` 앱 설치 정보를 인식할 수 있어야 한다.

## 공용 PWA 자산 소유권

다음 자산은 3000 애플리케이션이 단일 원본으로 소유한다.

- `/manifest.webmanifest`
- `/icons/civic-ai-192.png`
- `/icons/civic-ai-512.png`
- `/icons/apple-touch-icon.png`
- `/sw.js`
- `/pwa/start`

3001 저장소에는 위 파일을 복사하지 않는다. 두 저장소에 자산을 중복 보관하면 manifest나 아이콘이 서로 다르게 배포될 수 있다.

## 3001 작업 범위

3001 애플리케이션의 root layout에서 기존 metadata를 보존하면서 다음 PWA metadata를 병합한다.

```ts
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  // 기존 metadata는 유지한다.
  applicationName: "CIVIC.AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CIVIC.AI",
  },
  icons: {
    icon: [
      {
        url: "/icons/civic-ai-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/civic-ai-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  // 기존 viewport 설정이 있다면 해당 객체에 병합한다.
  themeColor: "#f5f7fb",
};
```

root layout에 이미 `metadata` 또는 `viewport` export가 있다면 새 export를 중복 선언하지 말고 기존 객체에 필드를 추가한다.

## 작업하지 않을 범위

- 3001 저장소에 별도 `manifest.ts` 또는 `manifest.webmanifest`를 추가하지 않는다.
- 아이콘 PNG 또는 SVG를 3001 저장소에 복사하지 않는다.
- 별도 서비스 워커를 만들거나 등록하지 않는다. 같은 origin의 3000이 `/sw.js`를 단일 원본으로
  등록한다.
- Workbox, `next-pwa` 또는 다른 캐싱 라이브러리를 설치하지 않는다.
- 3001 화면의 오프라인 캐시, background sync, push notification을 추가하지 않는다.

3000 서비스 워커는 `/pwa/start`의 공개 시작 shell과 해당 shell의 Next 정적 리소스를 캐시한다.
여기에 3000이 소유하는 버전 지정 Pretendard GOV 폰트와 공통 하단 navigation 이미지를
cache-first 자산으로 추가한다. 3001 화면, 일반 route의 추가 Next 정적 리소스 및 API 응답은
캐시하지 않는다.

## Nginx 전제

공개 origin에서 다음 요청은 3000 애플리케이션 또는 해당 정적 자산으로 전달되어야 한다.

```text
https://example.com/manifest.webmanifest
https://example.com/icons/civic-ai-192.png
https://example.com/icons/civic-ai-512.png
https://example.com/icons/apple-touch-icon.png
```

라우팅 원칙은 다음과 같다.

```text
/manifest.webmanifest → 3000
/icons/*              → 3000
/sw.js                → 3000
/pwa/start            → 3000
/survey               → 3001
```

## 설문 eligibility handoff

3000 애플리케이션의 로그인된 참여자 공통 Guard는
`GET /api/v1/me/service-eligibility`를 조회한다. 응답이 `eligible=false`이고
`nextAction=COMPLETE_CURRENT_SURVEY`이면 전체 문서 이동으로 다음 주소를 연다.

```text
/survey?returnTo=<URL-encoded same-origin path, query, fragment>
```

`/survey`는 3001 애플리케이션이 소유하며 eligibility Guard의 리다이렉트 대상에서 제외한다. 3001은
`returnTo`를 외부 origin, protocol-relative URL, 인증 재귀 경로가 될 수 없도록 검증하고, 값이 없거나
유효하지 않으면 `/home`을 사용한다. 설문 제출 성공 후 공유 서버 상태의 원본인
`GET /api/v1/me/service-eligibility`를 invalidate·재조회하여 `eligible=true`를 확인한 뒤에만 검증된
`returnTo` 또는 `/home`으로 전체 문서 이동한다. 3000과 3001은 서로 다른 Next.js runtime이므로
메모리 Query cache 자체를 공유하지 않으며, 3000으로 돌아오면 새 runtime이 eligibility를 다시 조회한다.

이관 전 `/account/survey`와 `/mypage/survey` 요청은 3000에서 `/survey`로 임시 리다이렉트한다.

Nginx 설정 변경은 3001 애플리케이션 작업과 분리해서 확인한다. 3001 담당자가 Nginx를 소유하지 않는다면 인프라 담당자에게 위 라우팅을 검증해 달라고 요청한다.

## Manifest 계약

3000에서 제공하는 manifest의 핵심 값은 다음과 같다.

```text
id: /
start_url: /pwa/start
scope: /
display: standalone
name: CIVIC.AI
short_name: CIVIC.AI
```

`scope: /`이므로 같은 origin에서 3000과 3001이 담당하는 모든 경로가 하나의 설치된 앱 범위에 포함된다.

## 검증 방법

### 정적 검증

3001 저장소 규칙에 맞는 format, lint, typecheck, test를 실행한다.

### 프로덕션 빌드 검증

3001 애플리케이션을 프로덕션 모드로 빌드하고, 3001이 담당하는 화면의 HTML에 다음 링크가 포함되는지 확인한다.

```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

manifest 링크는 한 번만 출력되어야 한다.

### 배포 후 검증

아래 URL의 status와 `Content-Type`을 확인한다.

```text
/manifest.webmanifest          → 200, JSON manifest Content-Type
/icons/civic-ai-192.png        → 200, image/png
/icons/civic-ai-512.png        → 200, image/png
/icons/apple-touch-icon.png    → 200, image/png
```

`/manifest.webmanifest` 또는 `/icons/*`가 `text/html`을 반환하면 Next.js catch-all 또는 Nginx upstream으로 잘못 라우팅된 것이다.

### 실제 기기 검증

- Android Chrome에서 메뉴의 앱 설치 또는 홈 화면 추가가 가능한지 확인한다.
- iOS Safari에서 공유 메뉴의 홈 화면에 추가가 가능한지 확인한다.
- 설치된 앱이 `/pwa/start`에서 시작해 인증 판정 후 `/home` 또는 `/login`으로 이동하는지 확인한다.
- 설치된 앱에서 3000과 3001이 담당하는 화면을 이동할 때 standalone 창을 유지하는지 확인한다.

## 완료 조건

- 3001이 반환하는 HTML이 공용 manifest를 참조한다.
- 3001이 반환하는 HTML이 Apple 홈 화면 아이콘을 참조한다.
- manifest 링크가 중복되지 않는다.
- 3001에 별도 manifest, 아이콘 또는 서비스 워커가 추가되지 않는다.
- 3001 저장소의 필수 검증 명령이 통과한다.
- 배포 환경에서 manifest와 아이콘이 올바른 `Content-Type`으로 응답한다.
