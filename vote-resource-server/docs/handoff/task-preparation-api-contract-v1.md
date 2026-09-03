# Task 전처리 및 발행 API 명세 v1

## 문서 상태

- 상태: 구현 전 합의용 목표 계약
- API 계약 버전: `1`
- 대상: Persona Runtime(9000), Vote Resource Server(8082), 관리자 프론트엔드
- 관련 시나리오: [Task 전처리 및 관리자 발행 시나리오](./task-preparation-publication-scenario.md)

이 문서는 기존 API를 제거하지 않는다. 기존 `POST /v1/tasks/prepare`의 동기 완료 전제를
비동기 접수 방식으로 수정하고, 신규 API 세 개와 기존 관리자 API 변경 사항을 정의한다.

## 1. 공통 규칙

- `requestId`, `taskId`, `questionId`, `optionId`는 UUID 문자열이다.
- 시각은 UTC ISO 8601 문자열이다.
- 요청과 응답의 `Content-Type`은 `application/json`이다.
- `contentFingerprint` 형식은 `sha256:<lowercase hex 64자>`다.
- 8082가 전송한 `contentFingerprint`를 9000이 임의로 다시 정의하지 않는다.
- 계약을 깨는 변경은 기존 필드를 재해석하지 않고 `schemaVersion`을 올린다.
- 관리자 프론트엔드는 9000을 직접 호출하지 않는다.

### 인증

| 호출 | 인증 |
|---|---|
| 관리자 프론트엔드 → 8082 | 사용자 JWT, scope `vote:tasks:admin` |
| 8082 → 9000 | 서비스 Bearer token |
| 9000 → 8082 callback | 서비스 JWT, scope `vote:task-preparations:write` |

스테이징의 9000 base URL은 배포 환경 변수로 주입한다. 현재 합의된 대상 포트는
`civic-ai.co.kr:9000`이며 소스 코드에 주소를 하드코딩하지 않는다.

## 2. 계약 변경 요약

| 구분 | 방향 | Endpoint | 변경 |
|---|---|---|---|
| 기존 수정 | 8082 → 9000 | `POST /v1/tasks/prepare` | `202 PROCESSING` 비동기 접수 지원 |
| 신규 1 | 관리자 → 8082 | `POST /api/v1/admin/tasks/{taskId}/preparation` | 전처리 시작·재시도 |
| 신규 2 | 9000 → 8082 | `POST /api/v1/integrations/persona/task-preparations/{requestId}/result` | terminal 결과 callback |
| 신규 3 | 8082 → 9000 | `GET /v1/task-preparations/{requestId}` | 발행 전 최종 상태 확인 |
| 기존 수정 | 관리자 → 8082 | `GET /api/v1/admin/tasks/{taskId}` | 전처리 상태와 capabilities 추가 |
| 기존 수정 | 관리자 → 8082 | 수정·예약·발행 API | 전처리 잠금과 READY guard 추가 |

## 3. 공통 전처리 모델

### TaskPreparationView

```json
{
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "status": "PROCESSING",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "attemptCount": 1,
  "processingStartedAt": "2026-09-03T03:00:00Z",
  "preparedAt": null,
  "lastError": null,
  "updatedAt": "2026-09-03T03:00:00Z"
}
```

`status`는 다음 중 하나다.

- `PROCESSING`
- `READY`
- `FAILED`
- `REJECTED`

전처리 요청 이력이 없으면 관리자 Task 상세의 `preparation`은 `null`이다.
저장된 전처리 fingerprint가 현재 Task fingerprint와 다를 때도 현재 read model에서는
`preparation=null`로 반환한다. 이전 결과는 이력일 뿐 현재 내용을 발행할 수 있는 근거가
아니다.

### PreparationError

```json
{
  "code": "TASK_PREPARATION_MODEL_UNAVAILABLE",
  "detail": "The runtime could not complete preprocessing.",
  "retryable": true
}
```

## 4. 신규 관리자 API: 전처리 시작

```http
POST /api/v1/admin/tasks/{taskId}/preparation
Authorization: Bearer <admin-jwt>
Accept: application/json
```

요청 body는 없다.

### 선행 조건

- Task가 존재해야 한다.
- Task 상태가 `DRAFT`여야 한다.
- 질문은 1개이며 단일 선택형이어야 한다.
- 선택지는 발행 가능한 상태여야 한다.

