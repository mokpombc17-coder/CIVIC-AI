# civic-main-auth

CIVIC의 계정, 로그인, 관리자 권한과 공통 Access Token 발급을 담당하는 운영 Auth
서비스입니다. 브라우저 인증은 서버 세션을 사용하지 않고 짧은 Access JWT와 회전하는
Refresh Token을 사용합니다.

Frontend, Chat, Vote, RAG 구현 담당자에게 전달할 전체 계약과 현재 연동 상태는
[`docs/CIVIC-MAIN-AUTH-LOGIN-CONTEXT.md`](docs/CIVIC-MAIN-AUTH-LOGIN-CONTEXT.md)를
참조하세요.

## 인증 모델

- Access Token: RS256 JWT, 15분
- Refresh Token: 256-bit 불투명 난수, 개별 7일
- Refresh Token family: 최초 로그인부터 최대 30일
- 서버 저장값: Refresh Token 원문이 아닌 SHA-256 해시와 family/회전/폐기 메타데이터
- Spring Security HTTP session: `STATELESS`
- 기존 `sessions` 테이블: Flyway V15에서 제거

로그인마다 별도의 Refresh Token family가 생성됩니다. 따라서 여러 브라우저나 기기는
서로 독립적으로 로그아웃할 수 있습니다. `/logout`은 현재 브라우저 family만 폐기하고,
`/logout-all`과 비밀번호 변경·재설정, 2FA 해제, 계정 비활성화, 관리자 권한 변경은 해당
사용자의 모든 Refresh Token을 폐기합니다.

자기 완결형 Access JWT에는 서버 세션이나 토큰 denylist를 두지 않습니다. 따라서 다른
기기에 이미 발급된 Access JWT는 `/logout-all`이나 Refresh Token 폐기 후에도 최대 15분간
유효하고, 이후에는 갱신할 수 없습니다. 계정 상태 변경은 `account_state_version`과 기존
계정 상태 전파 경계로 별도 차단합니다.

Refresh Token은 사용할 때마다 즉시 교체됩니다. 이미 교체된 토큰이 10초 안에 다시
도착하면 동시 갱신으로 보고 `409 Conflict`를 반환합니다. 10초가 지난 뒤 재사용되면
탈취 가능성으로 보고 family 전체를 폐기한 뒤 `401 Unauthorized`를 반환합니다.

## 브라우저 쿠키

| 쿠키 | Path | SameSite | 수명 | 용도 |
| --- | --- | --- | --- | --- |
| `civic_ai_access_token` | `/` | `Lax` | JWT `exp`까지 | Chat, Vote, RAG를 포함한 공통 Access JWT |
| `civic_ai_refresh_token` | `/api/v1/auth` | `Lax` | Refresh Token 만료까지 | Auth의 갱신·로그아웃 경로에만 전송 |
| `__Host-civic-auth-flow` | `/` | `Strict` | 10분 | 2FA, 비밀번호 재설정 등 단기 인증 절차 |

세 쿠키는 모두 `HttpOnly`, `Secure`이며 `Domain`을 지정하지 않습니다. Access 쿠키에는
`Bearer` 접두사 없이 JWT 원문만 들어갑니다. 발급 쿠키의 `Expires`는 각 자격 증명의
만료 시각과 정확히 같고, 로그아웃은 발급 때와 같은 Path로 `Max-Age=0` 쿠키를 보냅니다.

로컬에서 HTTPS를 사용하지 않을 때만 `CIVIC_COOKIES_SECURE=false`로 실행할 수 있습니다.
운영 프로필은 `Secure=true`를 강제합니다.

## Access JWT 계약

- 알고리즘: `RS256`
- 헤더: `typ=JWT`, 활성 키의 `kid` 필수
- 필수 claim: `iss`, `sub`, `aud`, `iat`, `exp`, `jti`, `scope`
- `sub`: 이메일이 아닌 변경되지 않는 사용자 UUID
- `aud`: 배열 `["civic-ai-api"]`
- `exp - iat`: 정확히 900초
- `scope`: 배열이나 `roles` claim이 아닌 공백 구분 문자열
- 내부 상태 claim: `account_state_version`, `must_change_password`

