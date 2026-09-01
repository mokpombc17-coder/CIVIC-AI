# 1회차 사용자 특성 설문 Frontend API Handoff v4

이 문서는 프론트엔드가 연동할 최종 목표 계약이다. 백엔드는 이 문서를 기준으로 사용자 Read/Write API를 패치한다.

## 1. 확정 사항

- 1회차 설문은 7개 Section, 29개 Question이다.
- 행렬 Question은 3개이며 총 16개 Item을 가진다.
  - 가족 구성: `MATRIX_SINGLE_CHOICE`, Item 6개
  - 집단별 감정적 거리: `MATRIX_SCALE`, Item 7개
  - 매체별 이용 시간: `MATRIX_SINGLE_CHOICE`, Item 3개
- 제출 payload의 최상위 `answers`는 29개다.
- 행렬 답변을 펼치면 실제 응답 값은 총 42개다.
- 1인 1회 제출이며 제출 후 수정할 수 없다.
- 임시 저장 API는 제공하지 않는다. 필요하면 프론트가 브라우저에서 처리한다.
- 이메일은 설문 요청·응답에 포함하지 않고 저장하지 않는다. 사용자는 JWT `sub`의 UUID로 식별한다.
- PDF 원문과 설명은 백엔드 DB에 보존한다.
- Figma 전용 helper text, placeholder, control 형태는 프론트가 `questionKey`로 관리한다.
- `기타`, `그 외`를 포함한 모든 1회차 선택지는 추가 입력 없는 고정 값이다.
- 사용자 API의 Option과 Selection에는 `kind`, `inputText`를 포함하지 않는다.
- 사용자 Read API는 PDF `description`, `sourceNumber`, lineage ID와 표시 순서를 노출하지 않는다.
- 배열은 백엔드가 표시 순서대로 정렬해 반환한다.
- Figma의 필수 동의·확인 페이지는 운영 서버 책임이며 Survey Question과 제출 payload에 포함하지 않는다.

## 2. 접속 및 인증

로컬 Vote Resource Server:

```text
http://localhost:8083
```

프론트 프록시를 통하면 기존 프론트 base URL 정책을 사용한다.

모든 사용자 API는 로그인 사용자의 Bearer JWT를 사용한다. 프론트가 user UUID나 이메일을 별도로 전달하지 않는다.

최종 제출에는 논리적인 제출 시도마다 새로운 `Idempotency-Key`가 필요하다. 네트워크 재시도에는 같은 key와 같은 payload를 사용한다.

```http
Authorization: Bearer <JWT>
Idempotency-Key: <UUID>
Content-Type: application/json
```

## 3. Endpoint

| Method | Path | 용도 |
|---|---|---|
| `GET` | `/api/v1/me/surveys/current` | 현재 설문 상태 및 미제출 설문 내용 조회 |
| `POST` | `/api/v1/me/survey-responses` | 최종 제출 또는 로컬 preview 검증 |
| `GET` | `/api/v1/me/survey-responses/latest` | 최신 본인 응답 상세 조회 |
| `GET` | `/api/v1/me/survey-responses` | 본인 응답 이력 요약 조회 |
| `GET` | `/api/v1/me/survey-responses/{responseId}` | 특정 본인 응답 상세 조회 |
| `GET` | `/api/v1/me/service-eligibility` | 서비스 이용 가능 여부 조회 |

`service-eligibility`는 현재 설문 Read Model에 포함하지 않고 별도 호출한다.

## 4. ID 사용 계약

| 필드 | 조회 | 제출 | 용도 |
|---|---:|---:|---|
| `roundId` | O | O | 제출 대상 회차 식별 |
| `contentVersionId` | O | X | 조회 캐시와 제출 당시 내용 버전 식별 |
| `responseId` | 제출 후 O | X | 저장된 본인 응답 식별 |
| `questionId` | O | O | 29개 Question의 답변 식별 |
| `itemId` | 행렬만 O | 행렬만 O | 행렬의 각 응답 행 식별 |
| `optionId` | 선택형만 O | 선택형만 O | 선택 값 식별 |
| `sectionKey` | O | X | 프론트 Section 연결 |
| `questionKey` | O | X | Figma presentation 및 테스트 연결 |
| `itemKey` | 행렬만 O | X | Item presentation 및 테스트 연결 |

다음 값은 사용자 API에 노출하지 않는다.

- Question, Item, Option lineage ID
- `sourceNumber`
- `displayOrder`
- `optionLocalKey`
- DB row version

`questionKey`, `itemKey`는 화면 연결용 안정 키이며 제출 식별자로 사용하지 않는다.

## 5. 현재 설문 조회

```http
GET /api/v1/me/surveys/current
```

