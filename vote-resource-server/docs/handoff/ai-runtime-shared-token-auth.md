# AI Runtime(9000) 공유 토큰 인증 Handoff

## 확정 정책

- 사용자·관리자 JWT는 8082까지만 전달하며 9000에는 전달하지 않는다.
- 8082와 9000의 모든 서비스 간 요청은 하나의 공유 Bearer token을 사용한다.
- 양쪽 서비스는 들어오는 요청의 token을 검사한다.
- JWT claim, 사용자 `sub`, OAuth scope는 서비스 간 인증에 사용하지 않는다.
- 실제 token은 Git, API 문서, 일반 로그에 기록하지 않고 배포 Secret으로 전달한다.

```http
Authorization: Bearer <ai-runtime-shared-token>
```

8082 환경 변수 이름은 `VOTE_AI_RUNTIME_AUTH_TOKEN`이다. 9000의 환경 변수 이름은
자유롭게 정할 수 있지만 같은 Secret 값을 사용해야 한다.

## 8082에서 9000으로 호출하는 API

다음 요청에서 8082는 공유 token을 `Authorization` header에 첨부한다. 9000은
누락되거나 다른 token을 `401 Unauthorized`로 거절해야 한다.

- `POST /v1/personas`
- `POST /v1/tasks/prepare`
- `GET /v1/task-preparations/{requestId}`
- `POST /v1/task-predictions`

9000은 사용자 JWT를 요구하거나 JWT의 `sub`·scope를 해석하지 않는다.

## 9000에서 8082로 호출하는 API

9000은 다음 요청에 같은 공유 token을 첨부한다.

- `POST /api/v1/integrations/persona/task-preparations/{requestId}/result`
- `GET /api/v1/integrations/persona/tasks/{taskId}/outcomes?cursor=...&limit=100`
- `GET /api/v1/integrations/persona/tasks/{taskId}/outcome?personaId=...`

8082는 이 경로들을 일반 사용자 JWT 보안 체인과 분리해 공유 token만 검사한다.
token이 없거나 다르면 RFC Problem Details 형식의 `401 UNAUTHENTICATED`를 반환한다.
같은 token으로 `/api/v1/me/**` 또는 `/api/v1/admin/**`를 호출할 수는 없다.

## HTTPS와 Nginx

스테이징 기본 진입점은 `https://civic-ai.co.kr`이다.

- `/v1/personas`, `/v1/tasks/prepare`, `/v1/task-preparations/**`,
  `/v1/task-predictions`를 9000으로 전달한다.
- `/api/v1/integrations/persona/**`를 8082로 전달한다.
- 양방향 모두 `Authorization` header를 보존한다.
- 8082나 9000의 애플리케이션 포트를 인터넷에 직접 노출하지 않는다.

Nginx에서 TLS를 종료한 뒤 동일 인스턴스 내부에서 8082·9000으로 HTTP proxy하는 것은
허용한다.

## 배포 설정

8082의 `compose.stage.yaml`은 다음 두 배포 환경 변수를 사용한다.

```text
VOTE_AI_RUNTIME_BASE_URL=https://civic-ai.co.kr
VOTE_AI_RUNTIME_AUTH_TOKEN=<shared-secret>
```

`VOTE_AI_RUNTIME_AUTH_TOKEN`이 없으면 공개된 스테이징 테스트 token을 기본값으로 사용한다.
명시적으로 환경 변수를 주입하면 기본값보다 우선하며, production에서는 이 기본값을
사용하지 않고 별도의 Secret을 주입한다. 운영 token 생성·보관·교체는 Secret 관리 수단에서
수행한다.

## 9000 구현 체크리스트

- [ ] 위 네 개 inbound API에서 공유 token을 constant-time 비교한다.
- [ ] 누락·불일치 token에 `401`을 반환한다.
- [ ] 8082로 보내는 callback과 Outcome 조회에 같은 token을 첨부한다.
- [ ] 사용자 JWT, 공유 token, Authorization header를 로그에 남기지 않는다.
- [ ] HTTPS 진입점과 Nginx path routing을 통해서만 통신한다.
- [ ] 재시도 시 기존 idempotency key와 payload를 그대로 유지한다.
