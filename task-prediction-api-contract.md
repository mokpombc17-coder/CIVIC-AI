# Task Prediction API 계약

## 1. 목적과 처리 방식

이 문서는 Vote Resource Server가 AI Runtime Server에 Task 선택지별 예상 이유를
요청할 때 사용하는 HTTP 계약을 정의한다.

처리 흐름은 다음과 같다.

1. Vote Resource Server가 사용자의 현재 사용 가능한 Persona를 조회한다.
2. Resource Server가 `(userId, taskId, personaGenerationId)`에 대응하는
   `predictionId`를 발급한다.
3. Resource Server가 AI Runtime Server에 외부 `personaId`와 Task 콘텐츠를
   전달한다.
4. AI Runtime Server가 Task의 모든 선택지에 대해 예상 이유를 생성한다.
5. Resource Server가 응답 전체를 검증한 후 한 번에 저장한다.
6. Frontend는 Resource Server의 사용자 API를 통해 저장된 예상 이유를 조회한다.

AI Runtime Server는 사용자 계정이나 내부 Persona 생성 이력을 관리하지 않는다.
Runtime에 전달되는 `personaId`는 Persona 생성 API가 발급한 외부 식별자다.
Resource Server의 내부 `userId`, `personaGenerationId`, 이메일, JWT는 전달하지
않는다.

이 문서의 신규 구현 대상은 `schemaVersion: 3`다. Resource Server 내부에는 이미
저장된 요청을 위한 v1·v2 해석 호환성이 남아 있지만, 신규 Runtime 구현은 v3를
기준으로 한다.

## 2. Endpoint와 인증

```http
POST /v1/task-predictions
Content-Type: application/json; charset=UTF-8
Accept: application/json
Authorization: Bearer {service-token}
```

- 개발·로컬 환경에서는 합의에 따라 `Authorization`을 생략할 수 있다.
- 스테이징·운영 환경에서는 서비스 간 Bearer token 또는 동등한 인증을 사용한다.
- Runtime은 인증 token을 요청·오류 로그에 기록하지 않는다.
- 성공 상태는 `200 OK` 또는 `201 Created`를 사용할 수 있다.

## 3. Prediction 요청

### 3.1 전체 예시

```json
{
  "schemaVersion": 3,
  "requestId": "511f4f55-4a42-4de4-841e-c211dde8fd1f",
  "personaId": "persona-7f49a8f2",
  "candidatePolicyVersion": "candidate-policy-v1",
  "contentFingerprint": "sha256:4fcb7f3f42b0a2794f0126925fe043c7377046775583684755d6b5a0d78f8ea1",
  "minimumReasonsPerOption": 2,
  "maximumReasonsPerOption": 5,
  "task": {
    "taskId": "82fa8a7a-9e76-4738-a3a8-e4c1c9b9369c",
    "title": "도심 차량 운행 제한 정책",
    "description": "대기질 개선을 위해 도심 차량 운행을 제한하는 정책에 관한 투표입니다.",
    "questions": [
      {
        "questionId": "4c87f03c-bdcb-40b4-884f-f30e136823c8",
        "displayOrder": 1,
        "type": "SINGLE_CHOICE",
        "content": "도심 차량 운행 제한 정책에 찬성하십니까?",
        "description": "정책 시행 시 평일 혼잡 시간대에 일부 차량의 도심 진입이 제한됩니다.",
        "constraint": {
          "type": "SINGLE_CHOICE",
          "minimumSelections": null,
          "maximumSelections": null,
          "maxLength": null,
          "minimumValue": null,
          "maximumValue": null,
          "decimalAllowed": null,
          "scaleMinimum": null,
          "scaleMaximum": null,
          "minimumLabel": null,
          "maximumLabel": null
        },
        "options": [
          {
            "optionId": "14958a2d-d165-4cf6-9609-e16ec4cc9343",
            "displayOrder": 1,
            "kind": "STANDARD",
            "content": "찬성"
          },
          {
            "optionId": "885122e1-c535-46a6-8a20-acfb584f71cb",
            "displayOrder": 2,
            "kind": "STANDARD",
            "content": "반대"
          }
        ]
      }
    ]
  }
}
```

### 3.2 최상위 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---:|---|
| `schemaVersion` | integer | O | 신규 요청은 `3` |
| `requestId` | UUID | O | Resource Server의 `predictionId`와 동일한 멱등성 키 |
| `personaId` | string | O | Persona Runtime이 발급한 외부 Persona 식별자 |
| `candidatePolicyVersion` | string | O | 예상 이유 생성 정책 버전 |
| `contentFingerprint` | string | O | 성공한 Task Preparation의 콘텐츠 fingerprint |
| `minimumReasonsPerOption` | integer | O | 현재 `2` |
| `maximumReasonsPerOption` | integer | O | 현재 `5` |
| `task` | object | O | 생성 시점의 불변 Task 콘텐츠 스냅샷 |

