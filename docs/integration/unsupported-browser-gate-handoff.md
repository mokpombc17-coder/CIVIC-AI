# 구버전 브라우저 접근 안내 Handoff

## 1. 목적

CIVIC.AI는 Next.js 16의 공식 브라우저 지원 범위를 서비스의 최소 지원 기준으로
채택한다.

공식 지원 범위 미만이라고 해서 애플리케이션이 반드시 동작하지 않는 것은 아니다.
다만 해당 환경의 정상 동작을 보장하지 않으며, 최소 지원 버전보다 낮은 것으로
명확하게 확인된 환경에는 깨진 서비스 화면 대신 정적 업데이트 안내 화면을
제공한다.

이번 작업의 목적은 구형 환경을 모두 호환시키는 것이 아니다.

```text
명확한 구버전 브라우저의 문서 접근
        ↓
Next.js Client Runtime과 독립적인 정적 안내 화면 제공
```

참고:

- Next.js Supported Browsers: <https://nextjs.org/docs/architecture/supported-browsers>
- Apple Safari 업데이트 안내: <https://support.apple.com/en-us/102665>

## 2. CIVIC.AI 최소 지원 기준

| 환경                       | 최소 지원 기준  |
| -------------------------- | --------------- |
| iOS/iPadOS 브라우저 및 PWA | iOS/iPadOS 16.4 |
| iOS/iPadOS WKWebView       | iOS/iPadOS 16.4 |
| macOS Safari               | Safari 16.4     |
| Chrome                     | 111             |
| Edge                       | 111             |
| Firefox                    | 111             |

최소 버전은 Next.js 설정에서 자동으로 추출하지 않고 CIVIC.AI의 명시적인 서비스
정책 상수로 관리한다. Next.js를 업그레이드하더라도 서비스 지원 정책이 의도치 않게
자동 변경되지 않도록 하기 위함이다.

## 3. 판정 원칙

판정 결과는 다음 세 단계로 구성한다.

```ts
type BrowserSupport = "supported" | "unsupported" | "unknown";
```

### `supported`

알려진 브라우저이며 CIVIC.AI 최소 지원 버전 이상인 경우다. 기존 페이지로
통과시킨다.

### `unsupported`

알려진 브라우저이며 최소 지원 버전보다 낮은 것으로 명확하게 확인된 경우다. 정적
업데이트 안내 페이지로 이동시킨다.

### `unknown`

다음과 같이 지원 여부를 신뢰성 있게 판정할 수 없는 경우다.

- 빈 User-Agent
- 알려지지 않은 신규 브라우저
- UA 정보가 부족한 인앱 브라우저
- iPad 데스크톱 모드처럼 OS 버전이 명확하지 않은 환경
- 검색 엔진 크롤러

`unknown`은 차단하지 않고 기존 페이지로 통과시킨다. 정상 사용자를 오탐으로
차단하지 않는 것을 우선한다.

## 4. iOS/iPadOS 판정 정책

CIVIC.AI의 지원 판정 정책상 iOS/iPadOS에서는 브라우저 앱에 표시되는 버전보다
운영체제 버전을 우선한다.

```text
iOS 13 + 최신 버전으로 표시되는 Chrome 앱
→ unsupported

iOS 16.4 + Safari 또는 Chrome
→ supported
```

iPhone/iPad의 Safari 업데이트는 운영체제 업데이트에 포함되므로 사용자에게는
브라우저 버전보다 iOS/iPadOS 업데이트 행동을 안내한다.

## 5. 구현 구조

```text
브라우저 문서 요청
        ↓
proxy.ts에서 User-Agent 판정
        ↓
supported / unknown  → 기존 페이지
unsupported          → unsupported-browser.html
```

관련 파일:

```text
apps/web/
├── lib/browser-support.ts
├── lib/browser-support.test.ts
├── proxy.ts
├── public/unsupported-browser.html
├── public/unsupported-browser.css
└── tests/browser-support-proxy.test.ts
```

## 6. 판정 함수

`apps/web/lib/browser-support.ts`에 부작용 없는 순수 판정 함수를 둔다.

```ts
export const CIVIC_BROWSER_SUPPORT = {
  ios: [16, 4],
  safari: [16, 4],
  chrome: 111,
  edge: 111,
  firefox: 111,
} as const;

export function classifyBrowserSupport(userAgent: string): "supported" | "unsupported" | "unknown";
```

판정 순서상 iOS/iPadOS를 브라우저 앱보다 먼저 확인한다. Chrome 계열 문자열을
포함하지만 지원 정책에 포함되지 않는 별도 브라우저와 Android WebView는
`unknown`으로 둔다.

UA 판정은 사용성 보호를 위한 장치이며 인증이나 권한 판단에 사용하지 않는다.

## 7. Proxy 적용

브라우저 차단은 다음 조건을 모두 만족할 때만 적용한다.

- `GET` 요청
- `Accept`에 `text/html`이 포함된 문서 탐색
- `Sec-Fetch-Dest`가 없거나 `document`
- 지원 판정이 명확한 `unsupported`
- API, Next.js 내부 경로 또는 정적 자산 요청이 아님

리다이렉트 응답에는 다음 헤더를 적용한다.