응답은 `status`를 discriminator로 사용하는 union이다.

```ts
type CurrentSurveyResponse =
  | PendingSurveyResponse
  | SubmittedSurveyResponse;

type PendingSurveyResponse = {
  status: "PENDING";
  roundId: UUID;
  contentVersionId: UUID;
  sections: SurveySection[];
};

type SubmittedSurveyResponse = {
  status: "SUBMITTED";
  roundId: UUID;
  contentVersionId: UUID;
  responseId: UUID;
  submittedAt: ISO8601;
};
```

### `PENDING` 예시

```json
{
  "status": "PENDING",
  "roundId": "11111111-1111-1111-1111-111111111111",
  "contentVersionId": "22222222-2222-2222-2222-222222222222",
  "sections": [
    {
      "sectionKey": "personal-information",
      "title": "일반 개인정보",
      "questions": []
    }
  ]
}
```

### `SUBMITTED` 예시

```json
{
  "status": "SUBMITTED",
  "roundId": "11111111-1111-1111-1111-111111111111",
  "contentVersionId": "22222222-2222-2222-2222-222222222222",
  "responseId": "33333333-3333-3333-3333-333333333333",
  "submittedAt": "2026-09-01T07:00:00Z"
}
```

제출 완료 사용자에게는 전체 설문 내용을 다시 반환하지 않는다.

### Section

```ts
type SurveySection = {
  sectionKey: string;
  title: string;
  questions: SurveyQuestion[];
};
```

### Question 공통 필드

```ts
type QuestionBase = {
  questionId: UUID;
  questionKey: string;
  title: string;
  prompt: string;
  required: boolean;
};
```

### Question 타입

```ts
type SurveyQuestion =
  | (QuestionBase & {
      type: "SINGLE_CHOICE";
      options: SurveyOption[];
    })
  | (QuestionBase & {
      type: "MULTIPLE_CHOICE";
      minimumSelections: number;
      maximumSelections: number | null;
      options: SurveyOption[];
    })
  | (QuestionBase & {
      type: "SHORT_TEXT" | "LONG_TEXT";
      maxLength: number | null;
    })
  | (QuestionBase & {
      type: "NUMBER";
      minimum: number | null;
      maximum: number | null;
      decimalScale: number;
    })
  | (QuestionBase & {
      type: "SCALE";
      minimum: number;
      maximum: number;
      minimumLabel: string | null;
      maximumLabel: string | null;
    })
  | (QuestionBase & {
      type: "MATRIX_SINGLE_CHOICE";
      items: SurveyQuestionItem[];
      options: SurveyOption[];
    })
  | (QuestionBase & {
      type: "MATRIX_SCALE";
      items: SurveyQuestionItem[];
      minimum: number;
      maximum: number;
      minimumLabel: string | null;
      maximumLabel: string | null;
    });

type SurveyQuestionItem = {
  itemId: UUID;
  itemKey: string;
  itemLabel: string;
};

type SurveyOption = {
  optionId: UUID;
  label: string;
};
```

불필요한 `null`, 빈 `options`, 빈 `items`를 공통으로 반환하지 않는다. 해당 타입에 필요한 필드만 반환한다.

### 행렬 Question 예시

```json
{
  "questionId": "55555555-5555-5555-5555-555555555555",
  "questionKey": "household.age-group-presence",
  "title": "가족 구성",
  "prompt": "귀댁의 가구원 중 다음 각 연령대에 해당하는 분이 있습니까?",
  "required": true,
  "type": "MATRIX_SINGLE_CHOICE",
  "items": [
    {
      "itemId": "aaaaaaaa-1111-1111-1111-111111111111",
      "itemKey": "infant",
      "itemLabel": "영아"
    },
    {
      "itemId": "aaaaaaaa-2222-2222-2222-222222222222",
      "itemKey": "preschool",
      "itemLabel": "유아"
    }
  ],
  "options": [
    {
      "optionId": "bbbbbbbb-1111-1111-1111-111111111111",
      "label": "있음"
    },
    {
      "optionId": "bbbbbbbb-2222-2222-2222-222222222222",
      "label": "없음"
    }
  ]
}
```

## 6. 1회차 Section 구성

백엔드는 다음 순서로 배열을 반환한다.

1. 일반 개인정보
   - 출생연도, 성별, 주소지
2. 가구 정보
   - 혼인상태, 가족 구성, 자녀 유무
3. 생활 · 경제
   - 주거형태, 직업, 학력, 가구소득, 건강 상태, 종교
4. 가치 · 정치 성향
   - 도덕 기반 성향, 정치 성향, 지지정당, 정치 관심도
5. 미디어 · 의견 성향
   - 선호매체, 의견 고집 정도, 소득 만족도