`requestId`는 같은 논리 Prediction의 모든 재시도에서 변경하지 않는다.
Runtime은 `taskId + contentFingerprint`가 최신 `READY` Preparation과 일치하는지
검증한다. 일치하지 않으면 Prediction을 생성하지 않는다.

### 3.3 `task` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---:|---|
| `taskId` | UUID | O | Resource Server의 Task 식별자 |
| `title` | string | O | Task 제목, trim 후 1~200자 |
| `description` | string 또는 null | O | Task 배경 설명, 값이 있으면 trim 후 1~2,000자 |
| `questions` | array | O | 현재 게시 가능한 Task는 정확히 한 문항 |

Task 운영 상태, 공개·종료 시각과 생성·수정 시각은 AI 입력 콘텐츠가 아니므로
전달하지 않는다.

### 3.4 `questions[]` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---:|---|
| `questionId` | UUID | O | 질문 식별자 |
| `displayOrder` | integer | O | 현재 `1` |
| `type` | string | O | 현재 반드시 `SINGLE_CHOICE` |
| `content` | string | O | 질문 문구, trim 후 1~500자 |
| `description` | string 또는 null | O | 질문 배경 설명, 값이 있으면 trim 후 1~1,000자 |
| `constraint` | object | O | 질문 타입과 제약조건 |
| `options` | array | O | 선택지, 표시 순서대로 전달 |

현재 Task 정책은 다음을 보장한다.

- 게시된 Task에는 질문이 정확히 한 개 존재한다.
- 질문 타입은 `SINGLE_CHOICE`다.
- 선택지는 최소 2개, 최대 20개다.
- 선택지 `displayOrder`는 `1`부터 연속이다.
- `OTHER` 선택지는 사용하지 않는다.

### 3.5 `constraint` 필드

Task 콘텐츠 계약과 구조를 통일하기 위해 타입별 constraint 객체를 전달한다.
현재 TaskPrediction 대상은 `SINGLE_CHOICE`뿐이므로 `type` 이외의 필드는
`null`이다.

Runtime은 현재 사용하지 않는 nullable 필드가 포함되거나 이후 추가되더라도
요청을 거부하지 않아야 한다.

### 3.6 `options[]` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---:|---|
| `optionId` | UUID | O | 선택지 식별자, 응답에서 그대로 참조 |
| `displayOrder` | integer | O | `1`부터 연속인 표시 순서 |
| `kind` | string | O | 현재 항상 `STANDARD` |
| `content` | string | O | 선택지 문구, trim 후 1~200자 |

AI Runtime은 선택지 내용을 자체 값으로 치환하거나 새로운 선택지를 만들어서는
안 된다. 응답은 반드시 요청에 포함된 `optionId`를 사용한다.

## 4. 성공 응답

### 4.1 전체 예시

```json
{
  "schemaVersion": 3,
  "requestId": "511f4f55-4a42-4de4-841e-c211dde8fd1f",
  "taskId": "82fa8a7a-9e76-4738-a3a8-e4c1c9b9369c",
  "candidates": [
    {
      "candidateId": "a6bc26ae-a785-4e99-898a-a359dcaf9f19",
      "questionId": "4c87f03c-bdcb-40b4-884f-f30e136823c8",
      "candidateOrder": 1,
      "answer": {
        "type": "SINGLE_CHOICE",
        "selection": {
          "optionId": "14958a2d-d165-4cf6-9609-e16ec4cc9343",
          "otherText": null
        }
      },
      "rationale": "대기질 개선과 보행 환경 향상을 중요하게 생각할 가능성이 있습니다."
    },
    {
      "candidateId": "fe9df7c5-d207-48c3-840e-0662044d51bc",
      "questionId": "4c87f03c-bdcb-40b4-884f-f30e136823c8",
      "candidateOrder": 2,
      "answer": {
        "type": "SINGLE_CHOICE",
        "selection": {
          "optionId": "14958a2d-d165-4cf6-9609-e16ec4cc9343",
          "otherText": null
        }
      },
      "rationale": "공공교통 중심의 정책이 장기적으로 사회적 비용을 줄인다고 판단할 수 있습니다."
    },
    {
      "candidateId": "505458f7-854a-44c6-8c2a-11ea62fbbb22",
      "questionId": "4c87f03c-bdcb-40b4-884f-f30e136823c8",
      "candidateOrder": 1,
      "answer": {
        "type": "SINGLE_CHOICE",
        "selection": {
          "optionId": "885122e1-c535-46a6-8a20-acfb584f71cb",
          "otherText": null
        }
      },
      "rationale": "차량 이용 제한이 생업과 이동권에 미치는 영향을 더 크게 고려할 수 있습니다."
    },
    {
      "candidateId": "a2829532-9bed-464f-8f4e-e488943910af",
      "questionId": "4c87f03c-bdcb-40b4-884f-f30e136823c8",
      "candidateOrder": 2,
      "answer": {
        "type": "SINGLE_CHOICE",
        "selection": {
          "optionId": "885122e1-c535-46a6-8a20-acfb584f71cb",
          "otherText": null
        }
      },
      "rationale": "충분한 대체 교통수단이 마련되기 전의 규제 도입은 시기상조라고 판단할 수 있습니다."
    }
  ]
}
```

