# Vote Survey + Task Frontend 연동 Handoff

## Backend APPROVED — Survey 사용자 플로우 + Task 참여 플로우

- 기준일: 2026-09-02
- Backend 기준: `vote-resource-server`
- 기준 구현: Task 제출 요청 단순화 및 PersonaGeneration 모델 반영본
- API prefix: `/api/v1`
- 로컬 API 기본 주소: `http://127.0.0.1:8083`
- Frontend 디자인 기준: 별도 Figma
- 이 문서의 책임: API 계약, 호출 순서, 상태 전이, 오류·재시도·멱등성 처리
- 이 문서가 책임지지 않는 것: 화면 레이아웃, 카피, 시각 디자인

---

# 1. 구현 분리 결정

하나의 handoff 문서를 기준으로 사용하되 Frontend 구현과 검수는 두 번으로 나눈다.

| 단계 | 범위 | 완료 후 보장 |
|---|---|---|
| 1차 | Survey 전체 사용자 플로우 | 현재 Survey 조회, 동적 문항 입력, 최종 제출, 제출 결과·이력 조회 |
| 2차 | Task 참여 플로우 | 열린 Task 조회, prediction 상태 처리, AI 이유 채택 또는 직접 작성, 최종 제출·내 제출 조회 |

공통 인증·오류·멱등성 client는 1차에서 만든 뒤 2차에서 재사용한다.

Task의 읽기 UI는 Survey와 병렬 개발할 수 있다. 다만 실제 prediction·제출 E2E는 Survey 제출 뒤
Persona backend 파이프라인이 완료되어야 하므로 2차 검수는 1차 검수 이후 진행한다.

---

# 2. 이번 연동 범위

## 2.1 포함

- 인증된 사용자의 현재 Survey 조회
- Survey 문항 유형별 입력과 최종 제출
- 자신의 최신·과거 Survey 응답 조회
- Survey 완료 여부와 service eligibility 반영
- 열린 Task 목록과 상세 조회
- 현재 Task prediction 상태 조회
- Task prediction 생성과 비동기 완료 대기
- AI 예상 이유 채택 또는 사용자 직접 이유 작성
- Task 최종 제출
- 자신의 Task 제출 조회

## 2.2 제외

- Survey·Task 관리자 화면과 관리자 API
- Persona 전용 화면과 `/api/v1/me/persona-status` 직접 연동
- OpinionMap 화면과 API
- 사용자용 마감 결과 화면
- 관리자용 Task result summary/result view
- Task 생성·예약·공개·마감 UI
- 운영 CORS 또는 운영 AI Provider 설정
- Figma 해석과 페이지 디자인

Persona 화면은 제외하지만 Persona backend 처리는 Task의 선행 조건이다. Frontend는 이 선행 조건을
`GET /api/v1/me/tasks/{taskId}/prediction`의 상태와 capability boolean으로만 처리한다.

---

# 3. 공통 HTTP 계약

## 3.1 인증

인증 토큰은 아래 둘 중 하나로 전달한다.

1. `Authorization: Bearer <JWT>`
2. `civic_ai_access_token` 쿠키

쿠키 인증을 사용하면 모든 요청에 `credentials: "include"`를 지정한다.

```ts
const response = await fetch(`${VOTE_API_BASE}/api/v1/me/surveys/current`, {
  credentials: "include",
});
```

동일 요청에 header와 cookie가 모두 있고 서로 다른 토큰이면 `401 UNAUTHENTICATED`로 취급한다.

로컬 CORS는 현재 `http://localhost:3000`만 허용한다. 다른 개발 origin을 사용하면 Frontend dev proxy를
사용하거나 Backend CORS 설정을 먼저 조정한다.

## 3.2 필요한 사용자 scope

| 기능 | Scope |
|---|---|
| Survey 조회·응답 조회·Eligibility | `vote:surveys:read` |
| Survey 최종 제출 | `vote:survey-responses:write` |
| Task 목록·상세·prediction 조회 | `vote:tasks:read` |
| Task prediction 생성 | `vote:predictions:write` |
| Task 최종 제출 | `vote:submissions:write` |
| 자신의 Task 제출 조회 | `vote:submissions:read` |

Persona UI를 만들지 않으므로 `vote:personas:read`는 이번 Frontend 호출에 필요하지 않다.

## 3.3 인증 오류

| HTTP | `code` | Frontend 처리 |
|---|---|---|
| `401` | `UNAUTHENTICATED` | 인증 갱신 또는 로그인 진입 |
| `403` | `ACCESS_DENIED` | 로그인 여부와 scope 발급 상태 확인. 자동 재시도 금지 |

## 3.4 Problem Detail

오류 응답은 `application/problem+json`이다.

