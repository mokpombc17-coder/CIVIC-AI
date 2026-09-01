# 1회차 사용자 특성 설문 Frontend API Handoff v2

> 적용 계약: 사용자 API는 Section·Group ID와 모든 lineage ID를 반환하지 않는다.
> 기존 응답의 해당 ID를 사용하던 프론트 코드는 이 v2 계약에 맞춰 패치해야 한다.

## 1. 구현 범위

이 문서는 프론트엔드가 다음 기능을 구현하기 위한 사용자 API 계약이다.

- 현재 진행 중인 1회차 설문 조회
- 7개 Section과 그 아래 29개 화면 문항 Group 렌더링
- Group 내부의 총 42개 저장 Question 답변 수집
- 사용자당 1회 최종 제출
- 제출 완료 상태 및 본인 응답 재조회

관리자용 설문 작성·수정·발행 API와 Survey-Persona 연결은 이번 프론트 구현 범위가 아니다.

## 2. 핵심 정책

- 인증된 사용자는 JWT `sub`로만 식별한다.
- `userId`, UUID 사용자 식별자, 이메일을 Survey API 요청에 보내지 않는다.
- 이메일은 Survey API 요청·응답 및 Survey 저장 모델에 포함되지 않는다.
- 현재 1회차 설문은 7개 Section, 29개 Group, 42개 저장 Question으로 구성된다.
- Figma 8페이지의 필수 동의·확인은 운영 서버 협의 범위이며 Survey API에 포함하지 않는다.
- 모든 42개 Question은 필수 답변이다.
- 사용자당 회차별 최종 제출은 1회만 가능하고 제출 후 수정할 수 없다.
- 서버 임시 저장 API는 없다. 임시 저장이 필요하면 브라우저 로컬 상태로만 처리한다.
- 문항·선택지는 API 응답을 기준으로 렌더링한다. 프론트 코드에 문항 UUID나 옵션 UUID를 고정하지 않는다.
- `questionId`와 `optionId`는 현재 조회 응답에서 받은 값을 그대로 제출한다.
- 사용자 API는 프론트 동작에 필요한 ID만 노출한다. Section·Group ID와 모든 lineage ID는 서버 내부 추적용이며 반환하지 않는다.
- Section·Group·Question·Option의 화면 상태와 테스트 식별에는 각각 `sectionKey`, `groupKey`, `itemKey`, `optionLocalKey`를 사용한다.

## 3. 접속 및 인증

### Base URL

| 환경 | URL |
|---|---|
| 로컬 | `http://localhost:8083/api/v1` |
| 스테이징·운영 | `NEXT_PUBLIC_VOTE_API_URL`에서 구성 |

현재 프론트 저장소의 `voteFetch`는 `/api/v1` prefix, `credentials: "include"`, `cache: "no-store"`를 이미 처리한다.

```ts
import { voteFetch } from "@/lib/vote/vote-fetch";

const survey = await voteFetch<CurrentSurveyResponse>(
  "/me/surveys/current",
);
```

사용자 조회에는 `vote:surveys:read`, 제출에는 `vote:survey-responses:write` scope가 필요하다.

### 로컬 로그인

로컬 프론트가 실행 중일 때 다음 endpoint로 `sub=local-user-1` 세션을 발급할 수 있다.

```http
POST http://localhost:3000/api/dev/auth/session
Content-Type: application/json

{
  "subject": "local-user-1"
}
```

응답은 `204 No Content`이고 `civic_ai_access_token` HttpOnly 쿠키가 설정된다. 이메일 claim은 필요하지 않다.

#### `local-user-1` 반복 확인 모드

로컬 프로필의 `local-user-1`은 프론트 설문 화면을 반복 검증하기 위한 preview 사용자다.

- `GET /me/surveys/current`는 기존 저장 응답과 관계없이 항상 `submitted=false`를 반환한다.
- Eligibility도 현재 응답이 없는 사용자로 평가하므로 설문 진입 상태를 계속 유지한다.
- 유효한 최종 제출은 실제 답변·멱등성 receipt·Outbox event를 저장하지 않고 `200 OK`를 반환한다.
- 성공 body의 형식과 `code=SURVEY_RESPONSE_SUBMITTED`는 일반 제출과 동일하다.
- 반환되는 `responseId`는 요청의 `Idempotency-Key`를 사용한 임시 식별자이며 상세 조회에 사용할 수 없다.
- preview 제출은 최신 응답과 제출 이력에 나타나지 않는다.
- 스테이징·운영 사용자와 로컬의 다른 사용자는 기존 `201 Created`, 1인 1제출, 영구 저장 규칙을 그대로 따른다.

