# Task Preparation API 계약

## 1. 목적과 책임

Task Preparation API는 Vote Resource Server가 과업을 발행하기 전에 Persona
Runtime Server에 확정된 과업 콘텐츠를 전달하는 서버 간 API다.

이 API의 목적은 Runtime이 과업 제목, 배경, 질문, 선택지를 미리 저장하고 이후
Task Prediction 요청을 즉시 처리할 수 있도록 준비하는 것이다.

- Vote Resource Server가 Task 콘텐츠의 원본과 식별자를 소유한다.
- Persona Runtime Server는 전달받은 Task 콘텐츠의 준비된 사본 또는 파생 데이터를
  관리한다.
- 이 요청에는 사용자, Persona, 설문 응답 및 Task 제출 정보가 포함되지 않는다.
- 현재 지원하는 Task 질문은 모두 단일 선택이다.
- 단순히 `DRAFT` 상태라는 이유로 Task 콘텐츠를 전송하지 않는다.
- `READY`와 Task 발행의 결합 정책은 관리자 플로우 확정 후 별도로 정의한다.

## 2. Endpoint와 인증

```http
POST /v1/tasks/prepare
Content-Type: application/json
Authorization: Bearer {ai-runtime-shared-token}
```

- 외부 사용자가 호출하는 API가 아니다.
- Runtime은 `VOTE_AI_RUNTIME_AUTH_TOKEN` 공유 토큰을 검증해야 한다.
- 사용자 JWT는 전달하지 않는다.
- TLS가 적용된 내부 또는 허용된 네트워크에서만 노출한다.
- `requestId`가 멱등성 키이므로 별도의 `Idempotency-Key` header는 사용하지 않는다.

## 3. 준비 요청

### 3.1 전체 예시

```json
{
  "schemaVersion": 1,
  "requestId": "30000000-0000-0000-0000-000000000001",
  "contentFingerprint": "sha256:4fcb7f3f42b0a2794f0126925fe043c7377046775583684755d6b5a0d78f8ea1",
  "task": {
    "taskId": "10000000-0000-0000-0000-000000000001",
    "title": "청년 주거 지원 정책",
    "description": "청년층의 주거비 부담을 완화하기 위한 정책입니다.",
    "questions": [
      {
        "questionId": "20000000-0000-0000-0000-000000000001",
        "content": "어떤 정책이 가장 적절하다고 생각하십니까?",
        "description": "정책의 재정 부담과 지원 효과를 함께 고려해 주세요.",
        "options": [
          {
            "optionId": "40000000-0000-0000-0000-000000000001",
            "content": "월세 직접 지원"
          },
          {
            "optionId": "40000000-0000-0000-0000-000000000002",
            "content": "공공임대주택 확대"
          }
        ]
      }
    ]
  }
}
```

### 3.2 최상위 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `schemaVersion` | integer | O | 요청 계약 버전, 현재 `1` |
| `requestId` | UUID | O | 준비 요청 식별자이자 멱등성 키 |
| `contentFingerprint` | string | O | `task` 콘텐츠를 식별하는 SHA-256 fingerprint |
| `task` | object | O | 발행하려는 Task의 확정 콘텐츠 |

### 3.3 `task` 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `taskId` | UUID | O | Resource Server가 발급한 불변 Task 식별자 |
| `title` | string | O | 공백이 아닌 Task 제목 |
| `description` | string 또는 null | X | Task 전체의 배경과 설명 |
| `questions` | array | O | 질문 배열, 최소 1개 |

`taskId`는 이후 Task Prediction과 Task Outcome에서 동일하게 사용한다. Runtime
전용 Task 식별자를 새로 발급하지 않는다.

### 3.4 `questions[]` 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `questionId` | UUID | O | Resource Server가 발급한 불변 질문 식별자 |
| `content` | string | O | 공백이 아닌 실제 질문 문구 |
| `description` | string 또는 null | X | 질문별 배경 또는 추가 설명 |
| `options` | array | O | 단일 선택 질문의 선택지, 최소 2개 |

질문 타입은 현재 모두 단일 선택이므로 `type`, `constraint`는 전송하지 않는다.