```ts
type ApiViolation = {
  code: string;
  path: string;
  message: string;
  details?: Record<string, unknown>;
};

type ApiProblem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  replayed: boolean;
  retryable: boolean;
  traceId?: string;
  violations?: ApiViolation[];
};
```

Frontend 분기는 `detail` 문자열이 아니라 `status`와 `code`를 기준으로 한다. `detail`, `title`은
개발 로그와 fallback 표시용이며 제품 카피의 고정 계약이 아니다.

## 3.5 Idempotency-Key

아래 두 command에 canonical UUID 형식의 `Idempotency-Key` header가 필수다.

- `POST /api/v1/me/survey-responses`
- `POST /api/v1/me/tasks/{taskId}/submission`

규칙은 다음과 같다.

- 사용자가 제출 버튼을 눌러 하나의 논리적 제출을 시작할 때 UUID를 한 번 생성한다.
- timeout, connection reset, 응답 유실로 같은 body를 재전송할 때 같은 key를 재사용한다.
- 같은 key로 body를 변경하지 않는다.
- 명시적으로 새로운 논리적 command를 시작할 때만 새 key를 만든다.
- 성공 응답의 `replayed=true`는 정상 성공이다.
- `400 INVALID_IDEMPOTENCY_KEY`는 client bug로 처리한다.
- `409 IDEMPOTENCY_CONFLICT`는 동일 key가 다른 body에 사용된 client bug로 처리한다.

브라우저 새로고침 뒤에도 전송 결과가 불명확한 command를 복구해야 한다면 key와 request body를 함께
session storage 등에 보존한다. key만 보존하고 body를 재생성하면 안 된다.

## 3.6 데이터 형식

- 모든 ID는 UUID 문자열이다.
- 모든 시간은 ISO-8601 timestamp 문자열이다.
- nullable 필드는 `null`일 수 있다.
- 현재 목록 API는 pagination envelope 없이 JSON 배열을 반환한다.
- 알 수 없는 enum 값은 crash하지 말고 안전한 fallback 상태로 처리한다.

---

# 4. 권장 API client 경계

디자인 컴포넌트가 raw `fetch`와 Backend DTO에 직접 의존하지 않도록 아래 수준의 client 함수를 둔다.

```ts
// Survey
getCurrentSurvey()
submitSurveyResponse(command, idempotencyKey)
getLatestSurveyResponse()
getSurveyResponseHistory()
getSurveyResponse(responseId)
getServiceEligibility()

// Task
getOpenTasks()
getOpenTask(taskId)
getTaskPrediction(taskId)
ensureTaskPrediction(taskId)
submitTask(taskId, command, idempotencyKey)
getTaskSubmissionByTask(taskId)
getTaskSubmission(submissionId)
```

모든 함수는 성공 DTO와 `ApiProblem`을 구분해서 반환하거나 공통 typed error를 throw해야 한다.

---

# 5. 1차 작업 — Survey 사용자 플로우

## 5.1 Endpoint 목록

| Method | Path | 용도 | Scope |
|---|---|---|---|
| `GET` | `/api/v1/me/surveys/current` | 현재 활성 회차, 내용, 제출 여부, eligibility | `vote:surveys:read` |
| `POST` | `/api/v1/me/survey-responses` | 현재 Survey 최종 제출 | `vote:survey-responses:write` |
| `GET` | `/api/v1/me/survey-responses/latest` | 자신의 가장 최근 응답 상세 | `vote:surveys:read` |
| `GET` | `/api/v1/me/survey-responses` | 자신의 응답 이력 최신순 | `vote:surveys:read` |
| `GET` | `/api/v1/me/survey-responses/{responseId}` | 자신의 특정 응답 상세 | `vote:surveys:read` |
| `GET` | `/api/v1/me/service-eligibility` | 현재 서비스 eligibility | `vote:surveys:read` |

## 5.2 현재 Survey 조회

`GET /api/v1/me/surveys/current`

```ts
type SurveyQuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "SCALE";

type SurveyOptionKind = "STANDARD" | "OTHER";

type SurveyRule = {
  minimumSelections: number | null;
  maximumSelections: number | null;
  maxLength: number | null;
  minimum: number | null;
  maximum: number | null;
  decimalAllowed: boolean | null;
  decimalScale: number | null;
  minimumLabel: string | null;
  maximumLabel: string | null;
};

type SurveyOption = {
  id: string;
  lineageKey: string;
  kind: SurveyOptionKind;
  label: string;
  displayOrder: number;
};

type SurveyQuestion = {
  id: string;
  lineageKey: string;
  type: SurveyQuestionType;
  prompt: string;
  description: string | null;
  displayOrder: number;
  required: boolean;
  rule: SurveyRule;
  allowOther: boolean;
  options: SurveyOption[];
};

type CurrentSurveyResponse = {
  round: {
    id: string;
    roundNumber: number;
    contentVersionId: string;
    enforcementMode: string;
    activatedAt: string;
  };
  content: {
    id: string;
    versionNumber: number;
    name: string;
    description: string | null;
    questions: SurveyQuestion[];
  };
  submitted: boolean;
  eligibility: EligibilityResponse;
};

type EligibilityResponse = {
  eligible: boolean;
  surveyRequirement: string;
  reason: string | null;
  nextAction: string | null;
  activeRoundId: string | null;
  evaluatedAt: string;
  capabilities: string[];
};
```

