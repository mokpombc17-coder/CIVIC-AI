# 1회차 사용자 특성 설문 Frontend API Handoff v3

> 목표 계약: 백엔드 도메인 개편 완료 후 제공할 API 형식이다.
> 현재 백엔드는 v2 구조이므로 프론트 연동 전 백엔드 패치와 로컬 DB 초기화가 필요하다.

## 1. 핵심 변경 사항

- 원본 설문 기준으로 7개 Section, 29개 Question을 반환한다.
- 가족 구성, 집단별 감정적 거리, 매체별 이용 시간은 하나의 Question과 여러 Item으로 반환한다.
- 기존 `sections[].groups[].questions[]`는 `sections[].questions[]`로 단순화한다.
- 일반 Question은 `items=[]`다.
- 행렬 Question의 `items[].itemLabel`은 항상 `string`이며 `null`이 아니다.
- 행렬 Question은 `MATRIX_SINGLE_CHOICE`, `MATRIX_SCALE` 타입을 사용한다.
- 제출은 29개 Question 답변을 보내고, 행렬 답변 안에 `itemAnswers[]`를 포함한다.
- 전체 필수 응답 값은 42개다. Question 수 29개와 응답 값 수 42개는 서로 다른 개념이다.
- 원본 질문 문구는 Question의 `prompt`에 한 번만 존재한다. Item별 합성 문구는 만들거나 반환하지 않는다.

## 2. 구현 범위와 정책

- 7개 Section과 29개 Question 조회 및 렌더링
- 일반 문항 26개와 행렬 Item 16개의 총 42개 값 수집
- 사용자당 회차별 1회 최종 제출 및 제출 후 수정 불가
- 서버 임시 저장 미지원
- 제출 완료 상태 및 본인 응답 재조회
- 관리자용 설문 작성·수정·발행 API는 이번 범위가 아니다.
- Figma 8페이지의 필수 동의·확인은 운영 서버 범위이며 Survey API에 포함하지 않는다.
- 사용자는 JWT `sub`로만 식별한다. 이메일과 사용자 식별자를 request body에 넣지 않는다.
- 프론트는 API가 반환한 ID를 그대로 사용하며 UUID를 코드에 고정하거나 key로 재구성하지 않는다.

## 3. 접속 및 인증

| 환경 | Base URL |
|---|---|
| 로컬 | `http://localhost:8083/api/v1` |
| 스테이징·운영 | `NEXT_PUBLIC_VOTE_API_URL`에서 구성 |

```ts
import { voteFetch } from "@/lib/vote/vote-fetch";

const survey = await voteFetch<CurrentSurveyResponse>(
  "/me/surveys/current",
);
```

사용자 조회에는 `vote:surveys:read`, 제출에는 `vote:survey-responses:write` scope가 필요하다.

### 로컬 로그인

```http
POST http://localhost:3000/api/dev/auth/session
Content-Type: application/json

{
  "subject": "local-user-1"
}
```

응답은 `204 No Content`이며 `civic_ai_access_token` HttpOnly 쿠키가 설정된다.

### `local-user-1` preview

- 현재 설문 조회는 항상 `submitted=false`를 반환한다.
- 유효한 제출은 실제 응답, 멱등성 receipt, Outbox event를 저장하지 않고 `200 OK`를 반환한다.
- 성공 body의 `responseId`는 요청의 `Idempotency-Key`와 동일한 임시 식별자다.
- preview 제출은 최신 응답 및 제출 이력에 나타나지 않는다.
- 그 외 사용자는 `201 Created`, 1인 1제출, 영구 저장 정책을 적용한다.
- 기본 preview 사용자는 `local-user-1`이며 `VOTE_SURVEY_PREVIEW_USER_IDS`로 재정의할 수 있다.

## 4. Endpoint

| Method | Path | 용도 |
|---|---|---|
| `GET` | `/me/surveys/current` | 현재 활성 설문, 전체 문항, 제출 여부 조회 |
| `POST` | `/me/survey-responses` | 현재 회차 답변 최종 제출 |
| `GET` | `/me/survey-responses/latest` | 본인의 최근 제출 상세 조회 |
| `GET` | `/me/survey-responses` | 본인의 제출 이력 목록 조회 |
| `GET` | `/me/survey-responses/{responseId}` | 본인의 특정 제출 상세 조회 |
| `GET` | `/me/service-eligibility` | 서비스 이용 가능 상태 조회 |

