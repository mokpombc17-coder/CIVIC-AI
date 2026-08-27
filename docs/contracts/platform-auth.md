# 플랫폼 인증 계약

## 문서 상태와 범위

이 문서는 웹 애플리케이션, 운영 서버, 사내 Resource Server가 공유할 인증 경계를 정의한다.
로컬 Next.js 구현은 개발자 노트북에서만 사용할 Local E2E JWT fixture issuer다. 이 구현은
운영용 Authorization Server가 아니며 staging, production 또는 GitHub Actions에 배포하지
않는다. 운영 인증 서버와 CI 전용 E2E 인증은 각각 별도 환경에서 구성한다.

Local E2E fixture의 실행 범위, 고정 계약과 운영 격리 정책은
[`local-e2e-auth-fixture.md`](./local-e2e-auth-fixture.md)에서 관리한다.

첫 번째 연동 대상은 `chat-resource-server`이지만 issuer, cookie, subject, audience는 채팅
전용이 아닌 플랫폼 공통 계약으로 관리한다.

## 구성요소별 책임

| 구성요소              | 개발자 노트북의 Local E2E 책임                                     | 운영 환경의 책임                                                                          |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Next.js               | Local E2E JWT를 서명해 HttpOnly 쿠키를 설정·삭제한다               | 운영 서버 로그인 흐름을 시작하거나 그 결과를 사용하며 access token을 직접 서명하지 않는다 |
| 운영 서버             | Local E2E fixture 발급에 관여하지 않는다                           | 사용자를 인증하고 access token을 발급·갱신하며 쿠키를 설정·삭제한다                       |
| 브라우저 또는 WebView | `localhost` 쿠키를 자동으로 전달하며 토큰을 직접 읽지 않는다       | 운영 쿠키를 자동으로 전달하며 토큰을 직접 읽지 않는다                                     |
| Resource Server       | 노트북에서 실행한 local profile로 Local E2E JWT와 scope를 검증한다 | 운영 서버 JWT만 검증하고 scope를 적용한다                                                 |

## 공통 access token claims

모든 JWT access token은 다음 claim을 포함해야 한다.

| Claim   | 의미                                   | 로컬 값                              |
| ------- | -------------------------------------- | ------------------------------------ |
| `iss`   | 환경별 인증 주체                       | `http://localhost:3000/api/dev/auth` |
| `aud`   | 사내 Resource Server 신뢰 경계         | `civic-ai-api`                       |
| `sub`   | 플랫폼 전체에서 사용하는 사용자 식별자 | 로컬 session 요청에서 전달받은 값    |
| `scope` | 공백으로 구분한 권한 목록              | 아래의 플랫폼 scope                  |
| `iat`   | epoch seconds 기준 발급 시각           | 현재 서버 시각                       |
| `exp`   | epoch seconds 기준 만료 시각           | `iat + 3600`                         |
| `jti`   | 토큰별 고유 식별자                     | 임의 UUID                            |

JWT protected header는 다음과 같다.

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

로컬 issuer는 일반 사용자에게 현재 다음 scope를 기본 발급한다.

```text
chat:connect
chat:rooms:read
chat:rooms:write
chat:messages:write
chat:read-state:write
vote:surveys:read
vote:survey-responses:write
vote:tasks:read
vote:submissions:read
vote:submissions:write
```

Vote 관리자 scope는 기본 JWT에 포함하지 않는다. 관리자 API와 인증 정책이 확정되면 allowlist된
관리자 principal에만 별도 계약으로 발급한다.

Chat 감사 Export의 `chat:audit:exports` scope도 일반 사용자 기본 JWT에 포함하지 않는다. 로컬
개발과 E2E에서는 다음 subject만 코드로 allowlist한다.

```text
local-super-admin
e2e-chat-export-admin-{uuid}
```

비슷한 이름이나 임의의 query/form 입력만으로 감사 scope를 추가하지 않는다.

Resource Server는 `sub`를 인증된 플랫폼 사용자 ID로 사용한다. 서명이 유효하다는 이유만으로
토큰을 허용해서는 안 되며, 설정된 issuer, audience, expiry와 필요한 scope도 함께 검증해야
한다.

## 쿠키 계약