6. 사회 · 기관 신뢰
   - 집단별 감정적 거리, 사회 신뢰, 지방정부 신뢰도, 중앙정부 신뢰도
7. 매체 이용 · 정보 습관
   - 매체별 이용 시간, SNS 이용 빈도, OTT 이용 시간, 관심 주제 콘텐츠 탐색, 정보 실천 유형, 생활양식

## 7. 프론트 presentation 책임

다음 UI 정보는 API에 추가하지 않는다.

- 페이지별 축약 안내 문구
- placeholder
- dropdown, radio, checkbox 같은 control 형태
- 주소지 3단계 선택 데이터
- Figma 전용 helper text

프론트는 `questionKey`로 presentation을 연결한다.

```ts
const SURVEY_PRESENTATION = {
  "demographics.birth-year": {
    control: "year-select",
    placeholder: "YYYY",
  },
  "demographics.residence": {
    control: "korean-address-select",
  },
  "household.age-group-presence": {
    control: "binary-matrix",
  },
  "social.affective-distance": {
    control: "scale-matrix",
  },
  "media.daily-use-duration": {
    control: "choice-matrix",
  },
} as const;
```

주소지는 프론트가 선택 결과를 공백 하나로 연결해 `SHORT_TEXT`로 제출한다.

```text
서울특별시 동대문구 장안동
```

출생연도 선택지는 API가 1900~현재연도 배열을 반환하지 않는다. `NUMBER.minimum`, `NUMBER.maximum` 범위로 프론트가 생성한다.

## 8. 최종 제출

```http
POST /api/v1/me/survey-responses
Authorization: Bearer <JWT>
Idempotency-Key: <UUID>
Content-Type: application/json
```

```ts
type SubmitSurveyRequest = {
  roundId: UUID;
  answers: SurveyAnswerInput[];
};

type SelectionInput = {
  optionId: UUID;
};

type SurveyAnswerInput =
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
```

1회차 설문의 `기타`, `그 외`는 모두 추가 입력 없는 고정 선택지다. 직접 입력형
Option은 사용자 API에서 지원하지 않으며, 필요해지면 계약 버전을 확장한다.

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
          "itemId": "aaaaaaaa-1111-1111-1111-111111111111",
          "selection": {
            "optionId": "bbbbbbbb-1111-1111-1111-111111111111"
          }
        },
        {
          "itemId": "aaaaaaaa-2222-2222-2222-222222222222",
          "selection": {
            "optionId": "bbbbbbbb-2222-2222-2222-222222222222"
          }
        }
      ]
    },
    {
      "questionId": "66666666-6666-6666-6666-666666666666",
      "type": "MATRIX_SCALE",
      "itemAnswers": [
        {
          "itemId": "cccccccc-1111-1111-1111-111111111111",
          "scale": 7
        }
      ]
    }
  ]
}
```

실제 1회차 제출에서는 모든 29개 Question과 모든 행렬 Item을 포함해야 한다.

백엔드는 다음을 검증한다.

- 모든 필수 Question의 `questionId`가 정확히 한 번 존재
- Question 타입과 Answer 타입 일치
- 선택한 `optionId`가 해당 Question에 소속
- 행렬의 모든 `itemId`가 정확히 한 번 존재
- 행렬 Item이 해당 Question에 소속
- 복수 선택 개수, 숫자 범위, scale 범위와 문자열 길이
- 동일 사용자의 동일 회차 중복 제출 여부

## 9. 제출 성공 응답

영구 저장과 로컬 preview 응답은 `status`와 `persisted`로 구분한다.

```ts
type SubmissionResponse =
  | {
      status: "SUBMITTED";
      persisted: true;
      replayed: boolean;
      responseId: UUID;
      roundId: UUID;
      contentVersionId: UUID;
      submittedAt: ISO8601;
    }
  | {
      status: "PREVIEW_VALIDATED";
      persisted: false;
      roundId: UUID;
      contentVersionId: UUID;
      validatedAt: ISO8601;
    };
