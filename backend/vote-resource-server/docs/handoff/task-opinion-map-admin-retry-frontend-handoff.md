# Opinion Map 관리자 생성·재시도·재생성 프론트엔드 Handoff

## 핵심 요약

이번 구현에는 이미 생성에 성공한 Opinion Map 정성 요약을 운영자가 다시 만드는
**재생성** 기능이 포함되어 있다.

- `AVAILABLE` 결과만 재생성할 수 있다.
- 재생성 중에는 기존 결과를 계속 조회하고 노출할 수 있다.
- 새 결과가 성공적으로 생성된 경우에만 기존 결과를 교체한다.
- 재생성이 최종 실패해도 기존 결과는 유지된다.
- 생성 요청별 모델, 토큰, 비용과 성공·실패 이력을 조회할 수 있다.

모든 API는 기존 관리자 인증과 `vote:tasks:admin` 권한을 사용한다.

## 프론트엔드 전달 API

이번 변경에서 새로 연동할 API는 2개다.

| 구분 | API | 용도 |
| --- | --- | --- |
| 신규 | `POST /api/v1/admin/tasks/{taskId}/opinion-map-generation/regenerations` | 성공 결과 재생성 |
| 신규 | `GET /api/v1/admin/tasks/{taskId}/opinion-map-generation/runs` | 생성·재시도·재생성 및 과금 이력 조회 |

기존 상세 조회 API에는 `canRegenerate` 필드가 추가되었다.

```http
GET /api/v1/admin/tasks/{taskId}/opinion-map-generation
```

기존 최종 실패 목록과 수동 재시도 API도 그대로 유지된다.

## 과업별 Opinion Map 상세 조회

```http
GET /api/v1/admin/tasks/{taskId}/opinion-map-generation
```

```json
{
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "resultVersion": 1,
  "status": "AVAILABLE",
  "attemptCount": 1,
  "lastErrorCode": null,
  "nextAttemptAt": null,
  "processingStartedAt": "2026-09-29T01:00:00Z",
  "completedAt": "2026-09-29T01:00:02Z",
  "updatedAt": "2026-09-29T01:00:02Z",
  "canGenerate": false,
  "canRetry": false,
  "canRegenerate": true,
  "options": [
    {
      "optionId": "2a496f73-f66d-4766-b246-586f18dcc077",
      "displayOrder": 1,
      "content": "선택지 A",
      "responseCount": 12,
      "sameChoice": {
        "status": "AVAILABLE",
        "body": "같은 선택을 한 응답의 정성 요약"
      },
      "otherChoices": {
        "status": "NO_RESPONSES",
        "body": null
      }
    }
  ]
}
```

상세 상태는 다음 값 중 하나다.

- `NOT_ELIGIBLE`: 아직 결과 생성 대상이 아님
- `NOT_CREATED`: 생성 이력이 없음
- `PENDING`: 생성 대기
- `PROCESSING`: 생성 중
- `RETRY_WAIT`: 자동 재시도 대기
- `AVAILABLE`: 생성 성공
- `UNAVAILABLE`: 최종 실패

버튼 노출 기준은 서버가 반환하는 플래그를 사용한다.

- `canGenerate=true`: 최초 생성 버튼
- `canRetry=true`: 최종 실패 결과의 재시도 버튼
- `canRegenerate=true`: 성공 결과의 재생성 버튼

## 성공 결과 재생성

기존 수동 생성·재시도 API와 다른 API이므로 성공 결과에는 반드시 아래 API를
사용한다.

```http
POST /api/v1/admin/tasks/{taskId}/opinion-map-generation/regenerations
Idempotency-Key: 6dad3ccb-233b-4bc0-aab6-c38828af4f43
Content-Length: 0
```

- 요청 본문은 없다.
- `Idempotency-Key`는 선택값이지만 프론트에서 요청마다 UUID를 생성해 전달하는 것을
  권장한다.
- 키는 공백을 제외하고 최대 100자다.
- 네트워크 재시도 시에는 최초 요청과 같은 키를 다시 사용한다.

새 재생성 작업이 만들어지면 `202 Accepted`와 `created=true`를 반환한다.

```json
{
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "resultVersion": 1,
  "runId": "90bc4447-2586-48e4-a3d1-58ae23990d24",
  "runNumber": 2,
  "status": "PENDING",
  "attemptCount": 0,
  "created": true,
  "requestedAt": "2026-09-29T01:10:00Z",
  "updatedAt": "2026-09-29T01:10:00Z"
}
```