### 3.5 `options[]` 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `optionId` | UUID | O | Resource Server가 발급한 불변 선택지 식별자 |
| `content` | string | O | 공백이 아닌 실제 선택지 문구 |

선택지의 종류를 별도로 해석할 필요가 없으므로 `kind`는 전송하지 않는다. `기타`와
같은 선택지도 일반 선택지 문구로 전달한다.

## 4. 순서 계약

`questions`와 `options` 배열의 물리적 순서가 표시 및 해석 순서다.

- Resource Server는 도메인의 `displayOrder`를 기준으로 정렬한 배열을 전송한다.
- API에는 `displayOrder`를 포함하지 않는다.
- Runtime은 배열을 임의로 정렬하거나 중복을 제거하지 않는다.
- 질문 또는 선택지의 순서가 바뀌면 서로 다른 Task 콘텐츠다.
- 이후 Prediction 응답은 요청에서 사용된 `questionId`, `optionId`를 그대로 참조한다.

## 5. Content fingerprint 계약

`contentFingerprint`는 동일한 `taskId`의 콘텐츠가 같은지 판단하기 위한 값이다.

```text
contentFingerprint = "sha256:" + lowercaseHex(
  SHA-256(Resource Server의 canonical Task payload UTF-8 bytes)
)
```

canonical Task payload에는 다음 값과 배열 순서가 포함된다.

- `taskId`, `title`, `description`
- 각 질문의 `questionId`, `content`, `description`
- 각 선택지의 `optionId`, `content`
- `questions`, `options` 배열 순서

`schemaVersion`, `requestId`는 Task 콘텐츠가 아니므로 fingerprint 계산에서 제외한다.
Runtime은 `contentFingerprint`를 불투명한 콘텐츠 식별자로 저장할 수 있다. 다만 동일한
`taskId + contentFingerprint`에 의미적으로 다른 Task 콘텐츠가 전달되면 충돌로
처리해야 한다.

## 6. 성공 응답

### 6.1 전체 예시

```json
{
  "schemaVersion": 1,
  "requestId": "30000000-0000-0000-0000-000000000001",
  "taskId": "10000000-0000-0000-0000-000000000001",
  "contentFingerprint": "sha256:4fcb7f3f42b0a2794f0126925fe043c7377046775583684755d6b5a0d78f8ea1",
  "status": "READY",
  "replayed": false,
  "preparedAt": "2026-09-02T06:30:00Z"
}
```

### 6.2 필드 계약

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `schemaVersion` | integer | O | 응답 계약 버전, 요청과 동일 |
| `requestId` | UUID | O | 요청의 `requestId`와 동일 |
| `taskId` | UUID | O | 요청의 `task.taskId`와 동일 |
| `contentFingerprint` | string | O | 요청의 fingerprint와 동일 |
| `status` | string | O | 성공 시 항상 `READY` |
| `replayed` | boolean | O | 동일 요청의 멱등 재응답 여부 |
| `preparedAt` | ISO 8601 UTC | O | 최초로 해당 콘텐츠가 준비된 시각 |

최초 준비에는 `201 Created`, 동일 요청 재전달에는 `200 OK`를 반환한다. 동일
`taskId`에 변경된 콘텐츠를 준비하는 경우에도 준비 완료 후 `200 OK`를 반환한다.

`READY`는 단순 접수 상태가 아니다. 해당 `taskId + contentFingerprint`를 사용한
Task Prediction 요청을 Runtime이 즉시 처리할 수 있는 상태를 의미한다. v1은
`202 Accepted` 또는 별도 비동기 상태 조회를 지원하지 않는다.

## 7. 멱등성과 콘텐츠 변경

### 7.1 동일 요청 재전달

동일한 `requestId`와 의미적으로 동일한 payload가 다시 전달되면 Runtime은 최초 성공
결과를 반환해야 한다.

- HTTP status: `200 OK`
- `replayed`: `true`
- `preparedAt`: 최초 준비 시각 유지

네트워크 timeout이나 응답 유실이 발생한 경우 Resource Server는 같은 `requestId`와
같은 payload로 재시도한다.

### 7.2 같은 requestId의 다른 payload