로컬 emulator와 향후 운영 서버는 다음 전달 계약을 사용한다.

| 속성       | 로컬                    | 운영                                                 |
| ---------- | ----------------------- | ---------------------------------------------------- |
| 이름       | `civic_ai_access_token` | `civic_ai_access_token`                              |
| `HttpOnly` | `true`                  | `true`                                               |
| `Path`     | `/`                     | `/`                                                  |
| `SameSite` | `Lax`                   | `Lax`. 최종 배포가 cross-site인 경우에만 `None` 검토 |
| `Secure`   | `false`                 | `true`                                               |
| `Max-Age`  | `3600`                  | JWT `exp`보다 길 수 없음                             |

JWT는 응답 body로 반환하지 않으며 `NEXT_PUBLIC_*` 환경변수로 노출하지 않는다. 브라우저 HTTP
클라이언트는 cross-origin 요청에 credential 전달을 명시해야 한다. 브라우저 WebSocket
클라이언트는 HTTP upgrade 요청에 자동으로 첨부되는 쿠키를 사용한다.

로컬 서비스는 모두 동일한 host 표기를 사용해야 한다.

```text
http://localhost:3000
http://localhost:8082
```

`localhost`와 `127.0.0.1`을 섞으면 서로 다른 cookie host가 된다.

## Local E2E Next.js issuer

Fixture issuer는 개발자 노트북에서 `NODE_ENV`가 `production`이 아닐 때만 사용할 수 있다.

로컬 개발자는 전역 헤더의 `로컬 E2E 로그인 갱신` 버튼으로 session을 생성하거나 갱신한다. 버튼은
`local-user-1`을 subject로 사용해 아래 API를 호출하며, 현재 route와 관계없이 다시 발급할 수
있다. 이 UI는 production에서 렌더링되지 않는다.

Session 생성:

```http
POST /api/dev/auth/session
Content-Type: application/json

{
  "subject": "owner-1"
}
```

성공 응답:

```http
HTTP/1.1 204 No Content
Cache-Control: no-store
Set-Cookie: civic_ai_access_token=<jwt>; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax
```

Session 삭제:

```http
DELETE /api/dev/auth/session
```

잘못된 JSON, 빈 subject, 128자를 초과한 subject는 `400`을 반환한다. Production에서는 두
method 모두 `404`를 반환하며 쿠키를 설정하거나 삭제하지 않는다.

현재 fixture issuer를 활성화하거나 설정하기 위한 `.env` 값은 존재하지 않는다. Resource Server
담당자가 계약을 그대로 재현할 수 있도록 Local E2E 계약 전체를 소스에 고정했다. 운영 서버
인증을 연결해도 이 구현과 route는 개발자 노트북의 로컬 프로세스에서만 유지한다. GitHub
Actions, staging과 production에는 포함하거나 배포하지 않는다.

## Local E2E signing fixture

Algorithm:

```text
HS256
```

Fixture signing key:

```text
civic-ai-local-auth-fixture-signing-key-v1-public-do-not-use-in-production
```

이 값은 credential이 아니라 공개된 테스트 재료다. 소스 파일을 나중에 삭제해도 Git 기록에서는
사라지지 않는다. 따라서 Resource Server는 다음 조건을 모두 지켜야 한다.

1. 개발자 노트북에서 실행한 Resource Server의 local profile에서만 fixture key를 허용한다.
2. Local E2E issuer `http://localhost:3000/api/dev/auth`를 반드시 검증한다.
3. Audience `civic-ai-api`를 반드시 검증한다.
4. Staging과 production에서는 fixture key와 로컬 issuer를 절대 로드하지 않는다.
5. Production 설정이 fixture로 서명한 토큰을 거부한다는 테스트를 둔다.

## Chat Resource Server 전달 계약

로컬 Chat Resource Server는 `http://localhost:8082`에서 실행하며 다음 계약을 전달받는다.

```text
JWT algorithm: HS256
JWT fixture key: civic-ai-local-auth-fixture-signing-key-v1-public-do-not-use-in-production
JWT issuer: http://localhost:3000/api/dev/auth
JWT audience: civic-ai-api
JWT subject claim: sub
JWT scope claim: scope
Cookie name: civic_ai_access_token
Allowed web origin: http://localhost:3000
REST API prefix: /api/v1
WebSocket endpoint: /ws
```