Frontend는 `questions`와 `options`를 `displayOrder` 기준으로 표시한다. 문항을 Frontend 코드에
하드코딩하지 않는다.

`submitted=true`이면 같은 회차 입력 폼을 다시 제출할 수 없으므로 완료 화면 또는 최근 응답 화면으로
전환한다.

활성 회차가 정확히 하나가 아니면 `503 SURVEY_ACTIVE_ROUND_UNAVAILABLE`이다. 이 오류는 사용자가
Survey를 완료하지 않은 정상 상태가 아니라 Backend 운영 오류다.

## 5.3 문항별 제출 payload

공통 command:

```ts
type SubmitSurveyResponseRequest = {
  roundId: string;
  // 선택 문항(required=false)에 하나 이상 답했을 때만 포함
  consentReceiptId?: string;
  answers: SurveyAnswerRequest[];
};
```

각 answer는 현재 Survey 응답에 받은 `question.id`를 그대로 사용한다.
`required=false`인 선택 문항에 답하지 않으면 answer를 생략한다. 선택 문항은
민감정보 동의 대상이므로, 하나라도 답했을 때만 운영 서버 동의 receipt를 함께
보낸다.

### SINGLE_CHOICE

```json
{
  "questionId": "<question-id>",
  "type": "SINGLE_CHOICE",
  "selection": {
    "optionId": "<option-id>",
    "inputText": null
  }
}
```

`kind=OTHER` 선택지는 사용자가 입력한 내용을 `inputText`에 넣는다. 표준 선택지는 `inputText`를
`null` 또는 생략한다.

### MULTIPLE_CHOICE

```json
{
  "questionId": "<question-id>",
  "type": "MULTIPLE_CHOICE",
  "selections": [
    { "optionId": "<option-id-1>", "inputText": null },
    { "optionId": "<other-option-id>", "inputText": "직접 입력" }
  ]
}
```

### SHORT_TEXT / LONG_TEXT

```json
{
  "questionId": "<question-id>",
  "type": "SHORT_TEXT",
  "text": "사용자 입력"
}
```

`LONG_TEXT`는 `type`만 변경한다. `rule.maxLength`를 client validation에 사용하되 Backend validation을
최종 기준으로 둔다.

### NUMBER

```json
{
  "questionId": "<question-id>",
  "type": "NUMBER",
  "number": 12.5
}
```

`rule.minimum`, `maximum`, `decimalAllowed`, `decimalScale`을 적용한다.

### SCALE

```json
{
  "questionId": "<question-id>",
  "type": "SCALE",
  "scale": 4
}
```

`rule.minimum`, `maximum`, `minimumLabel`, `maximumLabel`을 표시와 validation에 사용한다.

## 5.4 Survey 최종 제출

`POST /api/v1/me/survey-responses`

Headers:

```http
Content-Type: application/json
Idempotency-Key: <canonical-uuid>
```

성공은 `201 Created`다. 동일 command replay도 `201`이며 `replayed=true`다.

```ts
type SurveySubmissionResponse = {
  code: "SURVEY_RESPONSE_SUBMITTED";
  replayed: boolean;
  responseId: string;
  roundId: string;
  contentVersionId: string;
  submittedAt: string;
};
```

성공 직후 아래 cache를 무효화하거나 다시 조회한다.

- current Survey
- service eligibility
- latest Survey response
- Survey response history

Survey 성공 직후 Persona가 동기적으로 준비된다고 가정하지 않는다. Task 단계가 Persona 준비 상태를
자체 endpoint에서 확인한다.

## 5.5 Survey 응답 조회

### 최신 응답

`GET /api/v1/me/survey-responses/latest`

응답이 없으면 `404 SURVEY_RESPONSE_NOT_FOUND`다.

### 이력

`GET /api/v1/me/survey-responses`

```ts
type SurveyResponseSummary = {
  id: string;
  roundId: string;
  roundNumber: number;
  contentVersionId: string;
  submittedAt: string;
};
```

최신순 배열이며 pagination은 없다.

### 상세

`GET /api/v1/me/survey-responses/{responseId}`