### 4.2 최상위 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---:|---|
| `schemaVersion` | integer | O | 요청의 `schemaVersion`과 동일 |
| `requestId` | UUID | O | 요청의 `requestId`와 동일 |
| `taskId` | UUID | O | 요청의 `task.taskId`와 동일 |
| `candidates` | array | O | 모든 선택지의 예상 이유 후보 |

### 4.3 `candidates[]` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---:|---|
| `candidateId` | UUID | O | 후보 식별자, 응답 전체에서 유일하고 멱등 재응답에서도 유지 |
| `questionId` | UUID | O | 요청의 단일 `questionId`와 동일 |
| `candidateOrder` | integer | O | 같은 선택지 안에서 `1`부터 연속 |
| `answer` | object | O | 예상한 선택지 |
| `rationale` | string | O | 예상 이유, trim 후 1~500자 |

`answer`는 다음 형태만 허용한다.

```json
{
  "type": "SINGLE_CHOICE",
  "selection": {
    "optionId": "14958a2d-d165-4cf6-9609-e16ec4cc9343",
    "otherText": null
  }
}
```

- `answer.type`은 반드시 `SINGLE_CHOICE`다.
- `selection.optionId`는 요청에 포함된 선택지여야 한다.
- 현재 모든 선택지는 `STANDARD`이므로 `otherText`는 `null` 또는 생략한다.
- `selections`, `text`, `number`, `scale` 같은 다른 답변 타입 필드는 생략하거나
  `null`로 보낼 수 있다.

### 4.4 후보 집합 검증 규칙

Resource Server는 성공 응답을 저장하기 전에 다음을 모두 검증한다.

- 응답 `schemaVersion`, `requestId`, `taskId`가 요청과 일치한다.
- 모든 `candidateId`가 UUID이며 응답 전체에서 유일하다.
- 모든 `questionId`가 요청의 단일 질문과 일치한다.
- 모든 `optionId`가 요청에 포함된 선택지다.
- 요청의 모든 선택지가 응답에 빠짐없이 포함된다.
- 각 선택지에 예상 이유가 최소 2개, 최대 5개 존재한다.
- 선택지별 `candidateOrder`가 `1`부터 이유 개수까지 중복 없이 연속이다.
- 같은 선택지 안에서 동일한 `rationale`을 중복하지 않는다.
- `rationale`은 trim 후 비어 있지 않고 최대 500자다.

선택지별 후보 개수는 서로 달라도 된다. 예를 들어 한 선택지는 2개, 다른 선택지는
3개를 반환할 수 있다. `candidates` 배열의 물리적 순서는 의미가 없으며 Resource
Server가 선택지 표시 순서와 `candidateOrder`를 기준으로 정렬한다.

하나라도 검증에 실패하면 부분 저장하지 않고 Prediction 전체를 실패 처리한다.

## 5. 멱등성 계약

### 5.1 동일 요청 재전달

network 오류, timeout 또는 retryable HTTP 오류가 발생하면 Resource Server는
동일한 `requestId`와 최초의 불변 JSON payload를 다시 전달한다.

Runtime은 같은 `requestId`와 동일 payload를 다시 받으면 다음 중 하나로 응답한다.

- 최초 결과가 있으면 동일한 성공 결과를 `200 OK`로 재전달한다.
- 아직 처리 중이라면 합의된 retryable 응답을 반환한다.

재전달 성공 결과의 `candidateId`, 선택지, 순서와 문구는 최초 결과와 동일해야 한다.

### 5.2 같은 ID의 다른 payload

