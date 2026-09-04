# Vote Task Frontend 연동 Handoff

## 현재 구현된 사용자 API만 정리

- 기준일: 2026-09-02
- 확인 기준: Task 제출 요청 단순화 구현 및 전체 회귀 테스트 완료본
- Vote API base: `http://localhost:8083`
- 범위: 현재 `vote-resource-server`에 구현된 Task 사용자 API

> Task API와 상태 처리는 구현되어 있어 Frontend 연동을 시작할 수 있다. 다만 로컬 prediction은 실제 AI가 아니라 `fake` provider를 사용한다. 실제 AI provider 연동과 운영 활성화는 아직 완료되지 않았다.

---

# 1. 현재 연동 가능한 API

| 기능 | Method | Endpoint | Scope |
|---|---|---|---|
| 열린 Task 목록 | `GET` | `/api/v1/me/tasks` | `vote:tasks:read` |
| 열린 Task 상세 | `GET` | `/api/v1/me/tasks/{taskId}` | `vote:tasks:read` |
| prediction 상태 조회 | `GET` | `/api/v1/me/tasks/{taskId}/prediction` | `vote:tasks:read` |
| prediction 생성·재사용 | `POST` | `/api/v1/me/tasks/{taskId}/prediction` | `vote:predictions:write` |
| Task 제출 | `POST` | `/api/v1/me/tasks/{taskId}/submission` | `vote:submissions:write` |
| Task 기준 내 제출 조회 | `GET` | `/api/v1/me/submissions?taskId={taskId}` | `vote:submissions:read` |
| Submission ID 기준 내 제출 조회 | `GET` | `/api/v1/me/submissions/{submissionId}` | `vote:submissions:read` |

현재 사용자용 완료 Task 목록과 결과 집계 API는 없다.

- 미구현: `GET /api/v1/me/tasks/completed`
- 미구현: `GET /api/v1/me/tasks/{taskId}/result`

따라서 현재 Frontend 연동 범위는 **열린 Task 조회 → prediction 확인 → Task 제출 → 내 제출 확인**까지다.

---

# 2. 인증과 로컬 호출

인증은 다음 중 하나를 사용한다.

- `Authorization: Bearer <JWT>`
- `civic_ai_access_token` 쿠키

쿠키를 사용하면 모든 요청에 `credentials: "include"`를 넣는다.

```ts
const VOTE_API_BASE = "http://localhost:8083";

const response = await fetch(`${VOTE_API_BASE}/api/v1/me/tasks`, {
  credentials: "include",
});
```

로컬 API는 `127.0.0.1:8083`이 아니라 `localhost:8083`으로 호출한다. 쿠키 hostname을 Frontend의 `localhost`와 맞추기 위해서다.

현재 Backend local CORS에는 `http://localhost:3000`만 등록되어 있다. Frontend를 `http://localhost:3100`에서 실행한다면 다음 중 하나가 필요하다.

- Backend CORS에 `http://localhost:3100` 추가
- Frontend dev server proxy를 사용해 same-origin으로 호출

`3100 → 8083` 직접 credential 호출은 CORS 수정 전에는 동작하지 않는다.

---

# 3. 열린 Task 목록

```http
GET /api/v1/me/tasks
```

현재 열려 있는 Task를 JSON 배열로 반환한다. pagination envelope는 없다.

```json
[
  {
    "taskId": "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7",
    "title": "주말 교통 정책 선호",
    "description": "가장 선호하는 방안을 선택해 주세요.",
    "openedAt": "2026-08-27T00:00:00Z",
    "closesAt": "2026-08-30T00:00:00Z",
    "submission": {
      "submitted": false,
      "submissionId": null,
      "submittedAt": null
    }
  }
]
```

Frontend 처리:

- `submission.submitted=false`: `참여하기`
- `submission.submitted=true`: `참여 완료`
- 사용자가 제출했더라도 Task가 열려 있으면 이 목록에 남을 수 있다.
- 이 API의 `참여 완료`는 Task 마감을 의미하지 않는다.

---

# 4. 열린 Task 상세

```http
GET /api/v1/me/tasks/{taskId}
```

