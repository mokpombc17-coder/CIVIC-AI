# CIVIC Main/Auth 연동 계약

## 1. 문서 범위

- 기준일: 2026-08-26
- 구현 기준: `civic-main-auth`의 `main` 브랜치
- 대상: Frontend, Chat, Vote, RAG 및 Edge 배포 담당자
- 목적: Main/Auth 코드를 읽지 않고도 로그인 UI와 Resource Server 인증을 연동하는 데 필요한
  계약을 제공한다.

이 문서는 Main/Auth가 실제로 발급하는 JWT·쿠키, 브라우저의 갱신 흐름, Resource Server가
검증할 값과 공개 endpoint만 다룬다. Chat, Vote, RAG의 내부 구현과 endpoint별 권한 설계는
각 서비스가 소유한다.

## 2. 인증 구조

- Spring Security는 `STATELESS`로 동작한다.
- 로그인 성공 시 Main/Auth가 Access JWT와 불투명 Refresh Token을 각각 HttpOnly 쿠키로
  발급한다.
- Access JWT 하나를 Chat, Vote, RAG가 공통으로 사용한다.
- Refresh Token은 Main/Auth만 처리하며 Resource Server에는 전송되지 않는다.
- 로그인 수단은 이메일·비밀번호와 계정별 선택적 2FA다.
- 로그인 ID는 이메일이며 JWT `email`에는 소문자·공백 제거된 로그인 이메일이 들어간다.
- JWT `sub`는 변경되지 않는 사용자 UUID다.
- Main/Auth 내부 사용자 ID와 `/me`의 `user_id`는 UUID다.

## 3. Access JWT 계약

### JOSE header

| 필드 | 값 |
| --- | --- |
| `alg` | `RS256` |
| `typ` | `JWT` |
| `kid` | 활성 RSA 서명 키의 ID |

### claim

| Claim | 발급값 |
| --- | --- |
| `iss` | 배포 환경의 `CIVIC_ISSUER`와 정확히 같은 URL |
| `sub` | 변경되지 않는 사용자 UUID 문자열 |
| `email` | 소문자·공백 제거된 로그인 이메일 |
| `aud` | JSON 배열 `["civic-ai-api"]` |
| `iat` | epoch seconds 발급 시각 |
| `exp` | 정확히 `iat + 900`, 즉 15분 |
| `jti` | Access JWT마다 새 UUID 문자열 |
| `scope` | 공백으로 구분한 문자열 |
| `account_state_version` | 계정 상태 버전 정수 |
| `must_change_password` | 강제 비밀번호 변경 여부 boolean |

`aud`는 값이 하나여도 문자열이 아니라 배열로 직렬화된다. 권한 판정에는 배열이나 `roles`
claim 대신 `scope` 문자열을 사용한다.

강제 비밀번호 변경 대상에게는 완료 전까지 `account:password:write` scope만 발급한다.

## 4. scope 발급 규칙

일반 활성 사용자 기본 scope:

```text
chat:connect
chat:rooms:read
chat:rooms:write
chat:messages:write
chat:read-state:write
vote:surveys:read
vote:survey-responses:write
vote:personas:read
vote:tasks:read
vote:predictions:write
vote:submissions:read
vote:submissions:write
rag:documents:read
rag:queries:write
rag:jobs:read
```

관리 기능은 역할과 분리된 permission으로 부여하며 다음 scope가 추가된다.

| permission | 추가 scope |
| --- | --- |
| `RAG_ADMIN` | `rag:documents:write` |
| `CHAT_ADMIN` | `chat:rooms:approve`, `chat:rooms:membership-limit:exempt`, `chat:audit:exports`, `chat:research:exports` |
| `VOTE_ADMIN` | `vote:survey-outbox-replays:write`, `vote:persona-generation-retries:write` |
| `SIMULATION_ADMIN` | `simulation:tasks:read`, `simulation:tasks:run`, `simulation:billing:read`, `simulation:billing:write` |

`/me`의 역할 값은 `PARTICIPANT`, `ADMIN`, `HIGHEST_ADMIN`이며 Resource Server의 API
권한 판정은 `scope`로 한다.

## 5. 브라우저 쿠키

| 쿠키 | Path | SameSite | 만료 | 값 |
| --- | --- | --- | --- | --- |
| `civic_ai_access_token` | `/` | `Lax` | JWT `exp`와 동일 | Bearer 접두사 없는 JWT 원문 |
| `civic_ai_refresh_token` | `/api/v1/auth` | `Lax` | 개별 토큰 발급 후 최대 7일 | 불투명 토큰 |
| `__Host-civic-auth-flow` | `/` | `Strict` | 10분 | 2FA 등 단기 인증 flow ID |

운영의 모든 쿠키는 `HttpOnly`, `Secure`, host-only이며 `Domain` 속성을 지정하지 않는다.
삭제 응답은 발급 때와 같은 이름·Path로 `Max-Age=0`을 보낸다. Refresh Token family의 전체
수명은 최초 로그인부터 최대 30일이다.