자신의 응답만 조회할 수 있다. 다른 사용자의 ID도 `404 SURVEY_RESPONSE_NOT_FOUND`로 숨긴다.
상세에는 당시 `content` snapshot과 `answers`가 함께 포함된다. 과거 응답 화면은 현재 Survey 문항이
아니라 상세 응답에 포함된 `content`를 사용한다.

## 5.6 Survey 오류 처리

| HTTP | `code` | 의미 | Frontend 처리 |
|---|---|---|---|
| `400` | `INVALID_REQUEST` | JSON, UUID, DTO 형식 오류 | client validation/contract bug 확인 |
| `400` | `INVALID_IDEMPOTENCY_KEY` | key가 canonical UUID가 아님 | 새 UI 재시도가 아니라 client bug |
| `404` | `SURVEY_RESPONSE_NOT_FOUND` | 자신의 응답 없음 | empty/not-found 화면 |
| `409` | `IDEMPOTENCY_CONFLICT` | 같은 key에 다른 body 사용 | 전송 상태 복구 후 개발 로그 |
| `409` | `CURRENT_SURVEY_ALREADY_SUBMITTED` | 이미 최종 제출됨 | current/latest 재조회 후 완료 처리 |
| `409` | `SURVEY_SUBMISSION_ROUND_CHANGED` | 화면을 연 뒤 활성 회차 변경 | draft 폐기 확인 후 current 재조회 |
| `409` | `SURVEY_RESPONSE_CONTENT_UNAVAILABLE` | 과거 응답 content 불일치 | 일반 오류 + trace/log |
| `422` | `SURVEY_RESPONSE_VALIDATION_FAILED` | 문항 규칙 위반 | `violations[].path` 기준 field 오류 표시. `path=consentReceiptId`이면 동의 처리 오류 |
| `503` | `SURVEY_ACTIVE_ROUND_UNAVAILABLE` | 활성 회차 운영 불변식 오류 | 사용자 미완료로 처리하지 말고 재시도 가능한 장애 화면 |

## 5.7 Survey 호출 상태 전이

```text
ENTER
  -> GET current
     -> 200, submitted=false: FORM
     -> 200, submitted=true: COMPLETED
     -> 503: OPERATIONAL_UNAVAILABLE

FORM
  -> POST response
     -> 201: COMPLETED + related queries refresh
     -> 422: FORM_WITH_VIOLATIONS
     -> 409 ALREADY_SUBMITTED: refresh -> COMPLETED
     -> 409 ROUND_CHANGED: refresh current
     -> network unknown: same key + same body로 재시도
```

## 5.8 1차 완료 조건

- 모든 문항 유형이 Backend content 기반으로 렌더링된다.
- OTHER 입력과 각 rule validation이 동작한다.
- 제출 중 버튼 중복 클릭이 하나의 idempotency key로 합쳐진다.
- 응답 유실 뒤 같은 key·body로 재시도할 수 있다.
- `replayed=true`를 정상 성공으로 처리한다.
- `422 violations`가 문항별 오류로 연결된다.
- `submitted=true`, 이미 제출 `409`, 활성 회차 `503`이 서로 다른 화면 상태다.
- 성공 뒤 current/eligibility/history가 갱신된다.
- 과거 상세는 응답에 포함된 content snapshot으로 표시한다.

---

# 6. 2차 작업 — Task 참여 플로우

## 6.1 Endpoint 목록

| Method | Path | 용도 | Scope |
|---|---|---|---|
| `GET` | `/api/v1/me/tasks` | 열린 Task 목록 | `vote:tasks:read` |
| `GET` | `/api/v1/me/tasks/{taskId}` | 열린 Task 상세 | `vote:tasks:read` |
| `GET` | `/api/v1/me/tasks/{taskId}/prediction` | Persona·prediction·제출 가능 상태의 canonical 조회 | `vote:tasks:read` |
| `POST` | `/api/v1/me/tasks/{taskId}/prediction` | prediction 최초 생성 | `vote:predictions:write` |
| `POST` | `/api/v1/me/tasks/{taskId}/submission` | Task 최종 제출 | `vote:submissions:write` |
| `GET` | `/api/v1/me/submissions?taskId={taskId}` | Task 기준 자신의 제출 조회 | `vote:submissions:read` |
| `GET` | `/api/v1/me/submissions/{submissionId}` | ID 기준 자신의 제출 조회 | `vote:submissions:read` |

## 6.2 열린 Task 목록과 상세

`GET /api/v1/me/tasks`

```ts
type UserTaskSummary = {
  taskId: string;
  title: string;
  description: string | null;
  openedAt: string;
  closesAt: string;
  submission: {
    submitted: boolean;
    submissionId: string | null;
    submittedAt: string | null;
  };
};
```