## 5. 공통 조회 타입

```ts
type UUID = string;
type ISO8601 = string;

type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "SCALE"
  | "MATRIX_SINGLE_CHOICE"
  | "MATRIX_SCALE";

type OptionKind = "STANDARD" | "OTHER";
type EnforcementMode = "ADVISORY" | "REQUIRED";

type Rule = {
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
  optionId: UUID;
  optionLocalKey: string;
  kind: OptionKind;
  label: string;
  displayOrder: number;
};

type SurveyQuestionItem = {
  itemId: UUID;
  itemKey: string;
  itemLabel: string;
  displayOrder: number;
};

type SurveyQuestion = {
  questionId: UUID;
  questionKey: string;
  sourceNumber: string;
  displayOrder: number;
  title: string;
  prompt: string;
  description: string | null;
  type: QuestionType;
  required: true;
  rule: Rule;
  options: SurveyOption[];
  items: SurveyQuestionItem[];
};

type SurveyQuestionSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  displayOrder: number;
  questions: SurveyQuestion[];
};

type PublishedSurveyContent = {
  id: UUID;
  versionNumber: number;
  name: string;
  description: string | null;
  sections: SurveyQuestionSection[];
};

type Eligibility = {
  eligible: boolean;
  surveyRequirement:
    | "SATISFIED"
    | "RECOMMENDED"
    | "REQUIRED"
    | "UNAVAILABLE";
  reason:
    | "CURRENT_SURVEY_RESPONSE_RECOMMENDED"
    | "CURRENT_SURVEY_RESPONSE_REQUIRED"
    | "ACTIVE_SURVEY_ROUND_UNAVAILABLE"
    | null;
  nextAction: "COMPLETE_CURRENT_SURVEY" | null;
  activeRoundId: UUID | null;
  evaluatedAt: ISO8601;
  capabilities: Array<
    | "USE_GENERAL_SERVICE"
    | "USE_PERSONALIZED_SERVICE"
    | "VIEW_CURRENT_SURVEY"
    | "SUBMIT_CURRENT_SURVEY"
    | "VIEW_OWN_SURVEY_RESPONSES"
  >;
};
```

### ID 사용 계약

| 값 | 조회 응답 | 제출 사용 | 용도 |
|---|---:|---:|---|
| `round.id` | O | O | 제출 회차 지정 |
| `questionId` | O | O | 29개 Question 답변 식별 |
| `itemId` | 행렬만 O | 행렬만 O | 행렬의 각 응답 행 식별 |
| `optionId` | 선택형만 O | 선택형만 O | 선택 값 식별 |
| `sectionKey` | O | X | 렌더링·테스트 key |
| `questionKey` | O | X | 렌더링·테스트 key |
| `itemKey` | 행렬만 O | X | 렌더링·테스트 key |
| `optionLocalKey` | 선택형만 O | X | 렌더링·테스트 key |
| 모든 lineage ID | X | X | 서버 내부 추적 전용 |

## 6. 현재 설문 조회

```http
GET /api/v1/me/surveys/current
Accept: application/json
Cookie: civic_ai_access_token=...
```

```ts
type CurrentSurveyResponse = {
  round: {
    id: UUID;
    roundNumber: number;
    contentVersionId: UUID;
    enforcementMode: EnforcementMode;
    activatedAt: ISO8601;
  };
  content: PublishedSurveyContent;
  submitted: boolean;
  eligibility: Eligibility;
};
```

### `MATRIX_SINGLE_CHOICE` 예시