### 신규 작업 접수 또는 재시도 응답

```http
HTTP/1.1 202 Accepted
```

```json
{
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "preparation": {
    "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
    "status": "PROCESSING",
    "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "attemptCount": 1,
    "processingStartedAt": "2026-09-03T03:00:00Z",
    "preparedAt": null,
    "lastError": null,
    "updatedAt": "2026-09-03T03:00:00Z"
  },
  "replayed": false
}
```

### 이미 READY인 동일 내용 응답

```http
HTTP/1.1 200 OK
```

`preparation.status`는 `READY`, `replayed`는 `true`다. 새 9000 작업을 만들지 않는다.

### 이미 PROCESSING인 동일 내용

- `202 Accepted`와 현재 `requestId`를 반환한다.
- `replayed=true`로 반환한다.
- 새 9000 작업을 만들지 않는다.
- 단, 8082의 processing lease가 만료되었다면 같은 requestId로 9000 요청을 재전송하고
  `attemptCount`를 증가시킨다.

### FAILED 재시도

- 같은 fingerprint는 같은 `requestId`를 재사용한다.
- `attemptCount`를 증가시키고 다시 `PROCESSING`으로 전환한다.
- 9000도 같은 `requestId`의 재전송을 멱등하게 처리한다.

### 오류

| HTTP | code | 조건 |
|---:|---|---|
| 404 | `TASK_NOT_FOUND` | Task 없음 |
| 409 | `TASK_PREPARATION_TASK_NOT_DRAFT` | DRAFT가 아님 |
| 422 | `TASK_VALIDATION_FAILED` | 질문·선택지가 발행 불가능 |
| 422 | `TASK_PREPARATION_REJECTED` | 수정되지 않은 동일 내용이 이미 거절됨 |
| 503 | `TASK_PREPARATION_UNAVAILABLE` | 9000 호출을 시작할 수 없음 |

8082가 9000 응답을 받지 못하더라도 이미 `PROCESSING`을 저장했다면 같은 요청을 안전하게
재확인·재전송할 수 있어야 한다.

## 5. 기존 8082 → 9000 API 수정: Task 전처리 접수

```http
POST /v1/tasks/prepare
Authorization: Bearer <vote-service-token>
Content-Type: application/json
Accept: application/json
```

### 요청

```json
{
  "schemaVersion": 1,
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "task": {
    "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
    "title": "과업 제목",
    "description": "과업 배경 설명",
    "questions": [
      {
        "questionId": "43f8b826-98b8-4572-964b-e5598605574a",
        "content": "질문 본문",
        "description": "질문 배경 설명",
        "options": [
          {
            "optionId": "9933587d-30ac-4ea1-b43a-1e56e82c299c",
            "content": "선택지 A"
          },
          {
            "optionId": "0bbb2bae-00ac-493f-af65-bfa38f0adfe8",
            "content": "선택지 B"
          }
        ]
      }
    ]
  }
}
```

배열 순서가 표시 순서다. 별도 `displayOrder`는 보내지 않는다. 현재 Task 정책상 질문은
항상 1개이고 모든 선택지는 단일 선택 대상이다.

### 비동기 접수 응답

```http
HTTP/1.1 202 Accepted
```

```json
{
  "schemaVersion": 1,
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "status": "PROCESSING",
  "replayed": false,
  "acceptedAt": "2026-09-03T03:00:01Z"
}
```

동일 `(requestId, contentFingerprint)`가 처리 중이면 같은 응답을 `replayed=true`로 반환한다.

### 이미 완료된 동일 요청 응답

```http
HTTP/1.1 200 OK
```

```json
{
  "schemaVersion": 1,
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "status": "READY",
  "replayed": true,
  "preparedAt": "2026-09-03T03:03:00Z"
}
```

### 9000 멱등성 규칙

- 같은 `requestId`와 같은 fingerprint: 기존 작업을 반환한다.
- 같은 `requestId`와 다른 fingerprint 또는 taskId: `409 REQUEST_ID_CONFLICT`.
- 같은 taskId라도 새 requestId와 새 fingerprint면 새 작업으로 처리한다.
- `READY`는 불변 terminal 상태다.

## 6. 신규 9000 → 8082 API: 전처리 결과 callback

```http
POST /api/v1/integrations/persona/task-preparations/{requestId}/result
Authorization: Bearer <persona-runtime-service-jwt>
Content-Type: application/json
```