```

### 영구 제출

- HTTP `201 Created`
- 동일한 `Idempotency-Key`와 동일 payload 재호출 시 동일 결과와 `replayed=true`

```json
{
  "status": "SUBMITTED",
  "persisted": true,
  "replayed": false,
  "responseId": "33333333-3333-3333-3333-333333333333",
  "roundId": "11111111-1111-1111-1111-111111111111",
  "contentVersionId": "22222222-2222-2222-2222-222222222222",
  "submittedAt": "2026-09-01T07:00:00Z"
}
```

### `local-user-1` preview

- HTTP `200 OK`
- 실제 응답, 멱등성 receipt, Persona 생성 이벤트를 저장하지 않는다.
- 임시 `responseId`를 반환하지 않는다.
- 성공 후에도 `GET /me/surveys/current`는 계속 `PENDING`을 반환한다.
- 프론트는 현재 화면에서만 완료 상태를 표시하며 최신 응답 조회나 query invalidate에 의존하지 않는다.

```json
{
  "status": "PREVIEW_VALIDATED",
  "persisted": false,
  "roundId": "11111111-1111-1111-1111-111111111111",
  "contentVersionId": "22222222-2222-2222-2222-222222222222",
  "validatedAt": "2026-09-01T07:00:00Z"
}
```

## 10. 본인 응답 조회

```http
GET /api/v1/me/survey-responses/latest
GET /api/v1/me/survey-responses
GET /api/v1/me/survey-responses/{responseId}
```

이력 API는 요약 배열을 반환한다.

```ts
type SurveyResponseSummary = {
  responseId: UUID;
  roundId: UUID;
  contentVersionId: UUID;
  submittedAt: ISO8601;
};
```

최신/상세 API는 제출 당시의 불변 Content와 답변을 반환한다.

```ts
type SurveyResponseDetail = {
  responseId: UUID;
  roundId: UUID;
  contentVersionId: UUID;
  submittedAt: ISO8601;
  sections: SurveySection[];
  answers: SurveyAnswerValue[];
};

type SurveyAnswerValue =
  | {
      questionId: UUID;
      type: "SINGLE_CHOICE";
      selection: SelectionValue;
    }
  | {
      questionId: UUID;
      type: "MULTIPLE_CHOICE";
      selections: SelectionValue[];
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
        selection: SelectionValue;
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

type SelectionValue = {
  optionId: UUID;
};
```

프론트는 `questionId`, `itemId`, `optionId`로 답변과 제출 당시의 Question, Item, Option label을 결합한다.

## 11. 오류 계약

오류는 `application/problem+json` 형식을 사용한다.

```ts
type SurveyProblem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  replayed?: boolean;
  violations?: Array<{
    code: string;
    field: string;
    questionId?: UUID;
    itemId?: UUID;
    optionId?: UUID;
  }>;
};
```

프론트가 우선 처리할 오류:

| HTTP | code | 처리 |
|---:|---|---|
| `400` | `INVALID_IDEMPOTENCY_KEY` | 새로운 UUID key로 재시도 |
| `404` | `SURVEY_ACTIVE_ROUND_UNAVAILABLE` | 현재 설문 없음 화면 |
| `404` | `SURVEY_RESPONSE_NOT_FOUND` | 본인 응답 없음 화면 |
| `409` | `CURRENT_SURVEY_ALREADY_SUBMITTED` | 입력 화면을 닫고 최신 응답 조회 |
| `409` | `IDEMPOTENCY_CONFLICT` | 새로운 UUID key로 새 제출 요청 |
| `409` | `SURVEY_SUBMISSION_ROUND_CHANGED` | Current Survey 재조회 |
| `422` | `SURVEY_RESPONSE_VALIDATION_FAILED` | `questionId`, `itemId` 기준 오류 연결 |

## 12. 권장 화면 흐름

1. 설문 진입 시 `GET /api/v1/me/surveys/current`를 호출한다.
2. `status=SUBMITTED`이면 입력 화면을 표시하지 않고 완료 또는 응답 보기로 이동한다.
3. `status=PENDING`이면 `sections` 배열 순서대로 렌더링한다.
4. `questionKey`로 Figma presentation을 연결한다.
5. 일반 문항은 `questionId`, 행렬 문항은 `questionId + itemId`로 form state를 관리한다.
6. 클라이언트 사전 검증 후 새로운 `Idempotency-Key`로 최종 제출한다.
7. `SUBMITTED`이면 Current/Latest query를 갱신한다.
8. `PREVIEW_VALIDATED`이면 현재 화면에서만 완료 상태를 표시한다.

## 13. 백엔드 패치 범위

현재 백엔드의 도메인과 DB는 29개 Question 및 Matrix 구조를 지원한다. 사용자 API는 이 문서의 Read Model에 맞춰 다음 패치가 필요하다.

- Current Survey 응답을 `PENDING | SUBMITTED` union으로 변경
- Current Survey에서 eligibility 제거
- 제출 완료 시 전체 Content 미반환
- Section/Question/Item/Option의 `displayOrder` 제거 및 정렬 보장
- `sourceNumber`, `description`, `optionLocalKey` 제거
- Question 타입별 union 적용
- 응답 상세의 Answer 타입별 union 적용
- 영구 제출과 preview 성공 응답 분리

이 패치가 완료된 시점을 프론트 연동 기준으로 삼는다.