대상 사용자는 로컬 환경 변수 `VOTE_SURVEY_PREVIEW_USER_IDS`의 쉼표 구분 목록으로 재정의할 수 있으며 기본값은 `local-user-1`이다.

## 4. Endpoint 요약

| Method | Path | 용도 |
|---|---|---|
| `GET` | `/me/surveys/current` | 현재 활성 설문, 전체 문항, 제출 여부, 이용 가능 상태 조회 |
| `POST` | `/me/survey-responses` | 현재 회차 답변 최종 제출 |
| `GET` | `/me/survey-responses/latest` | 본인의 최근 제출 상세 조회 |
| `GET` | `/me/survey-responses` | 본인의 제출 이력 목록 조회 |
| `GET` | `/me/survey-responses/{responseId}` | 본인의 특정 제출 상세 조회 |
| `GET` | `/me/service-eligibility` | 현재 서비스 이용 가능 상태만 별도 조회 |

## 5. 공통 TypeScript 타입

```ts
type UUID = string;
type ISO8601 = string;

type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "SCALE";

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

type SurveyQuestion = {
  questionId: UUID;
  itemKey: string;
  itemLabel: string;
  itemDisplayOrder: number;
  type: QuestionType;
  prompt: string;
  description: string | null;
  required: boolean;
  rule: Rule;
  options: SurveyOption[];
};

type SurveyQuestionGroup = {
  groupKey: string;
  sourceNumber: string;
  displayOrder: number;
  title: string;
  prompt: string;
  description: string | null;
  questions: SurveyQuestion[];
};

type SurveyQuestionSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  displayOrder: number;
  groups: SurveyQuestionGroup[];
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

### 프론트 식별자 사용 계약

| 값 | 응답에 포함 | 제출에 포함 | 프론트 용도 |
|---|---:|---:|---|
| `round.id` | O | O | 제출 대상 회차 |
| `content.id` | O | X | 조회·응답 상세의 설문 버전 확인 |
| `sectionKey` | O | X | Section 렌더링과 화면 key |
| `groupKey` | O | X | Group 렌더링과 화면 key |
| `questionId` | O | O | 답변을 실제 Question에 연결 |
| `itemKey` | O | X | 문항 화면 상태와 테스트 key |
| `optionId` | O | 선택형만 O | 선택 답변을 실제 Option에 연결 |
| `optionLocalKey` | O | X | 옵션 화면 상태와 테스트 key |
| `responseId` | 제출 성공·조회 응답에 O | X | 제출 후 상세 조회 |
| `contentVersionId` | 회차·제출·조회 응답에 O | X | 버전 확인용 메타데이터 |

사용자 API는 `sectionId`, `groupId`와 `sectionLineageId`, `groupLineageId`, `questionLineageId`, `optionLineageId`를 반환하지 않는다. 해당 값은 DB와 서버 도메인 내부에서만 유지한다.

최종 제출에서 식별자로 사용하는 값은 HTTP `Idempotency-Key`, body의 `roundId`, 각 답변의 `questionId`, 선택형 답변의 `optionId`뿐이다. `sectionKey`, `groupKey`, `itemKey`, `optionLocalKey`는 제출하지 않는다.

## 6. 현재 설문 조회

```http
GET /api/v1/me/surveys/current
Accept: application/json
Cookie: civic_ai_access_token=...
```

### 응답 타입

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

### 축약 응답 예시

```json
{
  "round": {
    "id": "11111111-1111-1111-1111-111111111111",
    "roundNumber": 1,
    "contentVersionId": "22222222-2222-2222-2222-222222222222",
    "enforcementMode": "REQUIRED",
    "activatedAt": "2026-01-01T00:00:00Z"
  },
  "content": {
    "id": "22222222-2222-2222-2222-222222222222",
    "versionNumber": 1,
    "name": "AI시민의회 M패널 사용자 특성 기초설문 1회차",
    "description": "...",
    "sections": [
      {
        "sectionKey": "personal-information",
        "title": "일반 개인정보",
        "description": null,
        "displayOrder": 1,
        "groups": [
          {
            "groupKey": "birth-year",
            "sourceNumber": "1",
            "displayOrder": 1,
            "title": "출생연도",
            "prompt": "귀하의 출생연도는 어떻게 되십니까?",
            "description": null,
            "questions": [
              {
                "questionId": "77777777-7777-7777-7777-777777777777",
                "itemKey": "value",
                "itemLabel": "출생연도",
                "itemDisplayOrder": 1,
                "type": "NUMBER",
                "prompt": "귀하의 출생연도는 어떻게 되십니까?",
                "description": null,
                "required": true,
                "rule": {
                  "minimumSelections": null,
                  "maximumSelections": null,
                  "maxLength": null,
                  "minimum": 1900,
                  "maximum": 2026,
                  "decimalAllowed": false,
                  "decimalScale": 0,
                  "minimumLabel": null,
                  "maximumLabel": null
                },
                "options": []
              }
            ]
          }
        ]
      }
    ]
  },
  "submitted": false,
  "eligibility": {
    "eligible": false,
    "surveyRequirement": "REQUIRED",
    "reason": "CURRENT_SURVEY_RESPONSE_REQUIRED",
    "nextAction": "COMPLETE_CURRENT_SURVEY",
    "activeRoundId": "11111111-1111-1111-1111-111111111111",
    "evaluatedAt": "2026-09-01T00:00:00Z",
    "capabilities": [
      "SUBMIT_CURRENT_SURVEY",
      "VIEW_CURRENT_SURVEY",
      "VIEW_OWN_SURVEY_RESPONSES"
    ]
  }
}
```

### 렌더링 규칙

1. `sections`, Section 내부 `groups`는 각각 `displayOrder`, Group 내부 `questions`는 `itemDisplayOrder`, 선택지는 `displayOrder` 순으로 렌더링한다.
2. 1회차에서 `sections.length === 7`, 전체 `groups.length === 29`, 전체 `questions.length === 42`가 정상이다. 화면은 개수에 의존하지 않고 응답을 data-driven 방식으로 그린다.
3. Question이 하나인 Group은 `group.prompt`를 질문 문구로 사용하고 입력 UI 하나를 그린다.
4. Question이 여러 개인 Group은 `group.prompt`를 공통 질문으로, 각 `itemLabel`을 행 또는 하위 항목명으로 사용한다.
5. 출생연도는 `NUMBER`이지만 UI는 `rule.minimum`부터 `rule.maximum`까지의 정수 dropdown으로 표현할 수 있다. 서버가 연도 옵션 목록을 별도로 보내지는 않는다.
6. `SCALE`은 `rule.minimum`부터 `rule.maximum`까지 정수 값을 만든다. 양 끝 설명은 `minimumLabel`, `maximumLabel`을 사용한다.
7. 1회차에서 선택형 옵션은 모두 `STANDARD`다. `OTHER`가 향후 반환되면 해당 선택지에만 `inputText` 입력을 노출한다.

### 1회차 Section 구성

Section 제목은 Figma 표기의 가운데점과 띄어쓰기를 그대로 유지한다. 현재 별도 안내 문구가 없으므로 모든 Section의 `description`은 `null`이다.

| 순서 | `sectionKey` | 제목 | 포함 Group |
|---:|---|---|---|
| 1 | `personal-information` | 일반 개인정보 | 출생연도, 성별, 주소지 |
| 2 | `household-information` | 가구 정보 | 혼인상태, 가족 구성, 자녀 유무 |
| 3 | `life-economy` | 생활 · 경제 | 주거형태, 직업, 학력, 가구소득, 건강 상태, 종교 |
| 4 | `values-politics` | 가치 · 정치 성향 | 도덕 기반 성향, 정치 성향, 지지정당, 정치 관심도 |
| 5 | `media-opinion` | 미디어 · 의견 성향 | 선호매체, 의견 고집 정도, 소득 만족도 |
| 6 | `social-institutional-trust` | 사회 · 기관 신뢰 | 집단별 감정적 거리, 사회 신뢰, 지방정부 신뢰도, 중앙정부 신뢰도 |
| 7 | `media-information-habits` | 매체 이용 · 정보 습관 | 매체별 이용 시간, SNS 이용 빈도, OTT 이용 시간, 관심 주제 콘텐츠, 정보 실천 유형, 생활양식 |

Figma의 별도 8페이지인 필수 동의·확인은 위 Section 배열에 포함하지 않는다.

### 타입별 UI와 규칙

| `type` | 일반 UI | 사용할 rule |
|---|---|---|
| `SINGLE_CHOICE` | radio, select | `options[]` |
| `MULTIPLE_CHOICE` | checkbox | `options[]`, `minimumSelections`, `maximumSelections` |
| `SHORT_TEXT` | input | `maxLength` |
| `LONG_TEXT` | textarea | `maxLength` |
| `NUMBER` | number input 또는 정책상 dropdown | `minimum`, `maximum`, `decimalAllowed`, `decimalScale` |
| `SCALE` | radio, segmented control | `minimum`, `maximum`, 양 끝 label |

## 7. 최종 제출

```http
POST /api/v1/me/survey-responses
Content-Type: application/json
Idempotency-Key: <client-generated UUID>
Cookie: civic_ai_access_token=...
```

### 제출 타입

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
    };

type SubmitSurveyRequest = {
  roundId: UUID;
  answers: SubmitAnswer[];
};
```

