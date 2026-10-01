# 브라우저 지원 상태 안내 Handoff

## 1. 목적

Next.js 16의 공식 브라우저 지원 범위를 CIVIC.AI의 최소 지원 기준으로 채택한다.
지원 기준 미만으로 명확하게 판정되는 환경에는 깨진 애플리케이션 대신 독립적인 안내 HTML을
제공한다. 사용자는 `/supported-browsers`에 직접 접근해 현재 환경의 지원 상태도 확인할 수 있다.

공식 지원 범위 미만에서 반드시 실행되지 않는다는 뜻은 아니다. CIVIC.AI가 정상 동작을 보장하는
최소 범위를 이 기준으로 운영한다는 제품 정책이다.

## 2. 최소 지원 기준

| 환경         | 최소 지원 기준 |
| ------------ | -------------- |
| iOS / iPadOS | 16.4 이상      |
| macOS Safari | 16.4 이상      |
| Chrome       | 111 이상       |
| Edge         | 111 이상       |
| Firefox      | 111 이상       |

## 3. 판정 결과

`classifyBrowserSupport()`는 지원 여부와 정규화한 환경 정보를 함께 반환한다.

```ts
type BrowserSupportResult =
  | {
      support: "supported";
      environment: BrowserEnvironment;
    }
  | {
      support: "unsupported";
      environment: BrowserEnvironment;
      reason: UnsupportedBrowserReason;
    }
  | {
      support: "unknown";
      environment: BrowserEnvironment;
    };
```

- `supported`: 알려진 환경이며 최소 지원 기준 이상이다.
- `unsupported`: 알려진 환경이며 최소 지원 기준 미만임이 명확하다.
- `unknown`: UA 정보가 부족하거나 정책상 안전하게 판정할 수 없다.

일반 서비스 요청에서는 `supported`와 `unknown`을 통과시키고 `unsupported`만 상태 확인
페이지로 보낸다. UA 판정은 안내 목적으로만 사용하며 인증·권한·보안 판단에는 사용하지 않는다.

## 4. iOS/iPadOS 정책

iPhone과 iPad에서는 브라우저 앱의 표시 버전보다 iOS/iPadOS 버전을 우선한다.

```text
iOS 13 + Chrome 140 표시
→ unsupported
→ iOS 13.7 / ios-version 안내

iOS 16.4 이상
→ supported
```

데스크톱 모드 iPad처럼 OS 버전을 신뢰할 수 없는 UA는 `unknown`으로 통과시킨다. 대체 Chromium
브라우저, Android WebView, crawler도 현재 정책으로 명확히 판정할 수 없으면 차단하지 않는다.

## 5. 요청 흐름

일반 문서 탐색은 Proxy에서 먼저 판정한다.

```text
문서 탐색 요청
    ↓
proxy.ts
    ├── supported / unknown → 기존 서비스
    └── unsupported → 307 /supported-browsers
```

상태 확인 페이지는 직접 접근을 포함해 세 상태를 모두 HTML로 표현한다.

```text
/supported-browsers
    ↓
Route Handler가 User-Agent 판정
    ├── supported → 이용 가능 안내
    ├── unsupported → 업데이트 안내
    └── unknown → 자동 판정 불가·이용 허용 안내
```

Route Handler는 어떤 상태에서도 자동으로 `/home`으로 이동시키지 않는다.

## 6. 구현 구조

```text
apps/web/
├── app/supported-browsers/route.ts
├── lib/browser-support.ts
├── lib/browser-support.test.ts
├── proxy.ts
├── public/supported-browsers.css
├── tests/browser-support-proxy.test.ts
└── tests/supported-browsers-route.test.ts
```

상태 화면은 Route Handler가 `Response`로 완성된 HTML 문자열을 반환한다.

- React 렌더링 없음
- hydration 없음
- Next.js client bundle 없음
- client JavaScript 없음
- 정적 CSS와 로컬 폰트만 사용

원본 User-Agent는 HTML에 넣지 않는다. 판정 함수가 고정된 환경 이름과 숫자 버전으로 정규화한
값만 출력한다.

## 7. 상태별 화면

### `unsupported`

- 업데이트 안내
- 현재 접속 환경
- 실제 지원 기준 미달 사유
- 최소 지원 버전
- 기기별 업데이트 방법
- `확인하기` 링크

`확인하기`는 `/supported-browsers`를 새 문서로 다시 요청한다. 브라우저나 운영체제 업데이트
후 서버가 현재 User-Agent를 다시 판정한다.

### `supported`

- 현재 환경에서 CIVIC.AI를 이용할 수 있다는 안내
- 현재 접속 환경
- 최소 지원 버전
- `이동하기` 링크

### `unknown`

- 현재 환경을 자동으로 판정하기 어렵다는 안내
- 서비스 이용을 제한하지 않는다는 정책
- 최소 지원 버전
- `이동하기` 링크

## 8. Proxy 적용

다음 조건을 모두 만족하는 경우만 `/supported-browsers`로 307 이동한다.

- `GET`
- `Accept`에 `text/html` 포함
- `Sec-Fetch-Dest`가 없거나 `document`
- 판정 결과가 `unsupported`
- API, Next.js 내부 경로, 지원 상태 경로 또는 정적 자산이 아님

`/supported-browsers`, 하위 경로, `/supported-browsers.css`는 판정에서 제외해 redirect loop를
막는다. matcher에서도 API, `_next`, service worker, manifest, 지원 상태 경로, 정적 파일,
prefetch를 먼저 제외한다.

프록시 redirect에는 다음 헤더를 사용한다.

```http
Cache-Control: private, no-store
Vary: User-Agent
```

## 9. Route Handler 응답

모든 판정 결과에 `200 text/html`을 반환한다. 응답에는 다음 보호 헤더를 적용한다.

- `Cache-Control: private, no-store`
- `Vary: User-Agent`
- `Content-Language: ko`
- `X-Content-Type-Options: nosniff`
- `X-Robots-Tag: noindex, nofollow`
- 외부·inline script를 모두 막는 독립 CSP

## 10. Service Worker

현재 service worker는 일반 navigation을 포괄적으로 캐시하지 않고 `/pwa/start` shell만 설치
대상으로 관리한다. 따라서 지원 판정을 우회하는 별도 navigation cache 대응은 추가하지 않는다.

## 11. 제외 범위

- feature detection 기반 차단
- 정확한 기기 모델 판별
- unknown 환경 차단
- UA를 이용한 인증·권한 판단
- 브라우저나 운영체제 자체 업데이트 실행
- React 또는 client JavaScript 기반 상태 화면

## 12. 테스트 기준

- 기준 직전/기준 버전의 iOS, iPadOS, Safari, Chrome, Edge, Firefox
- iOS의 브라우저 앱 표시 버전보다 OS 판정을 우선하는지 확인
- bot, 미확인 UA, 대체 Chromium, iPad desktop mode는 unknown으로 통과
- Proxy가 문서 탐색만 차단하고 API·정적 자산·prefetch·상태 경로는 우회
- Route Handler가 세 상태에 맞는 환경·문구·동작을 표시
- raw UA와 client script를 포함하지 않음
- no-store, Vary, CSP, robots 관련 응답 헤더 확인
