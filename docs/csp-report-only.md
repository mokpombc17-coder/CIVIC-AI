# CSP Report-Only 도입 설계

## 상태

이 문서는 CSP(Content Security Policy)를 바로 차단 모드로 적용하지 않고, 실제 배포 origin과
외부 리소스 의존성을 확인한 뒤 안전하게 도입하기 위한 설계 문서다.

현재 템플릿에는 `Content-Security-Policy` 또는
`Content-Security-Policy-Report-Only` 응답 헤더를 추가하지 않는다.

## 목적

- 허용되지 않은 script, style, image, font, frame, API 및 WebSocket 연결을 관찰한다.
- 브라우저와 모바일 WebView에서 필요한 origin만 directive별 allowlist로 만든다.
- 오탐과 정상 의존성을 분류한 뒤 Report-Only 정책을 차단 정책으로 승격한다.
- 서비스별 분석 도구, CDN, OAuth, 결제 등의 origin을 템플릿이 임의로 허용하지 않는다.

## 현재 구조와 소유권

- Next.js App Router가 웹 문서와 응답 헤더를 소유한다.
- `apps/web/next.config.ts`가 현재 `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`를 설정한다.
- Nginx는 TLS 종료, Next.js reverse proxy와 `/ws/chat/` WebSocket proxy를 담당한다.
- Expo 앱은 동일한 웹 애플리케이션을 WebView로 로드한다. bridge의 `postMessage` 자체는
  CSP 네트워크 source가 아니다.

CSP Report-Only 헤더는 `apps/web/next.config.ts`에서 관리한다. 애플리케이션이 사용하는
origin과 배포 단계별 정책을 코드 리뷰할 수 있고, Nginx와 다른 배포 환경에서도 같은 정책을
유지하기 위해서다. CDN이나 edge proxy가 응답 헤더를 덮어쓰거나 중복 추가하지 않는지는
배포 시 별도로 확인한다.

## 적용 전 확정할 값

| 항목              | 확인할 내용                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `WEB_ORIGIN`      | 실제 HTTPS 웹 origin                                                        |
| `APP_WSS_ORIGIN`  | `/ws/chat/`가 사용하는 실제 `wss://` origin                                 |
| `APP_API_ORIGINS` | 브라우저가 직접 호출하는 API origin. Server Component/BFF의 upstream은 제외 |
| `SCRIPT_ORIGINS`  | 분석, 태그 매니저 등 외부 script origin                                     |
| `STYLE_ORIGINS`   | 외부 stylesheet origin                                                      |
| `IMAGE_ORIGINS`   | 사용자 업로드 및 이미지 CDN origin                                          |
| `FONT_ORIGINS`    | 외부 font origin                                                            |
| `FRAME_ORIGINS`   | 결제·인증 등 실제 iframe 사용 origin                                        |
| `REPORT_ENDPOINT` | CSP 보고서를 수신할 HTTPS endpoint                                          |

origin은 scheme과 host를 포함해 정확히 기록한다. `https:` 또는 `wss:`처럼 모든 host를
허용하는 source 표현식과 `*`는 사용하지 않는다.

## 관찰용 정책 초안