### 제출 예시

```json
{
  "roundId": "11111111-1111-1111-1111-111111111111",
  "answers": [
    {
      "questionId": "55555555-5555-5555-5555-555555555555",
      "type": "NUMBER",
      "number": 1990
    },
    {
      "questionId": "77777777-7777-7777-7777-777777777777",
      "type": "SINGLE_CHOICE",
      "selection": {
        "optionId": "88888888-8888-8888-8888-888888888888",
        "inputText": null
      }
    },
    {
      "questionId": "99999999-9999-9999-9999-999999999999",
      "type": "MULTIPLE_CHOICE",
      "selections": [
        {
          "optionId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          "inputText": null
        },
        {
          "optionId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          "inputText": null
        }
      ]
    },
    {
      "questionId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
      "type": "SCALE",
      "scale": 7
    }
  ]
}
```

실제 1회차 제출에는 현재 설문의 모든 42개 Question에 대한 답변이 정확히 한 개씩 포함되어야 한다. Group 하나가 제출 답변 하나를 의미하지 않는다.

프론트는 조회 응답의 `questionId`를 form state의 답변 key로 사용한다. 선택형 문항은 조회 응답의 `optionId`를 값으로 보관한다. Question·Option ID를 `itemKey`나 `optionLocalKey`로 재구성하거나 코드에 고정하지 않는다.