```json
{
  "task": {
    "id": "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7",
    "title": "주말 교통 정책 선호",
    "description": "가장 선호하는 방안을 선택해 주세요.",
    "question": {
      "id": "05ecfe73-6bee-4e98-8d3d-ed49262958ef",
      "content": "어떤 방안을 선택하시겠습니까?",
      "description": null,
      "options": [
        {
          "id": "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
          "displayOrder": 1,
          "content": "대중교통 증편"
        },
        {
          "id": "8de15db2-4093-4386-82a7-c1668f109c2f",
          "displayOrder": 2,
          "content": "혼잡 통행료 도입"
        }
      ]
    },
    "status": "OPEN",
    "schedule": {
      "opensAt": "2026-08-27T00:00:00Z",
      "closesAt": "2026-08-30T00:00:00Z"
    },
    "publishedAt": "2026-08-26T00:00:00Z",
    "openedAt": "2026-08-27T00:00:00Z",
    "closedAt": null,
    "closureType": null,
    "createdAt": "2026-08-25T00:00:00Z",
    "updatedAt": "2026-08-27T00:00:00Z"
  },
  "closesAt": "2026-08-30T00:00:00Z",
  "submission": {
    "submitted": false,
    "submissionId": null,
    "submittedAt": null
  }
}
```

- 선택지는 `displayOrder` 오름차순으로 표시한다.
- 이미 마감된 Task를 조회하면 결과 화면이 아니라 `409 TASK_CLOSED`가 반환될 수 있다.
- 현재는 마감 Task를 사용자에게 다시 조회할 별도 endpoint가 없다.

---

# 5. Prediction 상태 조회

```http
GET /api/v1/me/tasks/{taskId}/prediction
```

```ts
type PredictionView = {
  taskId: string;
  state:
    | "TASK_NOT_FOUND"
    | "TASK_UNPUBLISHED"
    | "TASK_CLOSED"
    | "ALREADY_SUBMITTED"
    | "PERSONA_NOT_READY"
    | "NOT_REQUESTED"
    | "PENDING"
    | "PROCESSING"
    | "REMOTE_PROCESSING"
    | "RETRY_WAIT"
    | "SUCCEEDED"
    | "FAILED";
  personaGenerationId: string | null;
  personaId: string | null;
  predictionId: string | null;
  predictionStatus: "PENDING" | "PROCESSING" | "REMOTE_PROCESSING" | "RETRY_WAIT" | "SUCCEEDED" | "FAILED" | null;
  predictedReasons: Array<{
    id: string;
    optionId: string;
    reasonOrder: number;
    reason: string;
  }>;
  predictionFeatureEnabled: boolean;
  waiting: boolean;
  predictionRequestAllowed: boolean;
  predictionUnavailableReason: string | null;
  submissionAllowed: boolean;
  predictedAnswerAllowed: boolean;
  aiAcceptanceAllowed: boolean;
  directAnswerAllowed: boolean;
  retryable: boolean;
  allowedReasonSources: Array<"AI_ACCEPTED" | "USER_WRITTEN">;
  submissionId: string | null;
  nextRetryAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  runtimeStatus: {
    code: string;
    detail: string;
    retryable: boolean;
    maxWaitMinutes: number;
  } | null;
};
```

Frontend는 enum을 조합해 참여 가능 여부를 추론하지 말고 아래 capability를 그대로 사용한다.

| 필드 | 용도 |
|---|---|
| `predictionRequestAllowed` | prediction POST 가능 여부 |
| `waiting` | polling 계속 여부 |
| `submissionAllowed` | 제출 자체의 가능 여부 |
| `aiAcceptanceAllowed` | 예상 이유 채택 가능 여부 |
| `directAnswerAllowed` | 직접 작성 가능 여부 |
| `allowedReasonSources` | 허용된 제출 방식 |
| `retryable` | prediction 실패 후 재요청 가능 여부 |

`REMOTE_PROCESSING`은 개인별 AI 예상 이유가 아직 생성 중인 상태다. 이때 모든 제출 관련 capability는
`false`이고, `runtimeStatus.detail`은 서버에서 전달받은 문구를 그대로 사용자에게 표시할 수 있다.
`runtimeStatus.maxWaitMinutes`는 예상 대기시간 안내값이며 polling deadline이 아니다.

`FAILED`이면서 `runtimeStatus.code === "PREDICTION_UNAVAILABLE"`이면 현재 생성할 수 없는 최종 상태다.
`runtimeStatus.detail`을 표시하고 자동 또는 수동 재시도 버튼을 제공하지 않는다.

`PERSONA_NOT_READY`이면 Task prediction과 제출에 필요한 Persona가 아직 준비되지 않은 상태다.

---

# 6. Prediction 생성 또는 재사용

```http
POST /api/v1/me/tasks/{taskId}/prediction
```

`GET /prediction` 응답의 `predictionRequestAllowed=true`일 때 호출한다.

- 새 prediction 생성: `201 Created`, `created=true`
- 기존 prediction 재사용: `200 OK`, `created=false`