열린 Task만 배열로 반환하며 pagination은 없다.

`GET /api/v1/me/tasks/{taskId}`

```ts
type UserTaskDetail = {
  task: {
    id: string;
    title: string;
    description: string | null;
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
    status: string;
    schedule: { opensAt: string; closesAt: string } | null;
    publishedAt: string | null;
    openedAt: string | null;
    closedAt: string | null;
    closureType: string | null;
    createdAt: string;
    updatedAt: string;
  };
  closesAt: string;
  submission: {
    submitted: boolean;
    submissionId: string | null;
    submittedAt: string | null;
  };
};
```

현재 참여 Task는 질문이 정확히 하나이고 표준 선택지가 두 개 이상인 단일 선택 투표다. OTHER 선택지는
없다. `options`는 `displayOrder` 기준으로 표시한다.

`submission.submitted=true`이면 새 제출 폼을 열지 않고 기존 제출 조회로 이동한다.

## 6.3 PredictionView를 canonical UI 상태로 사용

Task 상세 진입 후 반드시 아래 endpoint를 조회한다.

`GET /api/v1/me/tasks/{taskId}/prediction`

```ts
type TaskPredictionViewState =
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

type TaskReasonSource = "AI_ACCEPTED" | "USER_WRITTEN";

type TaskPredictionView = {
  taskId: string;
  state: TaskPredictionViewState;
  personaGenerationId: string | null;
  personaId: string | null;
  predictionId: string | null;
  predictionStatus: string | null;
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
  allowedReasonSources: TaskReasonSource[];
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

UI 활성화 여부는 enum을 추론해서 계산하지 말고 Backend boolean을 그대로 사용한다.

| UI 동작 | Backend 기준 |
|---|---|
| prediction 생성 버튼 | `predictionRequestAllowed === true` |
| prediction 로딩·폴링 | `waiting === true` |
| AI 이유 선택 | `aiAcceptanceAllowed === true` 및 `allowedReasonSources`에 `AI_ACCEPTED` 포함 |
| 직접 이유 작성 | `directAnswerAllowed === true` 및 `allowedReasonSources`에 `USER_WRITTEN` 포함 |
| 최종 제출 버튼 | `submissionAllowed === true` |
| 자동 재시도 대기 표시 | `retryable === true`, `nextRetryAt` 사용 |

## 6.4 상태별 호출 규칙

| `state` | 의미 | Frontend 행동 |
|---|---|---|
| `TASK_NOT_FOUND` | Task 없음 | not-found 종료 |
| `TASK_UNPUBLISHED` | 아직 공개 전 | 참여 불가 종료 |
| `TASK_CLOSED` | 마감됨 | 제출 중단. 사용자 결과 화면은 이번 범위 밖 |
| `ALREADY_SUBMITTED` | 이미 제출됨 | `submissionId`로 내 제출 조회 |
| `PERSONA_NOT_READY` | Survey 기반 Persona 생성 대기 | prediction POST 금지. page visible 동안 bounded polling |
| `NOT_REQUESTED` | Persona 준비, prediction 미생성 | boolean에 따라 prediction 생성. 제출 불가 |
| `PENDING` | prediction 대기열 | polling. 제출 불가 |
| `PROCESSING` | prediction 처리 중 | polling. 제출 불가 |
| `REMOTE_PROCESSING` | 개인별 예상 이유 생성 중 | `runtimeStatus.detail`과 예상 대기시간 표시. polling 유지. 제출 불가 |
| `RETRY_WAIT` | Backend 자동 재시도 대기 | `nextRetryAt`까지 polling 간격 조정. POST 반복 호출 금지 |
| `SUCCEEDED` | 예상 이유 준비 완료 | 선택지별 예상 이유 또는 직접 작성 제공 |
| `FAILED` | prediction 최종 실패 | 제출 불가 및 실패 안내 |

권장 polling은 화면이 visible할 때만 `1s -> 2s -> 5s`의 bounded backoff를 사용하고
`waiting=false`, `ALREADY_SUBMITTED`, Task 종료 상태 또는 route 이탈 시 중단한다. 이 polling 간격은
Frontend 정책이며 Backend 계약값은 아니다.

`REMOTE_PROCESSING` 조회가 재확인 가능 시점에 도달하면 Backend가 동일 prediction을 비동기로 다시 큐에
넣는다. Frontend는 별도 Runtime API나 추가 command를 호출하지 않는다. `runtimeStatus.detail`은 전달된
사용자 안내 문구를 그대로 표시하고 HTML로 해석하지 않는다. `FAILED`이면서
`runtimeStatus.code === "PREDICTION_UNAVAILABLE"`이면 재시도하지 않는다.

## 6.5 Prediction 생성

아래 조건에서만 호출한다.

```ts
predictionView.predictionRequestAllowed === true
```

`POST /api/v1/me/tasks/{taskId}/prediction`

- 최초 생성: `201 Created`
- 이미 존재하는 동일 prediction 반환: `200 OK`
- body 없음
- Idempotency-Key 없음

POST 응답을 장기 UI state의 기준으로 사용하지 않는다. 성공 뒤
`GET /api/v1/me/tasks/{taskId}/prediction`을 다시 조회하고 이후에는 GET 응답으로 polling한다.

`TASK_PREDICTION_DISABLED`이면 prediction과 Task 제출 모두 이용할 수 없다.

## 6.6 Task 최종 제출

`POST /api/v1/me/tasks/{taskId}/submission`

Headers:

```http
Content-Type: application/json
Idempotency-Key: <canonical-uuid>
```

Frontend는 `selectedOptionId`와 이유 출처에 필요한 값만 보낸다. `userId`,
`personaGenerationId`, `predictionId`, `questionId`는 Backend가 제출 시점의 현재 상태에서 결정한다.

### AI 예상 이유 채택

조건:

- `submissionAllowed=true`
- `aiAcceptanceAllowed=true`
- `allowedReasonSources`에 `AI_ACCEPTED` 포함
- 선택한 reason의 `optionId`와 `selectedOptionId`가 동일

```json
{
  "selectedOptionId": "<selected-option-id>",
  "reasonSource": "AI_ACCEPTED",
  "predictedReasonId": "<predicted-reason-id>"
}
```

AI 문구를 Frontend가 `reason`으로 다시 전송하지 않는다. 선택한 `predictedReasonId`는
현재 Prediction View의 이유 ID이고 그 `optionId`는 `selectedOptionId`와 같아야 한다.
Backend가 해당 이유의 당시 문구를 `finalReason` snapshot으로 보존한다.

### 사용자 직접 작성

조건:

- `submissionAllowed=true`
- `directAnswerAllowed=true`
- `allowedReasonSources`에 `USER_WRITTEN` 포함

```json
{
  "selectedOptionId": "<selected-option-id>",
  "reasonSource": "USER_WRITTEN",
  "reason": "사용자가 직접 입력한 이유"
}
```

`predictedReasonId`는 보내지 않는다. 현재 Prediction이 `SUCCEEDED`이고
`directAnswerAllowed=true`일 때만 직접 제출할 수 있다. Backend는 현재
Prediction의 `predictionId`를 provenance로 자동 연결한다.

AI 채택은 제출 시점에도 현재 Persona의 현재 Prediction이 `SUCCEEDED`인지 다시 검증한다.
Persona 전환 등으로 화면 상태가 오래되었다면 제출을 거절하므로 Prediction View를 다시 조회한다.

성공은 `201 Created`다.

```ts
type TaskSubmissionResponse = {
  code: "TASK_SUBMISSION_CREATED";
  replayed: boolean;
  taskId: string;
  submissionId: string;
  submittedAt: string;
};
```

성공 직후 아래 cache를 무효화하거나 다시 조회한다.

- 열린 Task 목록
- Task 상세
- Task prediction view
- taskId 기준 자신의 submission
- submissionId 기준 자신의 submission

네트워크 결과를 알 수 없을 때는 같은 body와 같은 `Idempotency-Key`로 재시도한다. `409` 거절 후
상태를 새로 조회하고 다시 제출할 때는 새 `Idempotency-Key`를 사용한다.

## 6.7 자신의 Task 제출 조회

### Task 기준

`GET /api/v1/me/submissions?taskId={taskId}`

### Submission ID 기준

`GET /api/v1/me/submissions/{submissionId}`

```ts
type MyTaskSubmission = {
  submissionId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  personaGenerationId: string;
  predictionId: string | null;
  submittedAt: string;
  questionId: string;
  question: UserTaskDetail["task"]["question"];
  selectedOptionId: string;
  reasonSource: TaskReasonSource;
  acceptedPredictedReasonId: string | null;
  finalReason: string;
};
```

자신의 제출만 조회할 수 있으며 없으면 `404 TASK_SUBMISSION_NOT_FOUND`다. 표시 문구는 제출 응답의
`finalReason`을 사용하고 현재 prediction reason을 다시 조합하지 않는다.

## 6.8 Task 오류 처리

| HTTP | `code` | 의미 | Frontend 처리 |
|---|---|---|---|
| `400` | `INVALID_REQUEST` | body/path/header 형식 오류 | client contract 확인 |
| `400` | `INVALID_IDEMPOTENCY_KEY` | 제출 key 형식 오류 | client bug |
| `404` | `TASK_NOT_FOUND` | Task 없음 | not-found |
| `404` | `TASK_SUBMISSION_NOT_FOUND` | 자신의 제출 없음 | empty/not-found |
| `409` | `TASK_SUBMISSION_TASK_UNAVAILABLE` | 제출 대상 Task 없음 | 목록·상세 재조회 |
| `409` | `TASK_SUBMISSION_TASK_UNPUBLISHED` | 제출 대상이 아직 공개 전 | 참여 종료 |
| `409` | `TASK_SUBMISSION_TASK_CLOSED` | 제출 대상이 마감됨 | 참여 종료 |
| `409` | `TASK_CURRENT_PERSONA_NOT_READY` | Persona 미준비 상태에서 command 호출 | prediction view 재조회 후 대기 |
| `409` | `TASK_ALREADY_SUBMITTED` | 이미 최종 제출됨 | prediction/submission 재조회 후 완료 처리 |
| `409` | `TASK_SUBMISSION_PREDICTION_UNAVAILABLE` | 현재 Persona의 Prediction 없음 | prediction view 재조회 |
| `409` | `TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE` | 현재 Prediction이 성공 상태가 아님 | prediction view 재조회 후 AI 선택 초기화 |
| `409` | `TASK_PREDICTION_DISABLED` | 제출 시점에 prediction feature 비활성 | 직접 작성 capability 재확인 |
| `409` | `IDEMPOTENCY_CONFLICT` | 같은 key에 다른 body 사용 | 전송 복구 후 개발 로그 |
| `422` | `TASK_SUBMISSION_VALIDATION_FAILED` | 선택지·이유·prediction 조합 위반 | `violations` 기반 오류 표시 |
| `422` | `TASK_SUBMISSION_OPTION_MISMATCH` | 선택지가 현재 Task에 없음 | Task 상세 재조회 후 선택 초기화 |
| `422` | `TASK_SUBMISSION_REASON_OPTION_MISMATCH` | AI reason과 option 불일치 | prediction view 재조회 후 선택 초기화 |

Task Problem Detail에는 `traceId`가 포함된다. 예상하지 못한 오류를 보고할 때 `traceId`를 로그와
고객지원 정보에 보존한다.

## 6.9 Task 호출 상태 전이

```text
ENTER TASK
  -> GET detail
  -> GET prediction view
     -> PERSONA_NOT_READY: GET polling only
     -> NOT_REQUESTED:
           -> predictionRequestAllowed: POST prediction -> GET polling
      -> PENDING/PROCESSING/RETRY_WAIT: GET polling, 제출 불가
      -> SUCCEEDED: AI_ACCEPTED 또는 USER_WRITTEN
      -> FAILED: 제출 불가 및 실패 안내
     -> ALREADY_SUBMITTED: GET submission