Access 쿠키의 Path가 `/`이므로 같은 공개 origin의 Resource Server 경로에도 전송된다.
Refresh 쿠키는 `/api/v1/auth` 경로에만 전송된다. 따라서 Browser/Auth와 Resource Server는
하나의 공개 origin 아래에서 path routing으로 연결한다.

## 6. Auth API와 Frontend 동작

### 필수 API

| 요청 | 성공 응답 | 입력·쿠키 |
| --- | --- | --- |
| `POST /api/v1/auth/login` | 일반 로그인은 `204`와 Access/Refresh 쿠키. 2FA 필요 시 기존 Access/Refresh 쿠키를 삭제하고 `202 {"next":"TWO_FACTOR"}`와 auth-flow 쿠키 | JSON `{"email":"...","password":"..."}` |
| `POST /api/v1/auth/2fa/verify` | `204`와 Access/Refresh 쿠키, auth-flow 쿠키 삭제 | auth-flow 쿠키, JSON `{"code":"..."}` |
| `GET /api/v1/auth/me` | 아래 사용자 JSON | Access 쿠키 |
| `GET /api/v1/auth/csrf` | `200 {"csrf_token":"..."}` | Access 쿠키 |
| `POST /api/v1/auth/refresh` | `204`와 회전된 Access/Refresh 쿠키 | Refresh 쿠키 |
| `POST /api/v1/auth/logout` | `204`, 현재 Refresh family 폐기 및 Access/Refresh 쿠키 삭제 | Refresh 쿠키는 선택 사항 |
| `POST /api/v1/auth/logout-all` | `204`, 사용자의 모든 Refresh family 폐기 및 Access/Refresh 쿠키 삭제 | Access 쿠키, `X-CSRF-Token` |
| `PUT /api/v1/account/password` | `204`와 Access/Refresh 쿠키 삭제 | Access 쿠키, `X-CSRF-Token`, JSON `{"current_password":"...","new_password":"..."}` |

`GET /api/v1/auth/me` 응답 필드는 실제 Jackson 설정에 맞춘 `snake_case`다.

```json
{
  "user_id": "00000000-0000-0000-0000-000000000000",
  "role": "PARTICIPANT",
  "permissions": [],
  "account_state": "ACTIVE",
  "must_change_password": false
}
```

모든 Auth 상태 변경 요청은 다음 헤더를 보낸다.

```http
Origin: <CIVIC_BROWSER_ORIGIN과 정확히 같은 값>
Sec-Fetch-Site: same-origin
Content-Type: application/json
```

Main/Auth의 브라우저 API는 HttpOnly 쿠키로 인증하며 `Authorization` 헤더를 받지 않는다.
`/logout-all` 등 인증된 Main/Auth 상태 변경 API는 `/csrf` 응답을
`X-CSRF-Token`으로 보낸다. `/login`, `/2fa/verify`, `/refresh`, `/logout`은 Origin과
Fetch Metadata로 보호한다.

`/me`의 `must_change_password`가 `true`이면 `/csrf`를 받은 뒤
`PUT /api/v1/account/password`를 호출한다. 성공 응답이 두 인증 쿠키를 삭제하므로 새
비밀번호로 다시 로그인한다. BFF가 Auth를 프록시하면 Main/Auth의 각 `Set-Cookie` header를
합치지 않고 브라우저에 각각 전달한다.

| 상태 | 의미 |
| --- | --- |
| `400` | Origin, Fetch Metadata, Content-Type 또는 요청 값이 계약과 다름 |
| `401` | 로그인·2FA·Access Token·Refresh Token이 없거나 유효하지 않음 |
| `403` | 유효한 인증에 필요한 권한이 없거나 비밀번호 변경이 필요함 |
| `409` | 같은 Refresh Token의 동시 회전이 이미 진행됨 |
| `429` | 로그인 전 인증 요청의 rate limit 초과 |

### 401 갱신 처리

Frontend/BFF의 공통 요청 계층은 다음 순서로 처리한다.

1. 보호된 API의 최초 `401`에서 `POST /api/v1/auth/refresh`를 한 번 호출한다.
2. refresh `204`이면 새 쿠키로 원 요청을 한 번 재시도한다.
3. 같은 cookie jar의 동시 refresh는 single-flight로 합친다. 이미 회전된 Refresh Token이
   10초 안에 다시 사용되어 `409`가 오면 먼저 시작한 refresh의 쿠키 반영을 기다린 뒤 원
   요청만 한 번 재시도한다.
4. refresh `401`, `409` 대기 실패 또는 재시도 후 `401`이면 로그인 화면으로 전환한다.
5. `403`은 유효한 사용자에게 권한이 부족한 결과이므로 refresh하지 않고 권한 오류로
   처리한다.
6. refresh의 네트워크 오류, `429` 또는 `5xx`는 일시 오류로 표시하고 자동 반복 호출하지
   않는다. refresh의 `400`은 요청 header나 배포 설정 오류로 처리한다.