```ts
type EnsurePredictionResponse = {
  taskId: string;
  predictionId: string;
  personaGenerationId: string;
  personaId: string;
  status: "PENDING" | "PROCESSING" | "REMOTE_PROCESSING" | "RETRY_WAIT" | "SUCCEEDED" | "FAILED";
  created: boolean;
  waiting: boolean;
  predictedAnswerAllowed: boolean;
  directAnswerAllowed: boolean;
  predictedReasons: Array<{
    id: string;
    optionId: string;
    reasonOrder: number;
    reason: string;
  }>;
  nextRetryAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  runtimeStatus: {
    code: string;
    detail: string;
    retryable: boolean;
    maxWaitMinutes: number;
  } | null;
};
```

권장 호출 순서:

1. 상세 화면에서 `GET /prediction`
2. `predictionRequestAllowed=true`이면 `POST /prediction` 한 번
3. POST 성공 후 `GET /prediction` 재조회
4. `waiting=true`인 동안만 polling

`REMOTE_PROCESSING`의 재확인은 사용자 요청에 의해 수행한다. 기존 GET polling이 재확인 가능 시점에
도달하면 Backend가 동일 prediction 요청을 비동기로 다시 큐에 넣으므로 새 endpoint를 호출할 필요가 없다.

권장 polling 간격은 `1초 → 2초 → 5초`이며 이후 5초를 유지한다. 페이지 이탈, component unmount, hidden tab에서는 polling을 멈춘다.

## 실제 AI 연동 상태

- 로컬 기본 설정은 `provider=fake`다.
- fake provider가 예상 선택지와 이유를 반환하므로 Frontend UI와 상태 흐름은 연동할 수 있다.
- 외부 AI 서비스용 HTTP adapter는 있지만 실제 provider 연결·검수는 완료되지 않았다.
- 운영 설정은 prediction이 기본적으로 `enabled=false`다.

현재 완료 가능한 것은 **fake prediction 기반 Frontend 연동**이다. 실제 AI 품질이나 provider 장애까지 포함한 E2E로 간주하면 안 된다.

---

# 7. Task 제출

```http
POST /api/v1/me/tasks/{taskId}/submission
Content-Type: application/json
Idempotency-Key: <canonical UUID>
```

## 7.1 AI 예상 이유 채택

```json
{
  "selectedOptionId": "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
  "reasonSource": "AI_ACCEPTED",
  "predictedReasonId": "7ae32cd0-68d8-458c-afbd-d8c657697479"
}
```

호출 조건:

- `submissionAllowed=true`
- `aiAcceptanceAllowed=true`
- `allowedReasonSources`에 `AI_ACCEPTED` 포함

`predictedReasonId`는 현재 Prediction View의 `predictedReasons[]`에서 선택한 값이다.
해당 이유의 `optionId`는 `selectedOptionId`와 같아야 한다. `reason`은 보내지 않는다.

## 7.2 직접 작성

```json
{
  "selectedOptionId": "8de15db2-4093-4386-82a7-c1668f109c2f",
  "reasonSource": "USER_WRITTEN",
  "reason": "혼잡 시간대 수요를 줄이는 데 더 직접적이라고 생각합니다."
}
```

호출 조건:

- `submissionAllowed=true`
- `directAnswerAllowed=true`
- `allowedReasonSources`에 `USER_WRITTEN` 포함

직접 작성 이유는 trim 후 1~500자다. `predictedReasonId`는 보내지 않는다.
현재 Prediction이 `SUCCEEDED`이고 `directAnswerAllowed=true`일 때만 직접
제출할 수 있다.

## 7.3 서버가 결정하는 식별자

Frontend는 아래 식별자를 제출 요청에 보내지 않는다.

- `userId`: 검증된 JWT `sub`에서 결정
- `personaGenerationId`: 제출 시점의 현재 사용 가능한 Persona에서 결정
- `predictionId`: 현재 `(userId, taskId, personaGenerationId)` Prediction에서 결정
- `questionId`: Task에 저장된 단일 Question에서 결정

`USER_WRITTEN` 제출 시 Backend가 현재 `SUCCEEDED` Prediction의
`predictionId`를 provenance로 자동 연결한다. Prediction이 없거나
`PENDING`, `PROCESSING`, `RETRY_WAIT`, `FAILED`이면 제출을 `409`로 거절한다.

`AI_ACCEPTED`는 제출 시점에도 현재 Prediction이 `SUCCEEDED`인지 다시 검증한다.
화면에 이유가 보였더라도 Persona 전환이나 Prediction 상태 변경으로 조건이 달라지면 `409`로
거절될 수 있다.

## 7.4 성공 응답

```json
{
  "code": "TASK_SUBMISSION_CREATED",
  "replayed": false,
  "taskId": "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7",
  "submissionId": "0dac284a-bf3f-46c0-89b6-f4a318b488be",
  "submittedAt": "2026-08-27T04:00:00Z"
}
```