SUBMIT
  -> POST submission
     -> 201: COMPLETED + related queries refresh
     -> 409 ALREADY_SUBMITTED: refresh -> COMPLETED
     -> 409 prediction unavailable/not acceptable: prediction view refresh
     -> 422: 선택/이유 오류 표시
     -> network unknown: same key + same body로 재시도
```

## 6.10 2차 완료 조건

- 열린 Task 목록과 상세가 Backend DTO로 표시된다.
- 이미 제출한 Task는 새 입력 대신 자신의 제출로 이동한다.
- Task 상세 진입 시 prediction view를 조회한다.
- `PERSONA_NOT_READY`에서 prediction POST를 호출하지 않는다.
- prediction POST는 `predictionRequestAllowed=true`일 때만 호출한다.
- polling은 `waiting=true` 동안만 수행하고 route 이탈 시 중단한다.
- AI reason은 선택한 option과 동일한 `optionId`만 선택 가능하다.
- `AI_ACCEPTED`와 `USER_WRITTEN` payload가 서로의 금지 필드를 보내지 않는다.
- submission에 사용한 Persona/prediction ID는 최신 prediction view에서 가져온다.
- 제출 재시도는 동일 idempotency key·body를 사용한다.
- `replayed=true`를 정상 성공으로 처리한다.
- 성공 뒤 Task, prediction, submission cache가 갱신된다.
- 마감 결과/OpinionMap 화면은 구현하지 않는다.

---

# 7. 권장 작업 순서

## 7.1 1차 PR/작업 — Survey

1. 공통 authenticated API client와 `ApiProblem` 구현
2. idempotency key 생성·보존 유틸리티 구현
3. Survey DTO/schema 구현
4. current Survey query 구현
5. 동적 문항 form 구현
6. Survey 제출과 오류 mapping 구현
7. latest/history/detail 구현
8. contract·flow 테스트 구현

## 7.2 2차 PR/작업 — Task

1. Task DTO/schema 구현
2. 열린 Task 목록·상세 구현
3. PredictionView 기반 상태 coordinator 구현
4. prediction 생성과 polling 구현
5. AI_ACCEPTED·USER_WRITTEN 제출 구현
6. 자신의 submission 조회 구현
7. cache invalidation과 idempotency 복구 구현
8. contract·state transition 테스트 구현

두 작업을 하나의 큰 PR로 합치지 않는다. Survey contract와 공통 client가 안정된 뒤 Task가 이를
재사용하도록 한다.

---

# 8. 필수 Frontend 테스트

## 8.1 공통

- cookie 인증 요청이 `credentials: "include"`를 사용한다.
- `401`, `403`, Problem Detail parsing이 구분된다.
- UUID idempotency key가 논리 command당 한 번만 생성된다.
- network retry는 같은 key·body를 사용한다.
- `replayed=true` 성공을 실패 toast로 처리하지 않는다.

## 8.2 Survey

- 6개 문항 유형과 OTHER 선택지 contract parsing
- `displayOrder` 정렬
- `submitted=false/true` 분기
- `422 violations` field mapping
- 이미 제출 `409` 복구
- 회차 변경 `409` 후 current refresh
- 활성 회차 `503`과 사용자 미완료 상태 구분
- 성공 뒤 query invalidation

## 8.3 Task

- PredictionView의 모든 `state` parsing
- UI enablement가 enum 재계산이 아니라 capability boolean을 사용
- `PERSONA_NOT_READY` polling
- `NOT_REQUESTED` prediction 생성
- `PENDING/PROCESSING/RETRY_WAIT` polling 중단 조건
- `SUCCEEDED`에서 option별 reason 필터링
- `FAILED`/prediction disabled에서 제출 비활성화
- AI_ACCEPTED와 USER_WRITTEN payload 상호 배타성
- 이미 제출 `409` 복구
- stale Persona/prediction `409` 뒤 전체 상태 refresh
- 성공 뒤 목록·상세·prediction·submission invalidation

---

# 9. 로컬 E2E 전제

Backend `local` profile은 기본적으로 아래를 활성화한다.

- Survey bootstrap
- Survey round activation
- Persona fake provider
- integration outbox dispatcher
- Task bootstrap
- Task lifecycle scheduler
- Task prediction fake provider
- cookie authentication
- `http://localhost:3000` credential CORS