아래 값은 origin이 확정되기 전의 설계 예시이며 그대로 활성화하지 않는다.

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'unsafe-inline' <SCRIPT_ORIGINS>;
style-src 'self' 'unsafe-inline' <STYLE_ORIGINS>;
img-src 'self' data: blob: <IMAGE_ORIGINS>;
font-src 'self' <FONT_ORIGINS>;
connect-src 'self' <APP_WSS_ORIGIN> <APP_API_ORIGINS>;
media-src 'self' blob: <MEDIA_ORIGINS>;
worker-src 'self' blob:;
manifest-src 'self';
frame-src 'none';
report-uri /api/security/csp-report;
report-to csp-endpoint;
```

초기 초안의 `'unsafe-inline'`은 nonce 없이 렌더링하는 현재 Next.js 애플리케이션에서
framework bootstrap script와 inline style로 인한 보고서 소음을 줄이기 위한 값이다. 최종
차단 정책의 목표값으로 간주하지 않는다.

외부 frame이 필요한 서비스는 `frame-src 'none'`을 실제 origin allowlist로 교체한다.
`frame-ancestors 'none'`은 이 웹 애플리케이션을 다른 사이트가 frame으로 삽입하는 것을
막는 별도 directive이므로 유지한다.

개발 서버를 위해 production 정책에 `'unsafe-eval'`을 추가하지 않는다. Report-Only는
HTTPS preview 환경부터 적용하고 로컬 개발 환경은 대상에서 제외한다.

## 보고 헤더

배포 origin이 확정되면 같은 응답에 다음 세 값을 제공한다.

```text
Reporting-Endpoints: csp-endpoint="<WEB_ORIGIN>/api/security/csp-report"
Content-Security-Policy-Report-Only: <POLICY>; report-uri /api/security/csp-report; report-to csp-endpoint
```

`report-to`와 `Reporting-Endpoints`를 기본 방식으로 사용한다. 구형 WebView와 브라우저의
관찰 범위를 확보하기 위해 전환 기간에는 `report-uri`도 함께 둔다.

## 보고 endpoint 요구사항

`/api/security/csp-report`를 구현할 때 다음 조건을 적용한다.

- 인증 없이 `POST`를 받을 수 있지만 다른 method는 허용하지 않는다.
- `application/reports+json`과 `application/csp-report` payload를 모두 처리한다.
- 요청 body 크기를 작게 제한하고 rate limit을 적용한다.
- 정상 수신 시 body 없이 `204`를 반환한다.
- `documentURL`, `blockedURL`, `referrer`, `sourceFile`의 query와 fragment를 저장 전에
  제거한다.
- Cookie, Authorization header와 원본 요청 body는 기록하지 않는다.
- 원본 보고서를 그대로 애플리케이션 로그에 남기지 않고 필요한 필드만 구조화한다.
- `effectiveDirective`, 차단된 origin, document path, 브라우저 종류, WebView 여부,
  배포 버전과 발생 횟수를 집계한다.
- 수집 보존 기간과 접근 권한을 정하고 운영 알림의 임계값을 설정한다.

보고 endpoint 구현과 저장소 선택은 서비스 운영 환경에 의존하므로 이 템플릿에서는
미리 결정하지 않는다.

## 단계별 도입

### 1. Origin 목록 작성

production과 동일한 preview 빌드에서 브라우저 Network 기록을 수집한다. 홈과 모든 주요
route, 이미지, 다운로드, OAuth, WebSocket, 분석 도구를 확인하고 directive별 origin
목록을 작성한다.

### 2. Preview에서 Report-Only 활성화

보고 endpoint를 먼저 배포한 뒤 preview 환경에만 관찰용 헤더를 추가한다. 응답에
`Content-Security-Policy` 차단 헤더가 포함되지 않았는지 확인한다.

### 3. 위반 분류

최소 한 번의 전체 기능 점검과 충분한 관찰 기간 동안 다음 범주로 분류한다.

- 서비스가 의도적으로 사용하는 origin
- 브라우저 확장 프로그램이나 개발 도구가 만든 잡음
- 잘못된 URL 또는 제거해야 하는 오래된 의존성
- 공격 또는 비정상 injection 시도

위반이 발생했다는 이유만으로 origin을 allowlist에 추가하지 않는다.

### 4. WebView 회귀 확인

Android와 iOS production 계열 빌드에서 다음 흐름을 확인한다.

- 앱 최초 로드와 route 이동
- 오프라인 이후 자동 재시도
- WebSocket 연결
- OAuth 시작과 callback
- 파일 다운로드
- 필수 앱 업데이트 화면
- deep link 및 push link 이동

### 5. 차단 모드 승격

다음 조건을 모두 만족할 때만 동일한 정책을 `Content-Security-Policy`로 승격한다.

- 알려지지 않은 정상 기능 위반이 없다.
- 브라우저와 양쪽 WebView의 핵심 흐름이 통과한다.
- 모든 allowlist origin에 소유자와 사용 이유가 기록되어 있다.
- 정책 변경과 긴급 rollback 담당자가 정해져 있다.
- preview와 production의 외부 origin 차이가 반영되어 있다.

차단 모드에서도 보고 directive를 유지한다. 초기 배포는 일부 트래픽 또는 내부
사용자부터 시작하고, 기능 장애가 확인되면 enforcement 헤더만 제거해 Report-Only로
되돌린다.

## Nonce 기반 strict CSP 결정

`'unsafe-inline'`을 제거하려면 request마다 nonce를 생성하고 Next.js가 framework script에
같은 nonce를 적용하도록 구성하는 방식을 검토한다.

Nonce 기반 CSP는 페이지를 동적 렌더링하게 만들며 정적 최적화, CDN cache와 Partial
Prerendering 전략에 영향을 준다. 따라서 이 템플릿의 기본값으로 활성화하지 않고 다음을
측정한 뒤 별도 결정한다.

- 정적 route가 동적 route로 바뀌는 범위
- 응답 시간과 서버 부하 변화
- CDN cache 요구사항
- third-party script의 nonce 지원 여부
- App Router와 사용 중인 bundler의 지원 상태

## 검증 체크리스트

- [ ] preview 응답에 `Content-Security-Policy-Report-Only`만 존재한다.
- [ ] `Reporting-Endpoints`의 URL이 HTTPS이고 실제 보고 endpoint로 연결된다.
- [ ] `report-to`와 호환용 `report-uri`가 모두 설정되어 있다.
- [ ] 보고 endpoint가 두 CSP payload 형식과 body 제한을 처리한다.
- [ ] query, fragment와 민감한 header가 저장되지 않는다.
- [ ] 허용 origin에 wildcard가 없다.
- [ ] production 빌드의 모든 주요 route를 브라우저와 WebView에서 확인했다.
- [ ] WebSocket, OAuth, 다운로드와 deep link 회귀가 없다.
- [ ] 차단 모드 승격 및 rollback 절차를 운영자가 확인했다.

## 참고 자료

- [Next.js Content Security Policy 가이드](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js `headers` 설정](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [W3C Content Security Policy Level 3](https://www.w3.org/TR/CSP/)
- [MDN Content-Security-Policy-Report-Only](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only)