성공 status는 `201 Created`다.

- 논리적 제출마다 UUID `Idempotency-Key`를 한 번 생성한다.
- 네트워크 오류 후 같은 body를 재전송할 때 같은 key를 재사용한다.
- 같은 key로 body를 변경하지 않는다.
- `replayed=true`는 정상 성공이다.
- 상태 변경으로 `409` 거절을 받은 뒤 새 상태로 다시 제출할 때는 새 `Idempotency-Key`를 생성한다.

---

# 8. 자신의 제출 조회

```http
GET /api/v1/me/submissions?taskId={taskId}
GET /api/v1/me/submissions/{submissionId}
```

두 endpoint는 같은 response shape을 반환한다.

```ts
type MySubmission = {
  submissionId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  personaGenerationId: string;
  predictionId: string | null;
  submittedAt: string;
  questionId: string;
  question: {
    id: string;
    content: string;
    description: string | null;
    options: Array<{
      id: string;
      displayOrder: number;
      content: string;
    }>;
  };
  selectedOptionId: string;
  reasonSource: "AI_ACCEPTED" | "USER_WRITTEN";
  acceptedPredictedReasonId: string | null;
  finalReason: string;
};
```

제출 응답을 잃어버렸거나 `TASK_ALREADY_SUBMITTED`를 받으면 Task ID 기준 조회로 복구한다.

---

# 9. 주요 오류

오류는 `application/problem+json`이며 Frontend는 `status`와 `code`로 분기한다.

| HTTP | `code` | Frontend 처리 |
|---|---|---|
| `401` | `UNAUTHENTICATED` | 로그인 또는 인증 갱신 |
| `403` | `ACCESS_DENIED` | JWT scope 확인, 자동 재시도 금지 |
| `400` | `INVALID_REQUEST` | 요청 입력 확인 |
| `400` | `INVALID_IDEMPOTENCY_KEY` | client bug 처리 |
| `404` | `TASK_NOT_FOUND` | 목록으로 이동 |
| `404` | `TASK_SUBMISSION_NOT_FOUND` | 제출 정보 없음 표시 |
| `409` | `TASK_SUBMISSION_TASK_UNAVAILABLE` | 목록과 상세 갱신 |
| `409` | `TASK_SUBMISSION_TASK_UNPUBLISHED` | 아직 참여할 수 없음 |
| `409` | `TASK_SUBMISSION_TASK_CLOSED` | 목록과 상세 갱신 |
| `409` | `TASK_CURRENT_PERSONA_NOT_READY` | Persona 준비 필요 상태 표시 |
| `409` | `TASK_ALREADY_SUBMITTED` | 내 제출 조회로 복구 |
| `409` | `TASK_SUBMISSION_PREDICTION_UNAVAILABLE` | prediction view 재조회 |
| `409` | `TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE` | prediction view 재조회 후 AI 선택 초기화 |
| `409` | `TASK_PREDICTION_DISABLED` | 직접 작성 capability 재확인 |
| `409` | `IDEMPOTENCY_CONFLICT` | client bug 처리 |
| `422` | `TASK_SUBMISSION_VALIDATION_FAILED` | 선택·이유 검증 오류 표시 |
| `422` | `TASK_SUBMISSION_OPTION_MISMATCH` | Task 상세 재조회 후 선택 초기화 |
| `422` | `TASK_SUBMISSION_REASON_OPTION_MISMATCH` | prediction view 재조회 후 AI 선택 초기화 |

---

# 10. Frontend 구현 순서

```text
1. GET /me/tasks
2. GET /me/tasks/{taskId}
3. GET /me/tasks/{taskId}/prediction
4. predictionRequestAllowed=true이면 POST /prediction
5. waiting=true이면 GET /prediction polling
6. submissionAllowed=true이면 AI_ACCEPTED 또는 USER_WRITTEN으로 POST /submission
7. GET /me/submissions?taskId=...로 제출 확인
```

현재 API로 가능한 범위:

- 열린 Task 목록과 상세
- Persona 미준비 상태 표시
- fake prediction 로딩·성공·실패·재시도 UI
- AI 예상 이유 선택 UI
- 직접 작성 UI
- Task 제출
- 자신의 제출 확인

현재 API로 불가능한 범위:

- 실제 AI provider 기반 prediction E2E
- 마감 Task 목록
- 사용자용 선택지별 결과 집계 화면
- 미참여/참여 여부에 따른 마감 결과 접근 제어
- CORS 수정 전 `localhost:3100`에서 Backend로 직접 보내는 credential 요청