같은 `Idempotency-Key` 요청이거나 이미 진행 중인 재생성이 있으면 새 작업을 만들지
않고 기존 작업을 `200 OK`, `created=false`로 반환한다. 이 경우도 오류가 아니라 정상
응답이며, 응답의 `runId`를 기준으로 진행 상태를 조회한다.

재생성 상태는 다음과 같다.

- 진행 중: `PENDING`, `PROCESSING`, `RETRY_WAIT`
- 성공 종료: `AVAILABLE`
- 실패 종료: `UNAVAILABLE`

중요한 화면 처리 규칙은 다음과 같다.

- POST 성공 후 응답의 `runId`를 저장한다.
- 해당 `runId`가 종료 상태가 될 때까지 이력 API를 폴링한다.
- 재생성이 `PENDING`, `PROCESSING`, `RETRY_WAIT`인 동안 상세 API는
  `canRegenerate=false`를 반환하므로 이 값으로 재생성 버튼을 비활성화한다.
- 요청 직후의 경합 상황에서는 POST가 `200 OK`, `created=false`로 기존 활성 run을
  반환할 수 있다. 이 경우도 정상 응답으로 처리한다.
- run이 `AVAILABLE`이 되면 상세 API를 다시 조회해 새 요약을 반영한다.
- run이 `UNAVAILABLE`이면 오류를 표시하되 기존 상세 결과는 그대로 유지한다.
- 마지막 attempt가 처리 도중 중단되어 lease가 만료된 경우에도 서버가 run을
  `UNAVAILABLE`로 종료하므로 무기한 `PROCESSING` 상태로 남지 않는다.
- 재생성 전후 `resultVersion`은 동일할 수 있다. 실행은 `runId`와 `runNumber`로
  구분한다.

재생성 요청의 주요 오류는 다음과 같다.

- `400 INVALID_REQUEST`: 잘못된 `taskId` 또는 100자를 초과한 멱등 키
- `404 TASK_NOT_FOUND`
- `409 TASK_RESULT_NOT_ELIGIBLE`
- `409 TASK_RESULT_NOT_FINALIZED`
- `409 OPINION_MAP_NOT_CREATED`
- `409 OPINION_MAP_NOT_AVAILABLE`
- `503 OPINION_MAP_GENERATION_DISABLED`

## 생성·과금 이력 조회

```http
GET /api/v1/admin/tasks/{taskId}/opinion-map-generation/runs
```

```json
{
  "runs": [
    {
      "runId": "90bc4447-2586-48e4-a3d1-58ae23990d24",
      "resultVersion": 1,
      "runNumber": 2,
      "trigger": "ADMIN_REGENERATE",
      "status": "AVAILABLE",
      "attemptCount": 1,
      "requestedBy": "admin-user-id",
      "requestedAt": "2026-09-29T01:10:00Z",
      "completedAt": "2026-09-29T01:10:02Z",
      "lastErrorCode": null,
      "attempts": [
        {
          "attemptId": "f97440cf-92ad-49a2-8623-f46445bb518f",
          "attemptNumber": 1,
          "status": "SUCCEEDED",
          "provider": "openrouter",
          "requestedModel": "openai/gpt-5.6-luna",
          "responseModel": "openai/gpt-5.6-luna-20260901",
          "providerGenerationId": "gen-123",
          "providerRequestId": "req-123",
          "promptTokens": 120,
          "completionTokens": 45,
          "totalTokens": 165,
          "cachedTokens": 0,
          "reasoningTokens": 12,
          "cost": 0.0003150000,
          "currency": "USD",
          "finishReason": "stop",
          "httpStatus": 200,
          "errorCode": null,
          "retryable": null,
          "startedAt": "2026-09-29T01:10:00Z",
          "completedAt": "2026-09-29T01:10:02Z",
          "latencyMs": 2000
        }
      ]
    }
  ]
}
```

run의 `trigger` 값은 다음과 같다.

- `TASK_CLOSED`: 과업 마감으로 시작된 최초 생성
- `ADMIN_RETRY`: 최종 실패 결과의 관리자 재시도
- `ADMIN_REGENERATE`: 성공 결과의 관리자 재생성

run의 상태는 재생성 응답과 동일하게 `PENDING`, `PROCESSING`, `RETRY_WAIT`,
`AVAILABLE`, `UNAVAILABLE` 중 하나다.