### 프론트 호출 예시

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

네트워크 오류로 동일 요청을 재시도할 때는 같은 `Idempotency-Key`와 완전히 같은 payload를 사용한다. 사용자가 답변을 고친 뒤 다시 제출하는 요청에는 새 key를 만든다.

### 성공 응답

HTTP `201 Created`

단, 로컬 preview 사용자인 `local-user-1`은 같은 성공 body를 `200 OK`로 받으며 응답은 저장되지 않는다.

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

```json
{
  "code": "SURVEY_RESPONSE_SUBMITTED",
  "replayed": false,
  "responseId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "roundId": "11111111-1111-1111-1111-111111111111",
  "contentVersionId": "22222222-2222-2222-2222-222222222222",
  "submittedAt": "2026-09-01T01:23:45.123456Z"
}
```

성공 후 현재 설문, 최신 응답, 이력, eligibility query를 invalidate한다. 이후 현재 설문의 `submitted`는 `true`가 된다.

## 8. 본인 응답 조회

### 최신 응답

```http
GET /api/v1/me/survey-responses/latest
```

제출 이력이 없으면 `404 SURVEY_RESPONSE_NOT_FOUND`다.

### 이력 목록

```http
GET /api/v1/me/survey-responses
```

응답은 최신순 배열이다.

```ts
type SurveyResponseSummary = {
  id: UUID;
  roundId: UUID;
  roundNumber: number;
  contentVersionId: UUID;
  submittedAt: ISO8601;
};
```

### 특정 응답

```http
GET /api/v1/me/survey-responses/{responseId}
```

본인 소유가 아닌 `responseId`도 정보 노출 방지를 위해 `404`를 반환한다.

### 상세 응답 타입

