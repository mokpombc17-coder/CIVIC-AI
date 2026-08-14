# Persona 생성 API 계약

이 문서는 `vote-resource-server`가 AI 시스템에 Persona 생성을 요청할 때 지켜야 할
HTTP 계약만 정의한다.

## 1. 호출 개요

```text
호출자: vote-resource-server
제공자: AI system
방식: 동기 HTTPS
```

```http
POST /v1/personas
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>  # 운영 인증 방식 확정 시 사용
```

- 성공 응답은 반드시 `201 Created`여야 한다.
- callback, webhook과 polling은 사용하지 않는다.
- 요청 timeout은 60초다. timeout 또는 네트워크 오류가 발생하면 같은 요청이 다시
  전달될 수 있다.
- 운영 base URL과 인증정보는 배포 환경별로 별도 전달한다.

## 2. 생성 요청

### 2.1 요청 예시

```json
{
  "generationId": "41b10f99-f7c3-49b3-8578-4e573e2c75e0",
  "schemaVersion": 1,
  "survey": {
    "responseId": "231590b2-9e19-43bb-aad4-cf7cbda0d9d3",
    "roundId": "cb14f869-8d62-44a6-9cc1-33ca0d75fa42",
    "roundNumber": 1,
    "contentVersionId": "651939d1-99f0-48d7-a072-abaf0f767a14",
    "contentVersionNumber": 1,
    "submittedAt": "2026-08-14T00:00:00Z",
    "answers": [
      {
        "questionId": "18054798-0d27-40d6-a37f-0c69a5034846",
        "questionLineageId": "393121c6-da92-4f88-8fac-02f683fcd493",
        "questionType": "SINGLE_CHOICE",
        "prompt": "혼자 쉬는 것과 사람들과 어울리는 것 중 무엇을 더 선호하나요?",
        "description": null,
        "displayOrder": 1,
        "value": {
          "type": "SINGLE_CHOICE",
          "selectedOptions": [
            {
              "optionId": "9bfa4435-a374-48cd-a5ca-cb760bfac8fa",
              "optionLineageId": "a46bf635-2927-4cf0-8ed4-b2f3bc260b09",
              "kind": "STANDARD",
              "label": "혼자 쉬기",
              "displayOrder": 1,
              "inputText": null
            }
          ],
          "textValue": null,
          "numberValue": null,
          "scaleValue": null
        }
      },
      {
        "questionId": "25568dc8-d39f-41cf-bec6-86876acc3b9c",
        "questionLineageId": "703d797d-46b1-4ed8-b833-ddbc2186f129",
        "questionType": "MULTIPLE_CHOICE",
        "prompt": "관심 있는 활동을 모두 선택해주세요.",
        "description": "복수 선택 가능",
        "displayOrder": 2,
        "value": {
          "type": "MULTIPLE_CHOICE",
          "selectedOptions": [
            {
              "optionId": "291fe5d7-518d-483f-af01-a22605be26c1",
              "optionLineageId": "4a387b2d-59f4-49aa-bcff-c94e48d83790",
              "kind": "STANDARD",
              "label": "분석",
              "displayOrder": 1,
              "inputText": null
            },
            {
              "optionId": "83dfbbfa-afb1-4607-933a-fe3139913778",
              "optionLineageId": "a09c7726-bd3a-4181-adde-13106f2c137c",
              "kind": "OTHER",
              "label": "기타",
              "displayOrder": 4,
              "inputText": "창작"
            }
          ],
          "textValue": null,
          "numberValue": null,
          "scaleValue": null
        }
      },
      {
        "questionId": "e20241aa-3958-4500-bfe1-5fe7c718b9ae",
        "questionLineageId": "f80f0510-833c-4c8d-86e2-a4b6c442c1dc",
        "questionType": "SHORT_TEXT",
        "prompt": "자신을 한 문장으로 표현해주세요.",
        "description": null,
        "displayOrder": 3,
        "value": {
          "type": "TEXT",
          "selectedOptions": [],
          "textValue": "차분하고 탐구적입니다.",
          "numberValue": null,
          "scaleValue": null
        }
      },
      {
        "questionId": "d3572e02-d8e9-4b19-ae99-49cffacaec4d",
        "questionLineageId": "9779127f-437b-4020-a38a-bbaab4f529c5",
        "questionType": "LONG_TEXT",
        "prompt": "중요하게 생각하는 가치를 설명해주세요.",
        "description": null,
        "displayOrder": 4,
        "value": {
          "type": "TEXT",
          "selectedOptions": [],
          "textValue": "사실을 충분히 확인하고 다른 사람의 관점을 존중하는 것입니다.",
          "numberValue": null,
          "scaleValue": null
        }
      },
      {
        "questionId": "76924273-d875-4ec4-a736-7685eca98afb",
        "questionLineageId": "4e0c5395-42a3-4790-870a-73795aa8f406",
        "questionType": "NUMBER",
        "prompt": "하루 평균 여가 시간은 몇 시간인가요?",
        "description": null,
        "displayOrder": 5,
        "value": {
          "type": "NUMBER",
          "selectedOptions": [],
          "textValue": null,
          "numberValue": 2.5,
          "scaleValue": null
        }
      },
      {
        "questionId": "f03a05fc-42e2-4742-8c2d-5254f29d3fe3",
        "questionLineageId": "707d9b60-2d2f-46e5-883f-cb4cf9ca93f1",
        "questionType": "SCALE",
        "prompt": "새로운 경험을 즐기는 정도를 선택해주세요.",
        "description": null,
        "displayOrder": 6,
        "value": {
          "type": "SCALE",
          "selectedOptions": [],
          "textValue": null,
          "numberValue": null,
          "scaleValue": 4
        }
      }
    ]
  }
}
```