```json
{
  "questionId": "55555555-5555-5555-5555-555555555555",
  "questionKey": "household.age-group-presence",
  "sourceNumber": "5",
  "displayOrder": 5,
  "title": "가족 구성",
  "prompt": "귀댁의 가구원 중 다음 각 연령대에 해당하는 분이 있습니까?",
  "description": null,
  "type": "MATRIX_SINGLE_CHOICE",
  "required": true,
  "rule": {
    "minimumSelections": null,
    "maximumSelections": null,
    "maxLength": null,
    "minimum": null,
    "maximum": null,
    "decimalAllowed": null,
    "decimalScale": null,
    "minimumLabel": null,
    "maximumLabel": null
  },
  "options": [
    {
      "optionId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "optionLocalKey": "A",
      "kind": "STANDARD",
      "label": "있음",
      "displayOrder": 1
    },
    {
      "optionId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "optionLocalKey": "B",
      "kind": "STANDARD",
      "label": "없음",
      "displayOrder": 2
    }
  ],
  "items": [
    {
      "itemId": "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "itemKey": "infant",
      "itemLabel": "영아",
      "displayOrder": 1
    },
    {
      "itemId": "22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "itemKey": "middle-school",
      "itemLabel": "중등",
      "displayOrder": 4
    }
  ]
}
```

실제 응답에는 가족 구성 Item 6개가 모두 포함된다. 위 JSON은 구조 설명용 축약 예시다.

### 렌더링 규칙

1. `sections`, `questions`, `items`, `options`를 각각 `displayOrder` 순으로 렌더링한다.
2. 1회차는 Section 7개, Question 29개가 정상이다.
3. 일반 Question은 `items.length === 0`이며 입력 UI 하나를 그린다.
4. 행렬 Question은 `items`마다 입력 UI 하나를 그린다.
5. 행렬 UI는 표, 카드, 세로형 목록 중 어느 형태로 표현해도 된다.
6. `MATRIX_SINGLE_CHOICE`의 `options`는 모든 Item이 공유하며 각 Item에서 하나를 선택한다.
7. `MATRIX_SCALE`의 척도 rule은 모든 Item에 동일하게 적용한다.
8. 출생연도 `NUMBER`는 정수 dropdown으로 표현할 수 있다.
9. Question 또는 Item별 문장을 프론트에서 조합하거나 생성하지 않는다.

### 타입별 UI

| `type` | 의미 | 일반 UI |
|---|---|---|
| `SINGLE_CHOICE` | Question에서 선택지 1개 | radio, select |
| `MULTIPLE_CHOICE` | Question에서 선택지 여러 개 | checkbox |
| `SHORT_TEXT` | 짧은 문자열 | input |
| `LONG_TEXT` | 긴 문자열 | textarea |
| `NUMBER` | 숫자 하나 | number input, dropdown |
| `SCALE` | 척도 값 하나 | segmented control |
| `MATRIX_SINGLE_CHOICE` | 각 Item마다 선택지 1개 | radio matrix, item card |
| `MATRIX_SCALE` | 각 Item마다 척도 값 1개 | scale matrix, item card |

### 1회차 Section 구성

| 순서 | Section | 포함 Question |
|---:|---|---|
| 1 | 일반 개인정보 | 출생연도, 성별, 주소지 |
| 2 | 가구 정보 | 혼인상태, 가족 구성, 자녀 유무 |
| 3 | 생활 · 경제 | 주거형태, 직업, 학력, 가구소득, 건강 상태, 종교 |
| 4 | 가치 · 정치 성향 | 도덕 기반 성향, 정치 성향, 지지정당, 정치 관심도 |
| 5 | 미디어 · 의견 성향 | 선호매체, 의견 고집 정도, 소득 만족도 |
| 6 | 사회 · 기관 신뢰 | 집단별 감정적 거리, 사회 신뢰, 지방정부 신뢰도, 중앙정부 신뢰도 |
| 7 | 매체 이용 · 정보 습관 | 매체별 이용 시간, SNS 이용 빈도, OTT 이용 시간, 관심 주제 콘텐츠, 정보 실천 유형, 생활양식 |

| 행렬 Question | 타입 | Item 수 |
|---|---|---:|
| 가족 구성 | `MATRIX_SINGLE_CHOICE` | 6 |
| 집단별 감정적 거리 | `MATRIX_SCALE` | 7 |
| 매체별 이용 시간 | `MATRIX_SINGLE_CHOICE` | 3 |

## 7. 최종 제출