Access JWT가 바뀌면 JWT `jti`에 묶인 CSRF 값도 바뀐다. 갱신 뒤 Main/Auth 상태 변경
요청은 `/csrf`를 다시 호출한다. 자동 재시도는 body를 안전하게 재생할 수 있는 요청에만
적용한다.

## 7. Chat, Vote, RAG가 구현할 공통 인증 입력

각 Resource Server는 다음 계약만 맞추면 Main/Auth와 연동된다.

1. discovery의 `issuer`와 `jwks_uri`를 읽고 JOSE header를 3절 값에 맞춰 검증하며 허용
   알고리즘을 `RS256`으로 제한한다.
2. JWT header의 `kid`에 해당하는 RSA public key로 서명을 검증한다.
3. `iss` exact match, `aud` 배열의 `civic-ai-api`, UUID `sub`, 이메일 형식의 `email`,
   `iat`, `exp`, UUID `jti`, 문자열 `scope`와 `exp - iat = 900`을 검증한다. `iat`이 검증 시각보다 30초를 초과해
   미래이면 `401`이며 `exp`는 검증 시각보다 이후여야 한다.
4. `scope`를 공백으로 분리하여 endpoint가 요구하는 scope를 검사한다.
5. Access 자격 증명은 `civic_ai_access_token` 쿠키 최대 하나와 잘 구성된
   `Authorization: Bearer <JWT 원문>` 최대 하나다. 중복 또는 잘못된 형식은 `401`이다.
6. 한 요청에 쿠키와 Authorization이 모두 있으면 두 JWT 원문이 정확히 같을 때만 허용한다.
7. 자격 증명이 없거나 서명·claim·형식이 잘못되었으면 `401`, 유효한 JWT에 필요한 scope가
   없으면 `403`을 반환한다.
8. Resource Server의 인증 입력은 Access JWT다. Access JWT 만료 결과를 `401`로 반환하면
   Frontend/BFF가 Main/Auth에서 갱신한다.

Cookie 인증으로 상태를 변경하는 Resource Server 요청은 허용된 exact Origin과
`Sec-Fetch-Site: same-origin`을 검사하거나, 동일 검사를 수행하는 BFF 전용 ingress로
제한한다.

Edge/Nginx는 Resource Server로 향하는 `Cookie`와 `Authorization` 헤더 원문을 그대로
전달한다.

## 8. discovery, JWKS와 개발 서버 상태

공개 endpoint:

```text
GET /.well-known/openid-configuration
GET /.well-known/jwks.json
```

discovery 응답은 `issuer`와 `jwks_uri`를 제공한다. 정상 배포의 JWKS는 `kty=RSA`,
`use=sig`, `alg=RS256`인 public key를 `Cache-Control: max-age=300`으로 제공한다. 배포하는
각 active·retiring RSA JWK 파일에는 서로 다른 비어 있지 않은 `kid`를 설정한다. unknown
`kid`를 받으면 JWKS를 한 번 다시 읽은 뒤 검증 실패를 `401`로 처리한다.

OCI A1 개발 주소:

```text
Public origin / issuer: https://140-238-17-223.sslip.io
Discovery:              https://140-238-17-223.sslip.io/.well-known/openid-configuration
JWKS:                   https://140-238-17-223.sslip.io/.well-known/jwks.json
Auth API:               https://140-238-17-223.sslip.io/api/v1/auth/*
Audience:               civic-ai-api
```

2026-08-26 OCI A1 개발 서버에 `feat/refresh-token-auth` 구현과 영속 RSA private JWK를
배포했다. 공개 JWKS는 `kty=RSA`, `alg=RS256`, 비어 있지 않은 `kid`를 제공한다. 공개 Auth
경로에서 로그인, `/me`, Refresh Token 회전, 로그아웃을 실행했고 실제 발급 Access JWT의
서명을 위 JWKS로 검증했다. 이 주소는 현재 연동 시험에 바로 사용할 수 있다.

컨테이너가 JWKS를 내부 주소로 읽더라도 JWT의 `iss` 검증값은 공개 issuer와 정확히 같아야
한다.

## 9. 연동 완료 기준

- 로그인과 2FA 완료 후 두 HttpOnly 쿠키가 정확한 이름·Path·만료 속성으로 발급된다.
- Access JWT의 header, claim, 15분 수명과 scope가 이 문서와 일치한다.
- `/me`의 `snake_case` 응답으로 사용자 UUID, 역할, permission과 계정 상태를 읽는다.
- Resource Server가 Access 쿠키와 Bearer를 검증하고 `401`과 `403`을 구분한다.
- Frontend/BFF가 `401 → refresh → 원 요청 1회 재시도`와 refresh `409`를 처리한다.
- Edge가 Resource Server에 Cookie와 Authorization을 그대로 전달한다.
- 개발 JWKS의 RSA key로 실제 발급 JWT를 검증해 Chat, Vote, RAG의 인증 연동을 확인한다.