```ts
type StoredAnswer = {
  questionId: UUID;
  type: QuestionType;
  text: string | null;
  number: number | null;
  scale: number | null;
  selections: Array<{
    optionId: UUID;
    inputText: string | null;
  }>;
};

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

상세 응답의 `content`는 현재 설문 내용이 아니라 해당 제출이 참조한 불변 content version이다. 마이페이지에서는 이 `content`와 `answers`를 `questionId`, `optionId`로 결합해 당시 문구와 선택지 label을 표시한다.

저장 응답은 제출 payload와 모양이 조금 다르다.

- 단일 선택과 복수 선택 모두 조회 시 `selections[]`로 반환한다.
- 단일 선택은 `selections.length === 1`이다.
- 텍스트·숫자·척도는 각각 `text`, `number`, `scale`을 사용한다.
- 해당하지 않는 scalar 필드는 `null`, 선택이 아닌 답변의 `selections`는 빈 배열이다.
- 이메일과 사용자 식별자는 반환하지 않는다.

## 9. 오류 계약

오류 응답 Content-Type은 `application/problem+json`이다.

```ts
type SurveyViolation = {
  code: string;
  path: string;
  message: string;
  details: Record<string, unknown>;
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
| `400` | `INVALID_REQUEST` | payload와 필수 header를 점검하고 사용자에게 입력 오류 표시 |
| `400` | `INVALID_IDEMPOTENCY_KEY` | UUID key를 새로 생성해 개발 오류 수정 |
| `401` | 인증 오류 | 기존 공통 인증 갱신 흐름 사용 |
| `403` | scope 부족 | 권한·환경 설정 오류로 처리 |
| `404` | `SURVEY_RESPONSE_NOT_FOUND` | 응답 미제출 또는 접근할 수 없는 응답으로 처리 |
| `409` | `CURRENT_SURVEY_ALREADY_SUBMITTED` | 제출 화면을 닫고 최신 응답 조회 |
| `409` | `SURVEY_SUBMISSION_ROUND_CHANGED` | 현재 설문을 재조회하고 기존 화면 상태 폐기 |
| `409` | `IDEMPOTENCY_CONFLICT` | 같은 key를 다른 payload에 재사용한 클라이언트 오류 |
| `422` | `SURVEY_RESPONSE_VALIDATION_FAILED` | `violations[]`를 `details.questionId` 기준으로 문항에 연결 |
| `503` | `SURVEY_ACTIVE_ROUND_UNAVAILABLE` | 사용자 미완료가 아닌 운영 장애 화면 표시 |

멱등성 receipt에는 성공뿐 아니라 제출 거절 결과도 저장될 수 있다. 같은 key와 같은 payload를 재시도하면 같은 결과와 `replayed=true`가 반환된다.

## 10. 권장 화면 흐름

1. 설문 route 진입 시 `GET /me/surveys/current`를 호출한다.
2. `submitted=true`이면 입력 폼 대신 제출 완료 상태와 최신 응답 보기 동선을 표시한다.
3. `submitted=false`이면 7개 Section과 그 아래 29개 Group을 순서대로 렌더링하고 42개 Question 상태를 관리한다.
4. 프론트에서 필수·범위·최대 길이·선택 개수를 사전 검증한다.
5. 최종 확인 시 한 번 생성한 idempotency UUID와 payload snapshot을 유지하며 제출한다.
6. `201` 후 관련 query를 invalidate하고 완료 화면으로 이동한다.
7. 마이페이지 응답 보기는 상세 응답에 포함된 불변 `content`로 렌더링한다.

## 11. 프론트 완료 조건

- 로컬 `local-user-1` 세션으로 현재 설문 조회가 성공한다.
- API 응답 기준 7개 Section, 29개 Group과 총 42개 Question이 누락 없이 렌더링된다.
- 모든 Question type이 공통 모델로 처리된다.
- 제출에는 조회에서 받은 `round.id`, `questionId`, `optionId`만 사용한다.
- Section·Group·Question·Option의 lineage ID나 Section·Group ID에 의존하지 않는다.
- 제출 중 중복 클릭을 막고 네트워크 재시도 시 idempotency key를 보존한다.
- 제출 완료 후 수정 UI를 제공하지 않는다.
- 최신·특정 응답 상세가 제출 당시 content와 결합되어 읽기 전용으로 표시된다.
- 사용자 ID와 이메일을 Survey API body 또는 프론트 설문 상태에 추가하지 않는다.
