# Local E2E 인증 fixture 계약

## 결정 상태

이 문서는 현재 Next.js의 JWT 발급 구현을 개발자 노트북에서만 사용하는 Local E2E 인증
fixture로 정의한다. 기존 구현은 운영 인증 서버가 준비될 때 제거할 대체물이 아니지만,
staging, production 또는 GitHub Actions에 배포하거나 재사용하지 않는다. CI 전용 E2E 인증과
운영 인증은 별도 환경에서 구성한다.

```text
developer laptop
  Next.js localhost:3000 Local E2E fixture issuer
  -> fixture JWT
  -> civic_ai_access_token HttpOnly cookie
  -> Chat Resource Server localhost:8082 local verifier
```

이 결정의 목적은 개발자가 로컬 Next.js, Chat Resource Server와 데이터베이스를 함께 실행해
채팅 E2E를 검증하면서, 이 fixture가 노트북 밖의 배포 환경으로 확장되지 않도록 경계를
고정하는 것이다.

## 적용 범위

Local E2E fixture는 다음 조건을 모두 만족할 때만 사용할 수 있다.

- 개발자 노트북에서 Next.js를 `localhost:3000`으로 실행한다.
- 같은 노트북에서 Chat Resource Server를 `localhost:8082`로 실행한다.
- Resource Server는 local profile과 로컬 테스트 데이터만 사용한다.

다음 환경에서는 사용할 수 없다.

- staging
- production
- GitHub Actions를 포함한 CI runner
- 운영 데이터 또는 운영 Resource Server에 연결된 환경
- 외부 사용자가 접근할 수 있는 공유 개발 환경

현재 `/api/dev/auth/session`은 `NODE_ENV=production`에서 `404`를 반환한다. 이 방어를 배포
활성화 수단으로 사용하지 않는다. Local E2E issuer가 필요한 프로세스는 개발자 노트북에서 직접
실행하며 production 차단 조건을 완화하지 않는다.

## 고정 계약

개발자 노트북에서 실행한 Resource Server의 local profile은 다음 값을 검증한다.

| 항목               | 값                                   |
| ------------------ | ------------------------------------ |
| Algorithm          | `HS256`                              |
| Issuer             | `http://localhost:3000/api/dev/auth` |
| Audience           | `civic-ai-api`                       |
| Subject claim      | `sub`                                |
| Scope claim        | `scope`                              |
| Token TTL          | 3600초                               |
| Cookie name        | `civic_ai_access_token`              |
| Cookie path        | `/`                                  |
| WebSocket endpoint | `/ws`                                |

Fixture signing key는 다음과 같다.

```text
civic-ai-local-auth-fixture-signing-key-v1-public-do-not-use-in-production
```

이 값은 credential이 아니라 공개된 테스트 재료다. 비밀로 취급하거나 운영 secret 저장소에
등록하지 않는다. 반대로 공개된 값이라는 이유로 staging이나 production verifier에 등록해서도
안 된다.

## 세션 발급 API

현재 E2E session endpoint는 기존 테스트 호환성을 위해 다음 URL을 유지한다.

```http
POST /api/dev/auth/session
Content-Type: application/json

{
  "subject": "e2e-user-id"
}
```

성공 시 응답 body에 JWT를 노출하지 않고 HttpOnly 쿠키를 설정한다.

```http
HTTP/1.1 204 No Content
Set-Cookie: civic_ai_access_token=<jwt>; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax
```

삭제 API는 동일한 쿠키를 만료시킨다.

```http
DELETE /api/dev/auth/session
```

`/api/dev`라는 기존 경로 이름은 이 구현이 E2E fixture라는 정책을 바꾸지 않는다. 경로를
`/api/e2e`로 변경할 필요가 생기면 기존 E2E 호출을 먼저 공통 helper로 모은 뒤 별도 변경으로
진행한다.

## Claim과 권한 정책

기본 JWT는 [`platform-auth.md`](./platform-auth.md)에 정의된 플랫폼 일반 사용자 scope를
포함한다. `sub`는 E2E 안에서 인증된 플랫폼 사용자 ID이며 테스트 데이터 격리와 다중 사용자
시나리오에 사용한다.

특수 권한은 소스에 allowlist된 subject에만 부여한다.

- inbox pagination 전용 subject pattern에는
  `chat:rooms:membership-limit:exempt`를 추가한다.
- `local-super-admin`과 `e2e-chat-export-admin-{uuid}` pattern에는
  `chat:audit:exports`를 추가한다.