### 2.2 최상위 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `generationId` | UUID string | O | 리소스 서버가 발급한 Persona 생성 멱등성 식별자 |
| `schemaVersion` | integer | O | 현재 값은 `1` |
| `survey` | object | O | Persona의 원천이 되는 불변 Survey 응답 snapshot |

`generationId`는 HTTP header가 아니라 request body로 전달한다.

### 2.3 `survey` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `responseId` | UUID string | O | 원천 Survey 최종 응답 식별자 |
| `roundId` | UUID string | O | Survey 회차 식별자 |
| `roundNumber` | positive integer | O | Survey 회차 번호 |
| `contentVersionId` | UUID string | O | 응답이 참조하는 불변 내용 버전 식별자 |
| `contentVersionNumber` | positive integer | O | 발행 내용 버전 번호 |
| `submittedAt` | ISO-8601 timestamp | O | UTC 기준 최종 제출 시각 |
| `answers` | array | O | 질문 `displayOrder` 순서의 답안 목록 |

내부 서비스의 `userId`는 요청에 포함하지 않는다. AI 시스템은 `generationId`와
발급한 `personaId`의 관계만 관리해야 한다.

### 2.4 `answers[]` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `questionId` | UUID string | O | 해당 내용 버전 안의 질문 식별자 |
| `questionLineageId` | UUID string | O | 내용 버전 간 동일 질문 추적 식별자 |
| `questionType` | string enum | O | 아래 질문 유형 중 하나 |
| `prompt` | string | O | 응답 당시 질문 문구 |
| `description` | string 또는 null | O | 응답 당시 질문 설명 |
| `displayOrder` | positive integer | O | 질문 표시 순서 |
| `value` | object | O | 타입별 최종 답안 |

`questionType` 값은 다음 여섯 개다.

```text
SINGLE_CHOICE
MULTIPLE_CHOICE
SHORT_TEXT
LONG_TEXT
NUMBER
SCALE
```

### 2.5 `value` 필드

| `type` | 사용 필드 | 사용하지 않는 필드 |
|---|---|---|
| `SINGLE_CHOICE` | `selectedOptions`: 정확히 1개 | 나머지는 `null` |
| `MULTIPLE_CHOICE` | `selectedOptions`: 1개 이상 | 나머지는 `null` |
| `TEXT` | `textValue` | `selectedOptions`는 `[]`, 나머지는 `null` |
| `NUMBER` | `numberValue` | `selectedOptions`는 `[]`, 나머지는 `null` |
| `SCALE` | `scaleValue` | `selectedOptions`는 `[]`, 나머지는 `null` |

- `SHORT_TEXT`와 `LONG_TEXT` 질문은 모두 `value.type = TEXT`로 전달된다.
- `numberValue`는 JSON number이며 정수 또는 소수일 수 있다.
- `scaleValue`는 JSON integer다.