동일한 `requestId`에 다른 payload가 전달되면 다음 오류를 반환한다.

```json
{
  "code": "IDEMPOTENCY_CONFLICT",
  "detail": "requestId was already used with different immutable input"
}
```

HTTP status는 `409 Conflict`이며 자동 재시도하지 않는다.

### 7.3 Task 콘텐츠 변경

Task 저장·수정·예약·발행 자체는 Runtime 호출을 발생시키지 않는다. Preparation은
관리자가 명시적으로 요청했을 때만 수행하며, 관리자 API와 UI 계약은 별도로 확정한다.

- 동일 콘텐츠의 재시도에는 동일한 `requestId`와 `contentFingerprint`를 사용한다.
- Task 콘텐츠가 바뀌면 새 `contentFingerprint`와 새 `requestId`를 사용한다.
- Runtime은 동일 `taskId`의 새 fingerprint를 최신 준비 콘텐츠로 반영한다.

## 8. Resource Server 호출 경계

외부 HTTP 호출 중 데이터베이스 트랜잭션이나 Task row lock을 유지하지 않는다.

이 계약은 Resource Server가 명시적인 Preparation 명령을 받은 이후의 8082→9000
통신만 정의한다. 다음 정책은 이 계약에 포함하지 않는다.

- 관리자 UI 버튼과 Resource Server 사이의 API
- 어떤 Task 상태에서 Preparation을 허용할지
- Preparation과 즉시·예약 발행의 실행 순서
- `READY` 여부가 Task 발행을 차단하는지
- 실패 재시도 버튼과 상태 조회 화면

따라서 Runtime은 Task 생성·수정·예약·발행 이벤트를 추론하지 않는다. 전달받은
`requestId`, `taskId`, `contentFingerprint`, Task 콘텐츠만 계약대로 처리한다.

## 9. 요청 검증 규칙

Runtime은 최소한 다음 조건을 검증한다.

- `schemaVersion`이 `1`이다.
- `requestId`, `taskId`, 모든 `questionId`, `optionId`가 유효한 UUID다.
- `contentFingerprint`가 `sha256:`과 64자리 소문자 16진수 형식이다.
- `title`, 모든 질문 `content`, 모든 선택지 `content`가 공백이 아니다.
- 질문이 1개 이상이다.
- 각 질문의 선택지가 2개 이상이다.
- `questionId`가 payload 안에서 중복되지 않는다.
- `optionId`가 payload 안에서 중복되지 않는다.
- 동일한 `taskId + contentFingerprint`의 콘텐츠가 기존 준비 콘텐츠와 충돌하지 않는다.

## 10. 오류와 재시도

오류 응답은 다음 형식을 사용한다.

```json
{
  "code": "INVALID_REQUEST",
  "detail": "task.questions must contain at least one question"
}
```

| HTTP status | code | Resource Server 처리 |
|---|---|---|
| `400 Bad Request` | `INVALID_REQUEST` | 입력 또는 구현 수정 전 재시도 금지 |
| `401 Unauthorized` | `UNAUTHORIZED` | 서비스 토큰 설정 점검, 재시도 금지 |
| `403 Forbidden` | `FORBIDDEN` | 서비스 권한 설정 점검, 재시도 금지 |
| `409 Conflict` | `IDEMPOTENCY_CONFLICT` | 새 requestId 또는 입력 확인, 자동 재시도 금지 |
| `422 Unprocessable Entity` | `TASK_CONTENT_UNSUPPORTED` | 지원하지 않는 콘텐츠 수정 전 재시도 금지 |
| `408 Request Timeout` | `TIMEOUT` | 동일 requestId와 payload로 재시도 |
| `429 Too Many Requests` | `RATE_LIMITED` | `Retry-After` 또는 지수 백오프로 재시도 |
| `500 Internal Server Error` | `INTERNAL_ERROR` | 동일 requestId와 payload로 지수 백오프 재시도 |
| `503 Service Unavailable` | `SERVICE_UNAVAILABLE` | 동일 requestId와 payload로 지수 백오프 재시도 |

Runtime이 `READY`를 반환하지 않았거나 응답 검증에 실패하면 Resource Server는 해당
Preparation 요청을 성공으로 기록하지 않는다.

