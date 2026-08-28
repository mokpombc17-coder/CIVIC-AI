# CIVIC Frontend 인증 계약

## 목적

이 문서는 `civic-ai-frontend2`가 Main/Auth와 Resource Server를 연결하는 현재 계약만 설명한다.
Main/Auth가 자격 증명을 발급하고, Chat·Vote·RAG 같은 각 Resource Server가 Access Token을 검증한다.
Frontend는 토큰을 발급하거나 JWT payload를 해석하지 않는다.

## 브라우저 쿠키

| 이름                     | 용도                             | Path           | 속성                                             |
| ------------------------ | -------------------------------- | -------------- | ------------------------------------------------ |
| `civic_ai_access_token`  | 15분 RS256 Access Token 원문     | `/`            | `HttpOnly; Secure; SameSite=Lax`, Domain 없음    |
| `civic_ai_refresh_token` | 회전형 Refresh Token 원문        | `/api/v1/auth` | `HttpOnly; Secure; SameSite=Lax`, Domain 없음    |
| `__Host-civic-auth-flow` | 2FA·비밀번호 재설정 등 임시 흐름 | `/`            | `HttpOnly; Secure; SameSite=Strict`, Domain 없음 |

쿠키 값에 `Bearer ` 접두사를 넣지 않는다. Access Token 쿠키의 만료 시각은 JWT `exp`와 같다.
Refresh Token은 일반 페이지·RAG·Chat·Vote 경로로 전송되지 않고 Auth 경로에서만 회전한다.

## 로그인과 갱신

```text
Browser
  -> POST /api/v1/auth/login
Next.js BFF
  -> Main/Auth /api/v1/auth/login
Main/Auth
  <- access + refresh Set-Cookie
Browser
  -> GET /api/v1/auth/me
  <- user_id, role, permissions, account_state, must_change_password
```

보호된 Server Component는 Access Token 쿠키로 Main/Auth의 `/api/v1/auth/me`를 조회한다. Access Token이
없거나 유효하지 않으면 `/auth/refresh?returnTo=...`로 이동한다. 이 페이지는 브라우저에서 다음 요청을
보낸다.

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{}
```

갱신에 성공하면 요청한 내부 경로로 돌아가고 실패하면 로그인 화면으로 이동한다. Client Component의
보호 API 호출은 `authenticatedFetch`를 사용한다. 첫 응답이 `401`일 때 refresh를 한 번 호출하고 원래
요청을 한 번만 재시도한다. 같은 시점에 여러 요청이 `401`을 반환하면 한 번의 refresh 결과를 함께
기다려 회전형 Refresh Token의 중복 사용을 방지한다. Auth API 자체는 재귀적으로 refresh하지 않는다.

로그아웃은 `POST /api/v1/auth/logout`으로 현재 Refresh Token family를 폐기하고 두 쿠키를 즉시
만료한다. 모든 기기 로그아웃은 Access Token과 CSRF가 필요한 `/api/v1/auth/logout-all`을 사용한다.

## same-origin 인증 경계

브라우저는 같은 origin의 `/api/v1/**`만 호출한다. Main/Auth BFF는 다음을 보장한다.

- 허용한 Main/Auth 경로와 HTTP method만 프록시한다.
- mutation은 정확한 `Origin`과 `Sec-Fetch-Site: same-origin`을 요구한다.
- Main/Auth mutation 중 인증이 필요한 경로는 `/api/v1/auth/csrf`에서 토큰을 받아 전달한다.
- Access, Refresh, Auth Flow 쿠키 이외의 브라우저 쿠키를 Main/Auth로 전달하지 않는다.
- 이름이 중복된 인증 쿠키를 거부한다.
- Main/Auth의 Set-Cookie는 위 표의 이름·Path·HttpOnly·Secure·SameSite·host-only 조건을 만족할 때만
  브라우저로 전달한다.
- 인증 응답에는 `Cache-Control: private, no-store`를 사용한다.
- Edge가 덮어쓴 단일 IP literal `X-Real-IP`만 Main/Auth로 전달하고, 임의의
  `X-Forwarded-For` 체인은 전달하지 않는다. Main/Auth의 `CIVIC_TRUSTED_PROXY_CIDRS`에는
  실제 Next.js BFF 주소만 지정한다.

Next.js 3000 포트는 외부에 공개하지 않고 Nginx만 접근하게 한다. 이 경계가 지켜져야 외부 요청자가
`X-Real-IP`를 위조해 로그인·가입 rate limit을 우회할 수 없다.

## RAG Resource Server 경계

공개 nginx는 `/api/v1/rag/**`와 `/stream/rag/queries/**`를 RAG Resource Server의 내부 경로로
rewrite한다. Web BFF를 거치지 않으며 브라우저가 보낸 Access Token Cookie 또는 Authorization,
`Origin`, `Sec-Fetch-Site`를 그대로 전달한다. Cookie와 Authorization이 함께 들어온 경우 RAG
Resource Server가 두 원문이 동일한지 검사한다.

```http
Cookie: civic_ai_access_token=<access-token>
Authorization: Bearer <access-token>
Origin: <CIVIC_BROWSER_ORIGIN>
Sec-Fetch-Site: same-origin
```

Frontend는 RAG scope를 타입으로 문서화하지만 JWT를 파싱하여 권한을 판정하지 않는다. 실제 서명,
issuer, audience, 만료, scope, Origin/CSRF 검증은 RAG 서버의 책임이다. RAG가 `401`을 반환하면
브라우저 refresh 흐름이 실행된다.

## Access Token 규격

Main/Auth가 발급하고 Resource Server가 검증할 규격은 다음과 같다.

- 서명: RS256, JWT header에 `kid` 포함
- 필수 claim: `iss`, `sub`, `aud`, `iat`, `exp`, `jti`, `scope`
- `sub`: 변경되지 않는 사용자 UUID
- `email`: 로그인 이메일 별도 claim
- `aud`: `['civic-ai-api']`
- 유효 기간: 발급 시점부터 15분
- `scope`: 공백으로 구분된 문자열
- issuer metadata: `/.well-known/openid-configuration`
- 공개키: `/.well-known/jwks.json`

일반 사용자 scope와 관리자 전용 scope는 Main/Auth에서 분리한다. Frontend 화면 권한은 `/me`의
`role`과 `permissions`로 판정하고 JWT claim을 직접 읽지 않는다.

## 역할과 관리자 권한

- `role`: `PARTICIPANT | ADMIN | HIGHEST_ADMIN`
- `permissions`: `RAG_ADMIN | CHAT_ADMIN | VOTE_ADMIN | SIMULATION_ADMIN`

RAG·Chat·Vote·Simulation 관리자는 별도 role이 아니라 관리자 role에 부여되는 permission이다.
사용자·역할·권한 관리는 `HIGHEST_ADMIN`만 접근한다.

## 환경 변수

| 이름                     | 의미                                       |
| ------------------------ | ------------------------------------------ |
| `CIVIC_BROWSER_ORIGIN`   | 브라우저에 공개된 Frontend의 정확한 origin |
| `MAIN_AUTH_INTERNAL_URL` | Next.js 서버에서 접근하는 Main/Auth URL    |
| `CHAT_INTERNAL_URL`      | Next.js BFF에서 접근하는 Chat URL          |
| `VOTE_INTERNAL_URL`      | Next.js BFF에서 접근하는 Vote URL          |

RAG와 Simulation은 nginx에서 각 Resource Server로 직결하므로 Web 런타임에 내부 URL을 두지 않는다.

Frontend에는 Main/Auth 내부 client secret이나 provider API key가 필요하지 않다.