Frontend E2E 계정의 JWT에는 3.2의 사용자 scope가 모두 있어야 한다. Vote server는 로컬 JWT를
검증하지만 Frontend 로그인 화면이나 token 발급 endpoint 자체는 제공하지 않는다.

Backend 전체 참여 흐름의 참고 smoke script:

```text
vote-resource-server/scripts/local-task-smoke.sh
```

이 script가 검증하는 순서도 Survey 조회·제출 -> Persona 준비 -> Task 조회 -> prediction -> Task 제출이다.

---

# 10. Backend source of truth

계약 충돌 시 아래 순서로 확인한다.

1. 실제 controller와 API model
2. 도메인/application service의 상태와 validation
3. 이 handoff
4. 기존 설명 문서

주요 source:

- `vote-resource-server/src/main/java/com/hamcheeze/vote/survey/api/SurveyUserController.java`
- `vote-resource-server/src/main/java/com/hamcheeze/vote/survey/api/SurveyApiModels.java`
- `vote-resource-server/src/main/java/com/hamcheeze/vote/task/api/TaskUserController.java`
- `vote-resource-server/src/main/java/com/hamcheeze/vote/task/api/TaskSubmissionController.java`
- `vote-resource-server/src/main/java/com/hamcheeze/vote/task/api/TaskApiModels.java`
- `vote-resource-server/src/main/java/com/hamcheeze/vote/task/application/query/TaskPredictionQueryService.java`
- `vote-resource-server/src/main/java/com/hamcheeze/vote/security/VoteSecurityConfig.java`
- `survey-api.md`
- `task-domain.md`
- `vote-resource-server/docs/vote-auth-scope-handoff.md`

---

# 11. 최종 완료 판정

이번 Frontend 연동은 아래가 모두 충족되면 완료다.

- 1차 Survey 완료 조건 통과
- 2차 Task 완료 조건 통과
- Figma 디자인을 API 상태에 연결하되 Backend 상태를 시각 요소에서 재정의하지 않음
- Persona 화면 없이 Task의 Persona 대기 상태를 처리함
- Survey와 Task 최종 제출의 idempotency 복구가 검증됨
- 인증·scope 오류와 도메인 오류가 구분됨
- OpinionMap과 사용자 결과 화면이 의도적으로 제외됨
- 로컬 fixture 환경에서 Survey -> Task 최종 제출 E2E가 통과함