```http
Cache-Control: private, no-store
Vary: User-Agent
```

특정 브라우저에 대한 리다이렉트 응답이 CDN 또는 중간 캐시를 통해 다른 사용자에게
재사용되지 않도록 하기 위함이다.

다음 요청은 matcher 단계와 함수 내부에서 판정 대상에서 제외한다.

- `/api`
- `/_next`
- `/sw.js`
- `/manifest.webmanifest`
- favicon, robots, sitemap
- 이미지, 폰트, CSS, JavaScript 등 정적 파일
- `/unsupported-browser.html`
- `/unsupported-browser.css`
- Next.js prefetch 요청

안내 페이지와 CSS 경로를 반드시 제외해 리다이렉트 루프를 방지한다.

## 8. 사용자 안내 화면

안내 화면은 React 또는 Next.js Client Runtime이 실행되지 않아도 표시되는 정적
HTML/CSS로 구현한다.

주요 안내 문구는 구체적인 버전 번호보다 사용자의 업데이트 행동을 중심으로 한다.

```text
운영체제 또는 브라우저를 업데이트해 주세요.

현재 환경에서는 CIVIC.AI가 정상적으로 동작하는 것을 보장하기 어렵습니다.
안전하고 원활한 이용을 위해 최신 버전으로 업데이트해 주세요.

iPhone·iPad
iOS 또는 iPadOS를 최신 버전으로 업데이트해 주세요.

그 외 기기
Safari, Chrome, Edge 또는 Firefox를 최신 버전으로 업데이트해 주세요.
```

최소 지원 버전은 보조 정보로만 표시한다.

정적 페이지 구현 원칙:

- 최신 JavaScript에 의존하지 않음
- `100vh`와 `-webkit-fill-available`을 함께 사용
- safe area 여백 적용
- CSS flex `gap` 등 오래된 Safari에서 불안정한 기능을 핵심 배치에 사용하지 않음
- `noindex, nofollow` 적용
- 업데이트 후 `/home`으로 다시 이동할 수 있는 링크 제공

## 9. Service Worker 확인 결과

현재 Service Worker는 일반 페이지 탐색을 캐시하지 않는다.

- `/pwa-start` 탐색만 network-first로 처리
- PWA 시작 화면의 CSS/JavaScript와 일부 런타임 이미지만 cache-first로 처리
- 일반 `/home`, `/login` 등의 navigation 요청은 가로채지 않음

따라서 일반 페이지 접근에서 Proxy 판정을 우회하는 별도 PWA 캐시 대응은 이번
작업에 포함하지 않는다. 향후 캐시 전략이 변경되면 다시 확인한다.

## 10. 이번 작업에서 제외하는 사항

- RegExp lookbehind, Promise, fetch, AbortController 기반 Feature Detection
- 구형 브라우저용 Next.js 번들 트랜스파일 확대
- 구형 브라우저별 CSS/JavaScript polyfill 추가
- 알 수 없는 브라우저에 대한 선제 차단
- Service Worker 캐시 전략 변경
- 브라우저 또는 기기 모델별 예외 처리

`unknown` 환경에서 실제 호환성 문제가 확인되면 운영 관측을 바탕으로 후속
대응한다.

## 11. 테스트 기준

### 판정 함수

| 환경                         | 기대 결과     |
| ---------------------------- | ------------- |
| iOS 13 Safari                | `unsupported` |
| iOS 13 Chrome                | `unsupported` |
| iOS/iPadOS 16.4              | `supported`   |
| macOS Safari 16.3            | `unsupported` |
| macOS Safari 16.4            | `supported`   |
| Chrome/Edge/Firefox 110      | `unsupported` |
| Chrome/Edge/Firefox 111      | `supported`   |
| iPad 데스크톱 모드           | `unknown`     |
| 검색 엔진 및 미확인 브라우저 | `unknown`     |

### Proxy

- 명확한 미지원 브라우저의 문서 탐색만 정적 안내 화면으로 이동
- 지원 및 unknown 환경은 기존 페이지로 통과
- API, `_next`, Service Worker, manifest 및 정적 자산은 통과
- prefetch 요청은 통과
- 안내 페이지와 CSS에서 리다이렉트 루프가 발생하지 않음
- 기존 CSP 처리에 회귀가 없음
- 리다이렉트 응답이 공용 캐시되지 않음

### 실제 환경

- BrowserStack iOS 13 Safari 및 Chrome에서 안내 화면 확인
- iOS 16.4 이상 Safari에서 기존 화면 확인
- 최신 iOS standalone PWA에서 기존 화면 확인
- Chrome/Edge/Firefox 111 이상에서 기존 화면 확인
- 최신 Android Chrome에서 기존 화면 확인

## 12. 완료 기준

- 명확한 최소 지원 버전 미만의 문서 접근만 차단된다.
- 지원 환경과 unknown 환경에는 기존 동작 변화가 없다.
- 안내 화면은 Next.js Client Runtime 없이 표시된다.
- 안내 화면과 정적 자산에서 리다이렉트 루프가 없다.
- iOS/iPadOS 사용자는 최신 운영체제 업데이트를 안내받는다.
- Service Worker 변경 없이 현재 PWA 동작이 유지된다.
- `pnpm check`가 통과한다.