Chat Resource Server에 필요한 동작은 다음과 같다.

1. `/api/v1/**` 요청의 `civic_ai_access_token` 쿠키에서 bearer token을 추출한다.
2. 비브라우저 호출과 테스트를 위해 기존 `Authorization: Bearer` 방식도 유지한다.
3. 동일한 쿠키로 `/ws` HTTP upgrade를 인증한다.
4. 인증된 HTTP `Principal`을 STOMP session으로 전달한다.
5. Handshake principal이 있으면 JavaScript가 HttpOnly token을 STOMP `CONNECT` header로
   다시 전달하도록 요구하지 않는다.
6. 로컬 origin은 `http://localhost:3000`만 허용하며 wildcard origin을 사용하지 않는다.
7. 로컬 HTTP API에서 credential CORS를 허용하고 최소한 `Content-Type`과
   `Idempotency-Key` header를 허용한다.
8. Cookie 인증을 local profile 밖에서 활성화하기 전에 CSRF 정책을 다시 검토한다.

Chat authorization은 최종적으로 다섯 가지 `chat:*` scope를 검증해야 한다. 최초 transport
연동 단계에서 서버가 아직 scope를 검증하지 않는다면 subject 인증을 최소 호환 조건으로 둘 수
있다.

Vote Resource Server도 같은 로컬 issuer, HS256 fixture key, `civic-ai-api` audience와 공백 구분
`scope` claim을 검증한다. 일반 사용자 API에는 위 다섯 가지 `vote:*` scope를 resource/action별로
적용하고, 현재 로컬 issuer가 발급하지 않는 `vote:admin:*` 권한을 일반 사용자에게 허용하지 않는다.

## 운영 계약

운영 서버는 production 인증 경로를 새로 제공한다. Local E2E issuer는 개발자 노트북에만 남고
운영 issuer로 교체하거나 배포하지 않는다. 브라우저에 노출되는 쿠키 이름, subject 의미,
audience, scope와 Resource Server 검증 경계는 가능한 한 동일하게 유지한다.

운영 환경은 로컬 HS256 fixture를 복사해서는 안 된다. 목표 운영 모델은 다음과 같다.

- 환경별 HTTPS issuer
- RS256 또는 ES256과 같은 비대칭 서명
- `kid` protected header
- 검증용 public key만 포함하는 JWKS 공개
- 운영 서버만 private signing key 보유
- 운영 서버가 갱신을 담당하는 짧은 수명의 access token
- Key rotation 중 이전·신규 검증 키를 일정 기간 함께 제공
- URL, client-readable storage, analytics, log에 JWT를 남기지 않음

운영 Resource Server들이 서로 다른 hostname을 사용한다면 same-origin gateway와 공유 cookie
domain 중 하나를 선택해야 한다. 형제 hostname 전체로 쿠키 노출 범위를 넓히지 않도록
same-origin gateway 방식을 우선한다.

## 운영 인증 연동 체크리스트

운영 서버 인증을 연결할 때 다음을 수행한다.

1. 운영 로그인·로그아웃·세션 확인 endpoint와 쿠키 발급 책임을 운영 서버에 둔다.
2. Production Resource Server에는 운영 issuer, audience, key/JWKS와 scope 검증만 설정한다.
3. `local-e2e-jwt.ts`와 `/api/dev/auth/session`은 개발자 노트북에서만 유지하고 배포 산출물로
   사용하지 않는다.
4. Production과 staging Resource Server 설정에 Local E2E issuer와 fixture key를 추가하지
   않는다.
5. 로컬 채팅 E2E는 Local E2E fixture를 사용한다. CI 전용 E2E와 운영 인증 서버 연동 테스트는
   별도의 인증 구성을 사용한다.
6. 운영 JWT 문서를 받으면 issuer, key 배포·회전, 갱신, 로그아웃, WebSocket 만료 정책을 이
   문서의 운영 계약에 추가한다.
7. 쿠키 이름이나 subject, audience, scope 계약이 달라지면 웹, 운영 인증 서버와 모든 Resource
   Server가 함께 검토한다.