필요 scope는 `vote:task-preparations:write`다.

### READY 요청

```json
{
  "schemaVersion": 1,
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "status": "READY",
  "preparedAt": "2026-09-03T03:03:00Z",
  "error": null
}
```

### FAILED 또는 REJECTED 요청

```json
{
  "schemaVersion": 1,
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "status": "FAILED",
  "preparedAt": null,
  "error": {
    "code": "TASK_PREPARATION_MODEL_UNAVAILABLE",
    "detail": "The runtime could not complete preprocessing.",
    "retryable": true
  }
}
```

규칙은 다음과 같다.

- `READY`는 `preparedAt`이 필수이고 `error`는 `null`이다.
- `FAILED/REJECTED`는 `preparedAt=null`이고 `error`가 필수다.
- `FAILED`의 `error.retryable`은 `true`다.
- `REJECTED`의 `error.retryable`은 `false`다.
- path의 `requestId`와 body의 `requestId`가 일치해야 한다.
- callback의 fingerprint가 현재 Task fingerprint와도 일치해야 한다.
- 같은 요청이 outbound timeout으로 로컬 `FAILED`가 된 뒤 도착한 유효한 `READY`
  callback은 받아들여 상태를 복구한다.

### 성공 및 멱등 재전송

```http
HTTP/1.1 204 No Content
```

동일 terminal 결과를 다시 보내도 `204`를 반환한다.

허용하는 주요 전이는 `PROCESSING -> READY|FAILED|REJECTED`,
`FAILED -> PROCESSING|READY`다. `READY`에서 다른 상태로의 전이는 허용하지 않는다.

### 오류

| HTTP | code | 조건 | 재시도 |
|---:|---|---|---:|
| 400 | `INVALID_REQUEST` | JSON 또는 path/body 형식 오류 | 수정 후 |
| 401/403 | 인증 표준 오류 | token/scope 오류 | 인증 수정 후 |
| 404 | `TASK_PREPARATION_NOT_FOUND` | 알 수 없는 requestId | 중단 |
| 409 | `TASK_PREPARATION_RESULT_MISMATCH` | taskId 또는 fingerprint 불일치 | 중단 |
| 409 | `TASK_PREPARATION_STALE_RESULT` | 현재 요청보다 오래된 결과 | 중단 |
| 409 | `TASK_PREPARATION_TERMINAL_STATE_CONFLICT` | READY 이후 다른 결과 등 | 중단 |

9000은 network timeout이나 5xx에 한해서 같은 payload로 callback을 재시도한다.

## 7. 신규 8082 → 9000 API: 전처리 상태 조회

```http
GET /v1/task-preparations/{requestId}
Authorization: Bearer <vote-service-token>
Accept: application/json
```

taskId만으로 조회하지 않는다. Task의 과거 준비 결과와 현재 결과를 구분하기 위해
`requestId`를 조회 식별자로 사용한다.

### PROCESSING 응답

```http
HTTP/1.1 200 OK
Cache-Control: no-store
```

```json
{
  "schemaVersion": 1,
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "status": "PROCESSING",
  "acceptedAt": "2026-09-03T03:00:01Z",
  "preparedAt": null,
  "error": null,
  "updatedAt": "2026-09-03T03:01:00Z"
}
```

### READY 응답

```json
{
  "schemaVersion": 1,
  "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "status": "READY",
  "acceptedAt": "2026-09-03T03:00:01Z",
  "preparedAt": "2026-09-03T03:03:00Z",
  "error": null,
  "updatedAt": "2026-09-03T03:03:00Z"
}
```

`FAILED/REJECTED`는 callback과 같은 `error` 구조를 사용한다. 알 수 없는 requestId는
`404 TASK_PREPARATION_NOT_FOUND`를 반환한다.

8082는 `status=READY`만 확인해서는 안 된다. 응답의 `requestId`, `taskId`,
`contentFingerprint`가 현재 Task 준비 건과 모두 일치해야 발행할 수 있다.

## 8. 기존 관리자 Task 상세 응답 수정

```http
GET /api/v1/admin/tasks/{taskId}
Authorization: Bearer <admin-jwt>
```

기존 `task`, `lifecycleHistory`를 유지하고 다음 필드를 추가한다.