### 2.6 `selectedOptions[]` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `optionId` | UUID string | O | 해당 내용 버전 안의 선택지 식별자 |
| `optionLineageId` | UUID string | O | 내용 버전 간 동일 선택지 추적 식별자 |
| `kind` | string enum | O | `STANDARD` 또는 `OTHER` |
| `label` | string | O | 응답 당시 선택지 문구 |
| `displayOrder` | positive integer | O | 선택지 표시 순서 |
| `inputText` | string 또는 null | O | `OTHER`면 공백이 아닌 직접 입력값, `STANDARD`면 `null` |

## 3. 성공 응답

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "generationId": "41b10f99-f7c3-49b3-8578-4e573e2c75e0",
  "personaId": "persona_01J5AR7X9Q2M6VA4W3C8H0B1KD"
}
```

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `generationId` | UUID string | O | 요청의 `generationId`와 정확히 같아야 함 |
| `personaId` | string | O | AI 시스템이 발급한 불투명 식별자 |

`personaId`는 다음 조건을 모두 만족해야 한다.

- 공백이 아닌 문자열이다.
- 앞뒤 공백이 없다.
- UTF-8 기준이 아니라 문자열 길이 기준 최대 512자다.
- 다른 Persona에 이미 발급한 식별자와 중복되지 않는다.

`200 OK`, 비어 있는 `personaId`, 요청과 다른 `generationId`는 성공으로 처리하지
않는다.

## 4. 멱등성 계약

AI 시스템은 `generationId`를 멱등성 key로 사용해야 한다.

### 4.1 동일 요청 재전달

같은 `generationId`와 의미상 동일한 payload가 다시 전달되면 새 Persona를 만들지
않고 최초 요청과 동일한 `personaId`를 반환해야 한다.

```http
HTTP/1.1 201 Created
```

```json
{
  "generationId": "41b10f99-f7c3-49b3-8578-4e573e2c75e0",
  "personaId": "persona_01J5AR7X9Q2M6VA4W3C8H0B1KD"
}
```

JSON object의 필드 순서는 payload 동일성 판단에 영향을 주면 안 된다.

### 4.2 같은 ID의 다른 payload

같은 `generationId`에 기존 요청과 의미가 다른 payload가 전달되면 다음과 같이
거절해야 한다.

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "code": "IDEMPOTENCY_CONFLICT",
  "message": "The generationId was already used with a different payload."
}
```

## 5. 오류 응답

오류 응답 body는 최소한 다음 형식을 사용한다.

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message."
}
```

| HTTP 상태 | 대표 `code` | 리소스 서버 처리 |
|---|---|---|
| `400 Bad Request` | `INVALID_REQUEST` | 영구 실패 |
| `401 Unauthorized` | `UNAUTHORIZED` | 영구 실패 |
| `403 Forbidden` | `FORBIDDEN` | 영구 실패 |
| `409 Conflict` | `IDEMPOTENCY_CONFLICT` | 영구 실패 |
| `429 Too Many Requests` | `RATE_LIMITED` | 같은 요청 재시도 |
| `500 Internal Server Error` | `INTERNAL_ERROR` | 같은 요청 재시도 |
| `503 Service Unavailable` | `SERVICE_UNAVAILABLE` | 같은 요청 재시도 |

- 429와 5xx 응답, network timeout에는 동일한 `generationId`와 payload를 재전달한다.
- 재시도는 기본적으로 최대 3회이며 최초 재시도 간격은 30초다.
- 오류 응답에는 Survey 답안 원문을 포함하지 않아야 한다.

## 6. 제공자 구현 확인 목록

AI 시스템 구현자는 다음 항목을 모두 충족해야 한다.

- [ ] `POST /v1/personas`를 제공한다.
- [ ] 정상 생성과 동일 요청 재전달에 `201 Created`를 반환한다.
- [ ] 응답에 요청과 동일한 `generationId`를 반환한다.
- [ ] 공백이 아니고 최대 512자인 고유 `personaId`를 반환한다.
- [ ] 동일 `generationId`와 동일 payload에 항상 동일한 `personaId`를 반환한다.
- [ ] 동일 `generationId`와 다른 payload에 `409 IDEMPOTENCY_CONFLICT`를 반환한다.
- [ ] 중복 요청이 동시에 들어와도 Persona를 하나만 생성한다.
- [ ] 지원하지 않는 `schemaVersion`을 `400 INVALID_REQUEST`로 거절한다.
- [ ] callback, webhook 또는 polling을 요구하지 않는다.
- [ ] 일반 로그에 전체 Survey 요청 body와 자유 입력 원문을 기록하지 않는다.