attempt의 상태는 다음과 같다.

- `STARTED`: 공급자 호출 진행 중
- `SUCCEEDED`: 공급자 호출 성공
- `FAILED`: 공급자 호출 실패

목록 정렬은 `resultVersion` 내림차순, `runNumber` 내림차순이며 각 run의 attempt는
`attemptNumber` 오름차순이다. 즉 `runs[0]`이 가장 최근 실행이다.

토큰, 비용, 공급자 식별자와 HTTP 관련 필드는 공급자가 값을 주지 못했거나 호출이
완료되지 않은 경우 `null`일 수 있다. 비용 합계를 표시한다면 `cost`가 있는 attempt만
합산한다. 마이그레이션 이전에 이미 완료된 생성 건은 상세 결과는 존재해도 run 이력이
비어 있을 수 있다.

존재하지 않는 과업은 `404 TASK_NOT_FOUND`를 반환한다.

## UNAVAILABLE 목록

```http
GET /api/v1/admin/opinion-map-generations/unavailable?limit=20&cursor={cursor}
```

- `limit`: 선택값, 기본 `20`, 최소 `1`, 최대 `100`
- `cursor`: 선택값, 다음 페이지 조회 시 직전 응답의 `nextCursor`를 그대로 전달
- 정렬: 최근 실패순

```json
{
  "items": [
    {
      "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
      "taskTitle": "우리 동네 생활 개선 과업",
      "resultVersion": 1,
      "attemptCount": 3,
      "lastErrorCode": "OPINION_MAP_OPENROUTER_TIMEOUT",
      "failedAt": "2026-09-11T12:00:00Z",
      "canRetry": true
    }
  ],
  "nextCursor": null
}
```

- `nextCursor=null`이면 마지막 페이지다.
- `canRetry=false`이면 재시도 버튼을 비활성화한다.
- 잘못된 `cursor` 또는 `limit`은 `400 INVALID_REQUEST`다.

## 최종 실패 결과 수동 재시도

이 API는 `UNAVAILABLE` 결과를 다시 시도하거나 생성 이력이 없는 과거 과업을 처음
생성할 때 사용한다. 성공한 `AVAILABLE` 결과의 재생성에는 사용하지 않는다.

```http
POST /api/v1/admin/tasks/{taskId}/opinion-map-generation
Content-Length: 0
```

요청 본문은 없다. `UNAVAILABLE` 목록에서 호출하면 기존 실패 이력을 보존하고 시도
횟수를 `0`으로 초기화한 뒤 `PENDING`으로 전환한다.

```http
HTTP/1.1 202 Accepted
```

```json
{
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "resultVersion": 1,
  "status": "PENDING",
  "attemptCount": 0,
  "action": "RETRIED",
  "updatedAt": "2026-09-11T12:10:00Z"
}
```

동시 요청이나 이미 상태가 변경된 경우 중복 실행하지 않고 `200 OK`와
`action=UNCHANGED`를 반환할 수 있다. 이 응답도 정상 처리한다.

생성 이력이 없는 과거 마감 과업은 `202`와 `action=CREATED`를 반환한다.

주요 오류는 다음과 같다.

- `404 TASK_NOT_FOUND`
- `409 TASK_RESULT_NOT_ELIGIBLE`
- `503 OPINION_MAP_GENERATION_DISABLED`

## 권장 화면 흐름

1. 과업 상세 진입 시 상세 API와 run 이력 API를 함께 호출한다.
2. `canRegenerate=true`이면 재생성 버튼을 노출한다.
3. 사용자가 재생성을 확인하면 UUID 멱등 키를 만들고 POST를 한 번 호출한다.
4. `200` 또는 `202`를 모두 정상으로 처리하고 반환된 `runId`를 저장한다.
5. 최신 run이 진행 중이면 상태와 attempt 횟수를 표시하고 버튼을 비활성화한다.
6. run이 `AVAILABLE`이 되면 상세 API를 다시 조회한다.
7. run이 `UNAVAILABLE`이면 `lastErrorCode`를 표시하고 기존 결과를 계속 노출한다.
8. 비용 상세 영역에서는 run 아래 attempt별 모델, 토큰, 비용, 소요 시간을 표시한다.

`lastErrorCode`에 대응하는 사용자 문구는 프론트엔드에서 정한다.