```http
POST /api/v1/me/survey-responses
Content-Type: application/json
Idempotency-Key: <client-generated UUID>
Cookie: civic_ai_access_token=...
```

```ts
type SelectionInput = {
  optionId: UUID;
  inputText?: string | null;
};

type SubmitAnswer =
  | {
      questionId: UUID;
      type: "SINGLE_CHOICE";
      selection: SelectionInput;
    }
  | {
      questionId: UUID;
      type: "MULTIPLE_CHOICE";
      selections: SelectionInput[];
    }
  | {
      questionId: UUID;
      type: "SHORT_TEXT" | "LONG_TEXT";
      text: string;
    }
  | {
      questionId: UUID;
      type: "NUMBER";
      number: number;
    }
  | {
      questionId: UUID;
      type: "SCALE";
      scale: number;
    }
  | {
      questionId: UUID;
      type: "MATRIX_SINGLE_CHOICE";
      itemAnswers: Array<{
        itemId: UUID;
        selection: SelectionInput;
      }>;
    }
  | {
      questionId: UUID;
      type: "MATRIX_SCALE";
      itemAnswers: Array<{
        itemId: UUID;
        scale: number;
      }>;
    };

type SubmitSurveyRequest = {
  roundId: UUID;
  answers: SubmitAnswer[];
};
```

### 행렬 제출 예시

```json
{
  "roundId": "11111111-1111-1111-1111-111111111111",
  "answers": [
    {
      "questionId": "55555555-5555-5555-5555-555555555555",
      "type": "MATRIX_SINGLE_CHOICE",
      "itemAnswers": [
        {
          "itemId": "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          "selection": {
            "optionId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "inputText": null
          }
        },
        {
          "itemId": "22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          "selection": {
            "optionId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "inputText": null
          }
        }
      ]
    },
    {
      "questionId": "77777777-7777-7777-7777-777777777777",
      "type": "MATRIX_SCALE",
      "itemAnswers": [
        {
          "itemId": "33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          "scale": 7
        }
      ]
    }
  ]
}
```

위 JSON은 구조 설명용 축약 예시다. 실제 제출 규칙은 다음과 같다.

- `answers.length === 29`
- 모든 Question의 `questionId`가 정확히 한 번 존재
- 행렬 Question은 정의된 모든 `itemId`를 정확히 한 번씩 포함
- 전체 응답 값은 42개
- 정의되지 않았거나 중복된 Question, Item, Option ID는 `422`로 거부
- Option은 해당 Question에 소속되어야 함
- 제출 payload에는 `sectionKey`, `questionKey`, `itemKey`, `optionLocalKey`를 넣지 않음

```ts
const idempotencyKey = crypto.randomUUID();

const result = await voteFetch<SubmissionResponse>(
  "/me/survey-responses",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  },
);
```

네트워크 재시도에는 같은 `Idempotency-Key`와 같은 payload를 사용한다. 답변이 바뀐 새 제출 시도에는 새 key를 사용한다.

### 성공 응답

일반 사용자는 `201 Created`, `local-user-1` preview는 `200 OK`다.

```ts
type SubmissionResponse = {
  code: "SURVEY_RESPONSE_SUBMITTED";
  replayed: boolean;
  responseId: UUID;
  roundId: UUID;
  contentVersionId: UUID;
  submittedAt: ISO8601;
};
```

## 8. 본인 응답 조회

```http
GET /api/v1/me/survey-responses/latest
GET /api/v1/me/survey-responses
GET /api/v1/me/survey-responses/{responseId}
```

본인 소유가 아닌 `responseId`도 `404`를 반환한다.

```ts
type SurveyResponseSummary = {
  id: UUID;
  roundId: UUID;
  roundNumber: number;
  contentVersionId: UUID;
  submittedAt: ISO8601;
};

type StoredAnswer = SubmitAnswer;

type SurveyResponseDetail = {
  id: UUID;
  roundId: UUID;
  roundNumber: number;
  contentVersionId: UUID;
  submittedAt: ISO8601;
  answers: StoredAnswer[];
  content: PublishedSurveyContent;
};
```