일반 사용자 기본 scope는 다음과 같습니다.

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

관리 권한은 역할과 분리된 permission에서 scope로 변환됩니다.

| permission | 추가 scope |
| --- | --- |
| `RAG_ADMIN` | `rag:documents:write` |
| `CHAT_ADMIN` | `chat:rooms:approve`, `chat:rooms:membership-limit:exempt`, `chat:audit:exports`, `chat:research:exports` |
| `VOTE_ADMIN` | `vote:survey-outbox-replays:write`, `vote:persona-generation-retries:write` |

따라서 위 관리 scope는 일반 사용자에게 발급되지 않습니다. 강제 비밀번호 변경 대상은
완료 전까지 `account:password:write`만 받습니다.

## 브라우저 흐름

1. `POST /api/v1/auth/login` 성공 시 Access/Refresh 쿠키가 발급됩니다. 2FA 계정은
   `202 Accepted`와 auth-flow 쿠키를 받고 `/2fa/verify` 완료 후 두 쿠키를 받습니다.
2. `GET /api/v1/auth/me`로 현재 사용자 UUID, 역할, permission, 계정 상태를 읽습니다.
3. 상태 변경 전 `GET /api/v1/auth/csrf`에서 현재 Access JWT의 `jti`에 묶인 CSRF 값을
   받아 `X-CSRF-Token`으로 전송합니다.
4. 리소스 API가 `401`을 반환하면 브라우저는 `POST /api/v1/auth/refresh`를 한 번 호출한
   뒤 원 요청을 한 번만 재시도합니다. 갱신 후 상태 변경 요청은 CSRF도 다시 받습니다.
   갱신이 `409`이면 같은 브라우저의 다른 요청이 먼저 회전한 것이므로 그 요청이 새 쿠키를
   반영할 때까지 기다린 뒤 원 리소스 요청만 재시도하며, 이전 Refresh Token으로 갱신을
   반복하지 않습니다.
5. `POST /api/v1/auth/logout`은 현재 기기를, `/logout-all`은 모든 기기를 로그아웃합니다.

Worker 런타임은 만료된 Refresh Token family를 체인 단위로 주기적으로 정리합니다.

브라우저 상태 변경 요청은 허용된 정확한 `Origin`, `Sec-Fetch-Site: same-origin`과 허용된
Content-Type을 만족해야 합니다. Main/Auth의 브라우저 API는 `Authorization` 헤더를 받지
않습니다.

Chat, Vote, RAG 같은 리소스 서버는 같은 `iss`와 `aud`로 검증하고 아래 공개 endpoint를
사용합니다.

- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`

Edge/Nginx는 `Cookie`와 `Authorization`을 임의로 재작성하지 않고 리소스 서버에
전달해야 합니다. 리소스 서버가 한 요청에서 Access 쿠키와 Bearer 토큰을 모두 허용한다면
두 원문이 다를 때 요청을 거절해야 합니다.

## 운영 설정

`prod` 프로필은 기본적으로 `/run/secrets/civic/main/`의 config tree를 읽습니다. 다음 값은
개발 기본값으로 운영을 시작할 수 없으며 외부에서 공급해야 합니다.

- `spring.datasource.password`
- `civic.auth.hmac-secret` (최소 32바이트)
- `civic.internal.client-secret`
- `civic.notification.code-protection-key`
- `spring.flyway.placeholders.bootstrap_admin_password_hash`
- `CIVIC_RS256_KEY_DIRECTORY`의 영속 RSA private JWK 파일

그 밖의 필수 운영 환경값은 `CIVIC_DB_URL`, `CIVIC_DB_USER`, `CIVIC_REDIS_URL`,
`CIVIC_ISSUER`, `CIVIC_BROWSER_ORIGIN`, SMTP 설정과 bootstrap 관리자 이메일입니다.
RSA JWK 파일은 파일명 순으로 읽으며 마지막 키를 활성 서명 키로, 앞의 키를 검증 전용
retiring key로 공개합니다. 활성 키에는 고유한 `kid`가 있어야 합니다.

## 검증

Docker가 실행 중인 환경에서 PostgreSQL/Redis Testcontainers를 포함한 전체 검증을
실행합니다.

```bash
./gradlew test
```