같은 `requestId`에 최초 요청과 다른 payload가 오면 새 Prediction으로 처리하지
않고 다음과 같이 응답한다.

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "code": "IDEMPOTENCY_CONFLICT",
  "detail": "requestId was already used with different immutable input"
}
```

Resource Server는 이 응답을 재시도하지 않는 영구 실패로 처리한다.

Runtime은 `requestId`와 함께 원본 요청의 canonical hash 또는 동등한 멱등성
판별 정보를 보관하는 것을 권장한다.

## 6. 오류 응답과 재시도

오류 응답 body는 최소한 다음 형식을 사용한다.

```json
{
  "code": "ERROR_CODE",
  "detail": "Human-readable error detail."
}
```

- `code`는 기계 판별용 문자열이다.
- `detail`은 운영자가 원인을 파악할 수 있는 설명이다.
- `detail`에는 인증 token이나 Persona 원문 데이터가 포함되지 않아야 한다.

| HTTP 상태 | 대표 `code` | Resource Server 처리 |
|---|---|---|
| `400 Bad Request` | `INVALID_REQUEST` | 영구 실패 |
| `401 Unauthorized` | `UNAUTHORIZED` | 영구 실패, 인증 설정 점검 |
| `403 Forbidden` | `FORBIDDEN` | 영구 실패, 권한 설정 점검 |
| `408 Request Timeout` | `TIMEOUT` | 동일 요청 재시도 |
| `409 Conflict` | `IDEMPOTENCY_CONFLICT` | 영구 실패 |
| `409 Conflict` | `TASK_CONTENT_MISMATCH` | 최신 준비 콘텐츠와 다르므로 영구 실패 |
| `422 Unprocessable Entity` | `PREDICTION_INPUT_UNSUPPORTED` | 영구 실패 |
| `422 Unprocessable Entity` | `TASK_NOT_PREPARED` | Task Preparation 완료 전이므로 영구 실패 |
| `429 Too Many Requests` | `RATE_LIMITED` | 동일 요청 재시도 |
| `500 Internal Server Error` | `INTERNAL_ERROR` | 동일 요청 재시도 |
| `503 Service Unavailable` | `SERVICE_UNAVAILABLE` | 동일 요청 재시도 |

- `408`, `429`, 모든 `5xx`, network 오류와 호출 timeout은 재시도 대상이다.
- 그 밖의 `4xx`는 재시도하지 않는 영구 실패다.
- 성공 HTTP 상태라도 body가 계약을 만족하지 않으면 영구 실패다.
- 현재 호출자 기본 설정은 최대 2회 시도, 재시도 간격 30초다.
- connect timeout은 5초, 개별 요청 timeout은 60초다.
- 재시도 예정 시각이 Task 종료 시각 이후라면 재시도하지 않고 최종 실패한다.
- 모든 재시도는 동일한 `requestId`와 최초 payload를 사용한다.

## 7. 개인정보와 로그 정책

TaskPrediction 요청에는 다음 정보가 포함된다.

- 외부 `personaId`
- Task 제목과 배경 설명
- 질문과 질문 배경 설명
- 선택지 문구

다음 정보는 전달하지 않는다.

- 내부 `userId`
- `personaGenerationId`
- 이메일과 사용자 표시 이름
- JWT와 사용자 access token
- Survey 원본 응답

운영 정책은 다음과 같다.

- Runtime 로그에는 Authorization header를 남기지 않는다.
- `personaId`는 가명 식별자로 취급하고 접근 권한을 제한한다.
- 요청·응답 전문을 애플리케이션 일반 로그에 남기지 않는다.
- Resource Server는 재시도 재현과 감사 목적으로 최초 요청 JSON과 SHA-256
  fingerprint를 보존한다.
- Resource Server는 시도별 정규화된 성공 응답 또는 오류 응답을 보존한다.
- Resource Server가 보존하는 오류 body는 최대 16,384자로 제한한다.
- Runtime도 멱등성에 필요한 범위를 넘어선 불필요한 개인정보 복제를 피한다.

## 8. Provider 구현 체크리스트

AI Runtime 구현자는 다음 항목을 확인한다.

- [ ] `POST /v1/task-predictions`를 구현한다.
- [ ] `schemaVersion: 3` 요청을 지원한다.
- [ ] `requestId` 기반 멱등성을 구현한다.
- [ ] 같은 `requestId`와 동일 payload에는 동일 결과를 반환한다.
- [ ] 같은 `requestId`와 다른 payload에는 `409 IDEMPOTENCY_CONFLICT`를 반환한다.
- [ ] Persona 생성 API에서 발급한 `personaId`로 Persona를 조회한다.
- [ ] `taskId + contentFingerprint`가 최신 `READY` Preparation과 일치하는지 검증한다.
- [ ] Task 제목·배경, 질문·질문 배경과 모든 선택지를 모델 입력에 포함한다.
- [ ] 요청에 포함되지 않은 선택지를 생성하지 않는다.
- [ ] 모든 선택지에 최소 2개, 최대 5개의 예상 이유를 생성한다.
- [ ] 선택지별 `candidateOrder`를 `1`부터 연속으로 부여한다.
- [ ] `candidateId`를 UUID로 발급하고 멱등 재응답에서 유지한다.
- [ ] `rationale`을 trim 후 1~500자로 반환한다.
- [ ] 성공 시 `200` 또는 `201`과 완전한 후보 집합을 반환한다.
- [ ] 부분 결과를 성공으로 반환하지 않는다.
- [ ] 오류 응답에 안정적인 `code`를 포함한다.
- [ ] Authorization header와 요청·응답 전문을 일반 로그에 기록하지 않는다.
- [ ] 60초 안에 동기 응답할 수 있는지 성능을 확인한다.

## 9. 호출자 운영 설정

Resource Server에서 사용하는 환경 변수는 다음과 같다.

| 환경 변수 | 기본값 | 의미 |
|---|---|---|
| `VOTE_TASK_PREDICTION_ENABLED` | `false` | TaskPrediction 외부 호출 활성화 |
| `VOTE_TASK_PREDICTION_PROVIDER` | `http` | Provider 구현 선택 |
| `VOTE_TASK_PREDICTION_BASE_URL` | 없음 | AI Runtime base URL |
| `VOTE_TASK_PREDICTION_PATH` | `/v1/task-predictions` | 요청 경로 |
| `VOTE_TASK_PREDICTION_AUTH_TOKEN` | 없음 | 서비스 간 Bearer token |
| `VOTE_TASK_PREDICTION_CONNECT_TIMEOUT` | `5s` | 연결 timeout |
| `VOTE_TASK_PREDICTION_REQUEST_TIMEOUT` | `60s` | 요청 timeout |
| `VOTE_TASK_PREDICTION_CANDIDATE_POLICY_VERSION` | `candidate-policy-v1` | 생성 정책 버전 |
| `VOTE_TASK_PREDICTION_MAXIMUM_ATTEMPTS` | `2` | 최초 호출을 포함한 최대 시도 횟수 |
| `VOTE_TASK_PREDICTION_RETRY_DELAY` | `30s` | 재시도 간격 |
| `VOTE_TASK_PREDICTION_DISPATCHER_DELAY` | `5s` | dispatcher polling 간격 |
| `VOTE_TASK_PREDICTION_PROCESSING_LEASE_DURATION` | `90s` | 작업 처리 lease |
| `VOTE_TASK_PREDICTION_LEASE_REAPER_DELAY` | `10s` | 만료 lease 회수 간격 |
| `VOTE_TASK_PREDICTION_BATCH_SIZE` | `10` | 한 번에 claim할 최대 작업 수 |
| `VOTE_TASK_PREDICTION_WORKER_POOL_SIZE` | `4` | worker thread 수 |
| `VOTE_TASK_PREDICTION_WORKER_QUEUE_CAPACITY` | `16` | worker queue 용량 |
| `VOTE_TASK_PREDICTION_WORKER_SHUTDOWN_AWAIT` | `10s` | 종료 시 worker 대기 시간 |

운영 활성화 전에는 최소한 다음 설정이 필요하다.

```text
VOTE_TASK_PREDICTION_ENABLED=true
VOTE_TASK_PREDICTION_PROVIDER=http
VOTE_TASK_PREDICTION_BASE_URL=https://{runtime-host}
VOTE_TASK_PREDICTION_AUTH_TOKEN={service-token}
```

## 10. 최소 호출 예시

```bash
curl -X POST 'https://{runtime-host}/v1/task-predictions' \
  -H 'Authorization: Bearer {service-token}' \
  -H 'Content-Type: application/json; charset=UTF-8' \
  -H 'Accept: application/json' \
  --data-binary '@task-prediction-request.json'
```

Runtime 구현 완료 후에는 다음 시나리오를 Resource Server와 함께 검증한다.

1. 선택지별 이유 2개 성공
2. 선택지별 이유 3~5개 성공
3. 선택지 누락·중복·순서 공백 응답 거부
4. 같은 `requestId`의 동일 요청 재전달
5. 같은 `requestId`의 다른 payload 충돌
6. timeout·429·5xx 재시도
7. Task 종료 시 재시도 중단