상세 응답의 `content`는 제출 당시의 불변 content version이다. 프론트는 `questionId`, `itemId`, `optionId`로 답변과 당시 문구·항목·선택지 label을 결합한다.

## 9. 오류 계약

오류 응답 Content-Type은 `application/problem+json`이다.

```ts
type SurveyViolation = {
  code: string;
  path: string;
  message: string;
  details: {
    questionId?: UUID;
    itemId?: UUID;
    optionId?: UUID;
    [key: string]: unknown;
  };
};

type SurveyProblem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  replayed: boolean;
  retryable: boolean;
  violations?: SurveyViolation[];
};
```

| HTTP | `code` | 프론트 처리 |
|---|---|---|
| `400` | `INVALID_REQUEST` | payload와 필수 header 점검 |
| `400` | `INVALID_IDEMPOTENCY_KEY` | UUID key 생성 코드 점검 |
| `401` | 인증 오류 | 공통 인증 갱신 흐름 사용 |
| `403` | scope 부족 | 권한·환경 설정 오류 처리 |
| `404` | `SURVEY_RESPONSE_NOT_FOUND` | 미제출 또는 접근 불가 처리 |
| `409` | `CURRENT_SURVEY_ALREADY_SUBMITTED` | 입력 화면을 닫고 최신 응답 조회 |
| `409` | `SURVEY_SUBMISSION_ROUND_CHANGED` | 현재 설문 재조회 후 화면 상태 폐기 |
| `409` | `IDEMPOTENCY_CONFLICT` | 같은 key를 다른 payload에 재사용한 오류 |
| `422` | `SURVEY_RESPONSE_VALIDATION_FAILED` | `questionId`, `itemId` 기준으로 입력 오류 연결 |
| `503` | `SURVEY_ACTIVE_ROUND_UNAVAILABLE` | 운영 장애 상태 처리 |

## 10. 권장 화면 흐름

1. 설문 진입 시 `GET /me/surveys/current`를 호출한다.
2. `submitted=true`이면 완료 상태와 최신 응답 보기 동선을 표시한다.
3. `submitted=false`이면 7개 Section과 29개 Question을 렌더링한다.
4. 일반 문항은 `questionId`, 행렬 문항은 `questionId + itemId`로 form state를 관리한다.
5. 필수·범위·선택 개수와 행렬 Item 누락을 사전 검증한다.
6. 최종 확인 시 idempotency UUID와 payload snapshot을 고정하고 제출한다.
7. 성공 후 현재 설문, eligibility, 최신 응답, 이력 query를 invalidate한다.
8. 마이페이지는 제출 당시 `content`로 읽기 전용 렌더링한다.

## 11. 완료 조건

- `local-user-1`로 현재 설문 조회와 preview 제출이 성공한다.
- Section 7개, Question 29개가 렌더링된다.
- 일반 Question 26개와 행렬 Item 16개의 총 42개 값이 관리된다.
- 가족 구성과 매체별 이용 시간은 `MATRIX_SINGLE_CHOICE`로 렌더링된다.
- 집단별 감정적 거리는 `MATRIX_SCALE`로 렌더링된다.
- 행렬의 모든 `itemLabel`이 API 원문 그대로 표시된다.
- Question 또는 Item별 합성 질문 문구를 만들지 않는다.
- 제출에는 `round.id`, `questionId`, 행렬의 `itemId`, 선택형의 `optionId`를 사용한다.
- lineage ID에 의존하지 않는다.
- 제출 완료 후 수정 UI를 제공하지 않는다.
- 이메일과 사용자 식별자를 Survey API body 또는 form state에 추가하지 않는다.

## 12. 백엔드 패치 필요 사항

- `SurveyQuestionGroup`을 원본 `SurveyQuestion`으로 통합
- 29개 Question과 행렬 Item 모델 도입
- `MATRIX_SINGLE_CHOICE`, `MATRIX_SCALE` 타입 및 검증 추가
- Question 공통 Option과 행렬 Item별 답변 저장 지원
- 조회·제출·본인 응답 DTO를 v3 형식으로 변경
- Persona 입력을 29개 원본 Question 구조로 변경
- 1회차 fixture를 원문 기준으로 다시 생성
- 로컬 DB 초기화 후 재검증