```json
{
  "task": {
    "id": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
    "status": "DRAFT"
  },
  "preparation": {
    "requestId": "5aaf64a5-d6c9-4fd0-aa6d-371c22c90a58",
    "status": "READY",
    "contentFingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "attemptCount": 1,
    "processingStartedAt": null,
    "preparedAt": "2026-09-03T03:03:00Z",
    "lastError": null,
    "updatedAt": "2026-09-03T03:03:00Z"
  },
  "capabilities": {
    "canEditContent": false,
    "canStartPreparation": false,
    "canSchedule": true,
    "canOpenNow": true
  },
  "lifecycleHistory": []
}
```

관리자 프론트엔드는 상태 규칙을 중복 구현하기보다 `capabilities`로 버튼 활성화를 판단한다.
`preparation=null`이면 아직 요청하지 않은 상태다.

## 9. 기존 관리자 수정·발행 API 변경

Endpoint와 기존 request body는 유지한다.

| Endpoint | 추가 규칙 |
|---|---|
| `PUT /api/v1/admin/tasks/{taskId}` | `PROCESSING/READY`이면 내용 수정 거절 |
| `POST /api/v1/admin/tasks/{taskId}/schedule` | 현재 fingerprint의 로컬 `READY` 필수 |
| `PUT /api/v1/admin/tasks/{taskId}/schedule` | 기존 준비 결과를 유지하며 시간만 변경 |
| `POST /api/v1/admin/tasks/{taskId}/open-now` | 9000 최종 GET에서 `READY` 확인 후 OPEN |
| `POST /api/v1/admin/tasks/{taskId}/start-now` | 예약 Task도 9000 최종 GET 확인 후 OPEN |

공통 추가 오류는 다음과 같다.

| HTTP | code | 의미 |
|---:|---|---|
| 409 | `TASK_CONTENT_LOCKED_BY_PREPARATION` | 전처리 중이거나 완료되어 내용 수정 불가 |
| 409 | `TASK_PREPARATION_NOT_READY` | 현재 fingerprint가 READY가 아님 |
| 503 | `TASK_PREPARATION_VERIFICATION_UNAVAILABLE` | 발행 전 9000 확인 실패 |
| 409 | `TASK_PREPARATION_FINGERPRINT_MISMATCH` | READY 결과와 현재 Task 내용이 다름 |

오류 시 Task lifecycle 상태는 바뀌지 않는다.

## 10. 8082 오류 응답 형식

8082는 RFC Problem Details 형식을 유지한다.

```json
{
  "type": "urn:hamcheeze:problem:task-preparation-not-ready",
  "title": "Task request conflict",
  "status": 409,
  "detail": "The current Task content has not completed preparation.",
  "instance": "/api/v1/admin/tasks/7dd2eaa5-7ef2-420a-93dc-0cb337be62ff/open-now",
  "code": "TASK_PREPARATION_NOT_READY",
  "replayed": false,
  "retryable": false,
  "traceId": "01J6TQ7Q6R7Y9D2G7D9W2H8YJ2"
}
```

## 11. 담당자별 구현 체크리스트

### Persona Runtime(9000)

- `POST /v1/tasks/prepare`에서 `202 PROCESSING` 지원
- `(requestId, contentFingerprint)` 멱등 처리
- terminal 상태와 오류 저장
- 8082 callback 재시도
- `GET /v1/task-preparations/{requestId}` 제공
- READY 상태 불변 보장
- 서비스 token 검증

### 관리자 프론트엔드

- 8082 Task 상세의 `preparation`, `capabilities` 사용
- `답변 생성 시작`에서 신규 관리자 POST 호출
- PROCESSING 진행 상태와 FAILED/REJECTED 오류 표시
- capabilities에 따라 수정·예약·즉시 발행 버튼 제어
- 9000 직접 호출 금지
- mutation 성공 후 Task 상세 query invalidate

### Vote Resource Server(8082)

- 관리자 전처리 시작 API 제공
- 기존 9000 prepare client를 비동기 응답에 맞게 수정
- callback API와 전용 scope 추가
- 9000 상태 조회 client 추가
- Task 상세 read model 확장
- 수정·예약·즉시 발행·예약 scheduler에 동일한 guard 적용
- callback/GET 결과를 같은 상태 전이 함수로 반영
- stale callback, 중복 callback, READY 회귀 차단
- 예약 확인 실패 시 retry deferral을 적용해 scheduler starvation 방지