일반 subject가 요청 body나 query로 임의 scope를 지정하는 API는 제공하지 않는다. 새로운 특수
권한이 필요하면 테스트 목적, subject allowlist와 Resource Server 검증을 함께 리뷰한다.

## 구성요소별 책임

| 구성요소                      | 책임                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| Next.js Local E2E issuer      | 노트북에서 fixture JWT를 발급하고 HttpOnly 쿠키를 설정·삭제한다.       |
| Playwright helper             | 테스트별 subject로 session을 발급하고 쿠키 속성을 검증한다.            |
| 로컬 브라우저                 | JWT를 직접 읽지 않고 REST와 WebSocket 요청에 쿠키를 전달한다.          |
| Resource Server local profile | fixture issuer, signature, audience, expiry와 필요한 scope를 검증한다. |
| CI 전용 E2E 환경              | 이 fixture를 재사용하지 않고 별도의 인증 구성을 사용한다.              |
| staging 및 production         | Local E2E issuer와 fixture key를 포함하거나 신뢰하지 않는다.           |

## E2E 호출 경계

E2E spec은 session endpoint를 직접 호출하지 않고 `e2e/chat-e2e-helpers.ts`의 공통 helper를
사용한다. endpoint 경로와 로그인 성공 이벤트 이름도 이 파일에서만 참조한다. 공통 helper는
다음 책임을 구분한다.

1. `issueLocalE2EAuthenticationSession`: API request context에 특정 subject의 E2E session 발급
2. `renewLocalE2EAuthenticationSession`: 열린 SPA의 session을 갱신하고
   `civic-ai:authentication-succeeded` 이벤트를 전달해 실시간 transport 재연결
3. `waitForLocalE2EAuthenticationSessionResponse`: UI 로그인 시나리오가 E2E session endpoint의
   응답을 직접 알지 않고 기다리게 함

`authenticateLocalE2EUserAs`와 직접 session을 발급하거나 갱신하던 spec은 이 경계를 사용한다.
`authenticateLocalE2EUser`는 로컬 E2E 로그인 UI 자체를 검증하기 위해 버튼 클릭 흐름을 유지한다.

## 운영 인증과의 관계

운영 인증 서버가 준비되어도 Local E2E issuer를 운영 issuer로 바꾸거나 배포하지 않는다. 운영
인증 경로와 verifier는 별도로 추가한다.

- 일반 사용자는 운영 서버에 로그인하고 운영 서버가 HttpOnly 쿠키를 발급한다.
- Chat, Vote 등 production Resource Server는 운영 JWT만 검증한다.
- 개발자 노트북의 채팅 E2E만 Local E2E fixture를 계속 사용한다.
- CI 전용 E2E와 운영 로그인부터 REST·WebSocket 인증까지의 통합 테스트는 별도 인증을 사용한다.

웹은 두 환경 모두 JWT를 파싱하거나 client-readable storage에 저장하지 않는다. 쿠키 전달,
로그인 상태 확인, `401` 복구와 WebSocket 재연결만 책임진다.

## 변경 관리

다음 값 중 하나라도 변경할 때는 frontend와 관련 Resource Server 담당자가 함께 검토한다.

- issuer 또는 signing key
- algorithm, audience, subject 또는 scope claim
- cookie name, path와 SameSite 정책
- token TTL
- REST 또는 WebSocket 인증 전달 방식
- 특수 subject allowlist

변경 시 최소한 다음을 함께 확인한다.

1. JWT 발급 unit test
2. session route와 HttpOnly cookie test
3. Resource Server local verifier contract test
4. 배포 설정에 Local E2E issuer와 fixture key가 포함되지 않는지 확인
5. 인증이 필요한 채팅 REST와 WebSocket E2E

## Resource Server 전달 요약

Resource Server 팀에는 다음 정책을 전달한다.

> 프론트의 현재 JWT issuer를 개발자 노트북 전용 Local E2E 인증 fixture로 공식화한다. 개발자가
> `localhost:3000`의 Next.js와 `localhost:8082`의 Resource Server를 함께 실행할 때 Resource
> Server local profile은 기존 fixture issuer, audience, signing key와 cookie 인증을 지원한다.
> 이 구성은 GitHub Actions, staging과 production에 배포하거나 포함하지 않는다. CI 전용 E2E와
> 운영 인증 서버 JWT는 각각 별도의 인증 구성으로 연결한다.