## 11. Task Prediction 연계

Task Prediction 요청은 성공한 Preparation receipt의 `taskId`와
`contentFingerprint`를 함께 참조해야 한다.

```json
{
  "taskId": "10000000-0000-0000-0000-000000000001",
  "contentFingerprint": "sha256:4fcb7f3f42b0a2794f0126925fe043c7377046775583684755d6b5a0d78f8ea1"
}
```

- Runtime에 해당 `taskId`의 준비된 콘텐츠가 없으면 Prediction을 생성하지 않는다.
- 요청 fingerprint가 Runtime의 최신 준비 콘텐츠와 다르면 Prediction을 생성하지 않는다.
- Prediction 결과의 모든 `questionId`, `optionId`는 준비된 콘텐츠에 존재해야 한다.
- 기존 Task Prediction 요청의 전체 Task payload를 유지하는 동안에도 fingerprint와
  payload가 동일한 콘텐츠를 나타내야 한다.

Preparation 구현 시 기존 `Task Prediction API 계약`에도 `contentFingerprint`와
다음 오류를 반영해야 한다.

| HTTP status | code | 의미 |
|---|---|---|
| `409 Conflict` | `TASK_CONTENT_MISMATCH` | 요청 fingerprint가 준비된 최신 콘텐츠와 다름 |
| `422 Unprocessable Entity` | `TASK_NOT_PREPARED` | 해당 Task가 아직 Runtime에서 준비되지 않음 |

## 12. 개인정보와 로그 정책

요청에는 다음 정보를 포함하지 않는다.

- 사용자 UUID와 이메일
- 외부 `personaId`
- Survey 응답 및 Persona 생성 입력
- Task Prediction 결과
- Task Submission과 사용자가 작성한 사유

일반 운영 로그에는 `requestId`, `taskId`, `contentFingerprint`, HTTP status, 처리 시간만
기록한다. 전체 질문 및 선택지 payload는 기본 로그에 남기지 않는다.

## 13. Runtime 구현 체크리스트

- [ ] `VOTE_AI_RUNTIME_AUTH_TOKEN` 공유 토큰을 검증한다.
- [ ] `schemaVersion = 1`만 허용한다.
- [ ] 질문과 선택지 배열 순서를 보존한다.
- [ ] 모든 식별자와 필수 문구를 검증한다.
- [ ] 동일 `requestId`와 payload에 최초 성공 결과를 재응답한다.
- [ ] 동일 `requestId`와 다른 payload에 `409 IDEMPOTENCY_CONFLICT`를 반환한다.
- [ ] 동일 `taskId`의 새 fingerprint를 최신 준비 콘텐츠로 반영한다.
- [ ] `READY` 반환 시 즉시 Task Prediction에 사용할 수 있다.
- [ ] Prediction 요청의 fingerprint가 준비된 최신 콘텐츠와 같은지 검증한다.
- [ ] `DRAFT` 저장이나 수정만으로는 Preparation 요청이 오지 않는다고 가정한다.
- [ ] 사용자 또는 Persona 단위 데이터를 Task 준비 데이터에 결합하지 않는다.
- [ ] 오류 응답에 원본 Task 콘텐츠를 포함하지 않는다.

## 14. 구현 범위

Resource Server 구현 범위는 다음과 같다.

- 현재 Task 도메인을 정렬된 Preparation payload로 변환
- canonical Task payload fingerprint 생성
- Runtime HTTP client와 응답 검증
- 성공 receipt 및 재시도 상태 저장
- 명시적인 application service 호출에서만 Runtime 요청 수행
- Task 생성·수정·예약·발행 경로와 Preparation 호출 분리
- 단위 테스트와 HTTP 계약 테스트

다음은 v1 범위에서 제외한다.

- 다중 선택 및 직접 입력 질문
- 관리자 UI 및 Resource Server Preparation API
- Task 상태별 Preparation 허용 정책
- Preparation과 발행 순서 및 발행 차단 정책
- 비동기 Preparation 상태 조회 또는 callback
- 사용자 및 Persona 단위 준비
- Runtime 내부 파생 데이터의 저장 구조
