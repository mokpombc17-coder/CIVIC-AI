# Persona 생성 API 계약

> 전달 대상: Persona Runtime Server 구현 담당자
> 호출자: `vote-resource-server`
> 제공자: Persona Runtime Server
> 계약 버전: `schemaVersion = 3`

## 1. 목적과 처리 방식

이 API는 사용자가 최종 제출한 Survey 응답으로 Persona를 생성하기 위한 서버 간
계약이다. `vote-resource-server`가 요청을 보내고 Persona Runtime Server가 생성된
`personaId`를 반환한다.

```text
Survey 최종 제출
  -> vote-resource-server가 PersonaGeneration 생성
  -> 이 API로 불변 Survey snapshot 전달
  -> Persona Runtime Server가 Persona 생성
  -> generationId + personaId 반환
```

- 호출 방식은 동기 HTTPS다.
- callback, webhook, polling은 사용하지 않는다.
- 요청 timeout은 60초다.
- timeout, network 오류, `408`, `429`, `5xx`가 발생하면 동일한 요청이 재전달될 수
  있다.
- 사용자 UUID, 이메일, 닉네임은 요청에 포함하지 않는다.
- 운영 base URL과 인증 token은 배포 환경별로 별도 전달한다.

## 2. Endpoint와 인증

```http
POST /v1/personas
Content-Type: application/json
Accept: application/json
Authorization: Bearer <ai-runtime-shared-token>
```

- `Authorization`은 `VOTE_AI_RUNTIME_AUTH_TOKEN`으로 공유하는 서버 간 인증용 token이다.
- 사용자 JWT는 전달하지 않는다.
- 운영 환경에서는 HTTPS를 사용해야 한다.
- `generationId`는 별도 HTTP header가 아니라 request body에 포함한다.

## 3. 생성 요청

### 3.1 전체 구조

```json
{
  "generationId": "41b10f99-f7c3-49b3-8578-4e573e2c75e0",
  "schemaVersion": 3,
  "survey": {
    "responseId": "231590b2-9e19-43bb-aad4-cf7cbda0d9d3",
    "roundId": "cb14f869-8d62-44a6-9cc1-33ca0d75fa42",
    "roundNumber": 1,
    "contentVersionId": "651939d1-99f0-48d7-a072-abaf0f767a14",
    "contentVersionNumber": 1,
    "submittedAt": "2026-09-02T00:00:00Z",
    "answers": [
      {
        "questionId": "6ef0629c-e291-4770-aa4f-c854d8acf70a",
        "questionLineageId": "9251642a-cb44-4379-8a88-9931cd14e845",
        "questionType": "SINGLE_CHOICE",
        "prompt": "귀하의 성별은 어떻게 되십니까?",
        "description": null,
        "displayOrder": 2,
        "items": [],
        "value": {
          "type": "SINGLE_CHOICE",
          "selectedOptions": [
            {
              "optionId": "9bfa4435-a374-48cd-a5ca-cb760bfac8fa",
              "optionLineageId": "a46bf635-2927-4cf0-8ed4-b2f3bc260b09",
              "kind": "STANDARD",
              "label": "남성",
              "displayOrder": 1,
              "inputText": null
            }
          ],
          "textValue": null,
          "numberValue": null,
          "scaleValue": null,
          "itemValues": []
        }
      },
      {
        "questionId": "ea035cb9-e4af-49fd-809c-d15c34c68e55",
        "questionLineageId": "f88dac40-c6bc-4f46-bc34-72cff723e21d",
        "questionType": "MATRIX_SINGLE_CHOICE",
        "prompt": "귀댁의 가구원 중 다음 각 연령대에 해당하는 분이 있습니까?",
        "description": "각 연령대별로 있음 또는 없음을 선택해 주십시오.",
        "displayOrder": 5,
        "items": [
          {
            "itemId": "09368e67-20a5-4a78-8f92-65425c4cfcec",
            "itemLineageId": "15537100-da76-4f48-8a0d-5da0070e6823",
            "itemKey": "infant",
            "itemLabel": "영아",
            "displayOrder": 1
          }
        ],
        "value": {
          "type": "MATRIX_SINGLE_CHOICE",
          "selectedOptions": [],
          "textValue": null,
          "numberValue": null,
          "scaleValue": null,
          "itemValues": [
            {
              "itemId": "09368e67-20a5-4a78-8f92-65425c4cfcec",
              "selectedOption": {
                "optionId": "6d0cb13d-e7c5-417b-833d-e7297f2c968d",
                "optionLineageId": "cb7e822e-e285-4381-9baa-deb0d65a52d4",
                "kind": "STANDARD",
                "label": "있음",
                "displayOrder": 1,
                "inputText": null
              },
              "scaleValue": null
            }
          ]
        }
      }
    ]
  }
}
```

위 예시는 구조를 설명하기 위해 일부 Question과 Item만 포함한다. 실제 1회차 요청은
29개 Question을 포함하며, Matrix 내부 Item까지 합하면 42개의 응답 값을 가진다.

### 3.2 최상위 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `generationId` | UUID string | O | 리소스 서버가 발급한 생성 요청 및 멱등성 식별자 |
| `schemaVersion` | positive integer | O | 현재 값은 `3` |
| `survey` | object | O | Persona의 원천이 되는 불변 Survey 응답 snapshot |

`schemaVersion=1`은 이전 평면형 Survey 구조의 계약이며 현재 호출자는 사용하지 않는다.
`schemaVersion=3`은 `schemaVersion=2`와 구조가 같고, 선택 문항 미응답을 `value: null`로
전달하는 것만 다르다. v2에서는 `value`가 항상 존재한다.

호출자는 생성 요청 snapshot을 처음 만들 때의 버전으로 고정해 재전달한다. 따라서 v3
전환 직후에도 이미 만들어진 v2 snapshot의 재시도가 들어올 수 있다. Persona Runtime
Server는 `schemaVersion=2`와 `schemaVersion=3`을 모두 지원해야 하며, 지원하지 않는
버전은 `400 INVALID_REQUEST`로 거절해야 한다.

### 3.3 `survey` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `responseId` | UUID string | O | 원천 Survey 최종 응답 식별자 |
| `roundId` | UUID string | O | Survey 회차 식별자 |
| `roundNumber` | positive integer | O | Survey 회차 번호 |
| `contentVersionId` | UUID string | O | 응답이 참조하는 불변 내용 버전 식별자 |
| `contentVersionNumber` | positive integer | O | 발행 내용 버전 번호 |
| `submittedAt` | ISO-8601 UTC string | O | Survey 최종 제출 시각 |
| `answers` | array | O | 표시 순서대로 정렬된 내용 버전의 모든 Question. 답하지 않은 선택 문항도 포함한다 |

### 3.4 `answers[]` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `questionId` | UUID string | O | 해당 내용 버전 안의 Question 식별자 |
| `questionLineageId` | UUID string | O | 내용 버전 간 동일 Question 추적 식별자 |
| `questionType` | string enum | O | 원본 Survey Question 타입 |
| `prompt` | string | O | 원본 질문 문구 |
| `description` | string 또는 null | O | 원본 보조 설명 |
| `displayOrder` | positive integer | O | Question 표시 순서 |
| `items` | array | O | Matrix Question의 행 정보. 일반 Question은 `[]` |
| `value` | object 또는 null | O | 타입별 실제 사용자 응답. 선택 문항에 답하지 않았으면 `null` |

`questionType`은 다음 값 중 하나다.

```text
SINGLE_CHOICE
MULTIPLE_CHOICE
SHORT_TEXT
LONG_TEXT
NUMBER
SCALE
MATRIX_SINGLE_CHOICE
MATRIX_SCALE
```

### 3.5 `items[]` 필드

`MATRIX_SINGLE_CHOICE`, `MATRIX_SCALE`에서만 값이 존재한다. 배열은
`displayOrder` 오름차순으로 정렬된다.

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `itemId` | UUID string | O | 해당 내용 버전 안의 Matrix Item 식별자 |
| `itemLineageId` | UUID string | O | 내용 버전 간 동일 Item 추적 식별자 |
| `itemKey` | string | O | Item의 안정적인 의미 식별자 |
| `itemLabel` | string | O | 원본 Item 표시 문구 |
| `displayOrder` | positive integer | O | Item 표시 순서 |

### 3.6 `value` 필드

`value`가 `null`이면 사용자가 해당 선택 문항에 답하지 않은 것이다. 필수 문항의
`value`는 항상 존재한다. 1회차의 선택 문항은 건강 상태, 종교, 정치 성향, 지지정당
4개다. 미응답 문항은 Question 정보를 그대로 유지한다.

```json
{
  "questionId": "0c2f6a8e-6b2e-4f53-9e0a-3b1d7e9a4c21",
  "questionLineageId": "7d4b1e2a-91c3-4d8f-a6b5-2e9f0c3d8a17",
  "questionType": "SINGLE_CHOICE",
  "prompt": "귀하께서 믿고 계신 종교는 무엇입니까?",
  "description": "[1개 선택]",
  "displayOrder": 12,
  "items": [],
  "value": null
}
```

`value`가 존재하면 모든 필드를 항상 포함한다. 사용하지 않는 scalar 필드는 `null`, 사용하지
않는 배열은 `[]`로 전달한다.

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `type` | string enum | O | 실제 응답 값의 타입 |
| `selectedOptions` | array | O | 일반 선택형 응답. 미사용 시 `[]` |
| `textValue` | string 또는 null | O | 텍스트 응답 |
| `numberValue` | JSON number 또는 null | O | 숫자 응답 |
| `scaleValue` | integer 또는 null | O | 일반 Scale 응답 |
| `itemValues` | array | O | Matrix Item별 응답. 미사용 시 `[]` |

| `questionType` | `value.type` | 사용 필드 | 나머지 필드 |
|---|---|---|---|
| `SINGLE_CHOICE` | `SINGLE_CHOICE` | `selectedOptions`: 정확히 1개 | scalar `null`, `itemValues=[]` |
| `MULTIPLE_CHOICE` | `MULTIPLE_CHOICE` | `selectedOptions`: 1개 이상 | scalar `null`, `itemValues=[]` |
| `SHORT_TEXT` | `TEXT` | `textValue` | 선택·Item 배열 `[]`, 나머지 `null` |
| `LONG_TEXT` | `TEXT` | `textValue` | 선택·Item 배열 `[]`, 나머지 `null` |
| `NUMBER` | `NUMBER` | `numberValue` | 선택·Item 배열 `[]`, 나머지 `null` |
| `SCALE` | `SCALE` | `scaleValue` | 선택·Item 배열 `[]`, 나머지 `null` |
| `MATRIX_SINGLE_CHOICE` | `MATRIX_SINGLE_CHOICE` | `itemValues[].selectedOption` | 일반 선택 배열 `[]`, scalar `null` |
| `MATRIX_SCALE` | `MATRIX_SCALE` | `itemValues[].scaleValue` | 일반 선택 배열 `[]`, scalar `null` |

Matrix Question은 합성 Question으로 펼치지 않는다. 원본 Question은 한 번만 전달하고,
각 행의 실제 응답은 `itemValues[]`로 전달한다. `itemValues[]`는 Question의 모든
`items[]`를 정확히 한 번씩 포함한다.

### 3.7 `selectedOptions[]`와 `selectedOption`

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `optionId` | UUID string | O | 해당 내용 버전 안의 Option 식별자 |
| `optionLineageId` | UUID string | O | 내용 버전 간 동일 Option 추적 식별자 |
| `kind` | string enum | O | `STANDARD` 또는 `OTHER` |
| `label` | string | O | 원본 Option 문구 |
| `displayOrder` | positive integer | O | Option 표시 순서 |
| `inputText` | string 또는 null | O | `OTHER` 직접 입력값. `STANDARD`는 `null` |

현재 1회차 Survey에는 직접 입력형 `OTHER` Option이 없다. 따라서 현재 요청에서는
모든 Option이 `kind=STANDARD`, `inputText=null`이다. 이 필드는 이후 계약 확장을 위해
유지한다.

### 3.8 `itemValues[]` 필드

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `itemId` | UUID string | O | `items[]` 중 하나와 일치하는 식별자 |
| `selectedOption` | object 또는 null | O | `MATRIX_SINGLE_CHOICE`에서 사용 |
| `scaleValue` | integer 또는 null | O | `MATRIX_SCALE`에서 사용 |

`MATRIX_SINGLE_CHOICE`에서는 `selectedOption`만 존재하고 `scaleValue=null`이다.
`MATRIX_SCALE`에서는 `selectedOption=null`이고 `scaleValue`만 존재한다.

## 4. 성공 응답

### 4.1 최초 생성

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

### 4.2 필드 계약

| 필드 | 타입 | 필수 | 계약 |
|---|---|---|---|
| `generationId` | UUID string | O | 요청과 정확히 동일해야 함 |
| `personaId` | string | O | 공백이 아니고 최대 512자인 Runtime 고유 식별자 |

`personaVersionId`, `modelVersion`, `predictedAdoptionRate`는 이 계약에 포함하지 않는다.
Persona 생성 요청과 성공 결과는 `generationId` 하나로 추적한다.

호출자는 `200 OK`와 `201 Created`를 성공으로 처리한다. 제공자의 권장 응답은 다음과
같다.

- 최초 생성: `201 Created`
- 동일 요청 재전달: `200 OK` 또는 기존 결과를 그대로 `201 Created`
- 두 경우 모두 동일한 `generationId`, `personaId`를 반환

비어 있는 `personaId`, 요청과 다른 `generationId`, 파싱할 수 없는 body는 성공으로
처리하지 않는다.

## 5. 멱등성 계약

`generationId`는 Persona Runtime Server의 멱등성 키다. 호출자는 별도의
`Idempotency-Key` header를 보내지 않는다.

### 5.1 동일 요청 재전달

같은 `generationId`와 의미적으로 동일한 payload가 다시 전달되면 Persona를 새로
만들지 않고 최초 생성된 `personaId`를 반환해야 한다.

```text
same generationId + same payload
  -> same personaId
```

network timeout으로 호출자가 성공 응답을 받지 못했거나, 동일 요청이 동시에 전달되는
경우에도 Persona는 하나만 생성되어야 한다.

### 5.2 같은 ID의 다른 payload

같은 `generationId`에 다른 payload가 전달되면 다음 응답을 반환해야 한다.

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "code": "IDEMPOTENCY_CONFLICT",
  "message": "generationId was already used with a different payload."
}
```

Persona Runtime Server는 `generationId`, 요청 hash, `personaId`를 함께 보관하는 방식을
권장한다. payload 비교 시 JSON object key 순서나 무의미한 직렬화 차이에 영향받지
않도록 canonical JSON 또는 동일한 의미 비교 규칙을 사용해야 한다.

## 6. 오류 응답과 재시도

오류 응답 body는 최소한 다음 형식을 사용한다.

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message."
}
```

- `code`는 필수다.
- `message`는 운영자가 원인을 파악할 수 있는 설명이며 Survey 답안 원문을 포함하지
  않아야 한다.

| HTTP 상태 | 대표 `code` | 호출자 처리 |
|---|---|---|
| `400 Bad Request` | `INVALID_REQUEST` | 영구 실패 |
| `401 Unauthorized` | `UNAUTHORIZED` | 영구 실패, 인증 설정 점검 |
| `403 Forbidden` | `FORBIDDEN` | 영구 실패, 권한 설정 점검 |
| `408 Request Timeout` | `TIMEOUT` | 동일 요청 재시도 |
| `409 Conflict` | `IDEMPOTENCY_CONFLICT` | 영구 실패 |
| `429 Too Many Requests` | `RATE_LIMITED` | 동일 요청 재시도 |
| `500 Internal Server Error` | `INTERNAL_ERROR` | 동일 요청 재시도 |
| `503 Service Unavailable` | `SERVICE_UNAVAILABLE` | 동일 요청 재시도 |

- `408`, `429`, 모든 `5xx`, network 오류와 호출 timeout에는 동일한 `generationId`와
  payload를 재전달한다.
- 그 밖의 `4xx`는 재시도하지 않는 영구 실패로 처리한다.
- 현재 호출자 기본 설정은 최대 3회 시도, 최초 재시도 간격 30초, 최대 재시도 간격
  2분이다.
- Runtime Server가 요청을 처리하는 데 60초 이상 걸릴 수 있다면 동기 계약을 다시
  협의해야 한다.

## 7. 개인정보와 로그 정책

- 요청에는 사용자 UUID, 이메일, 이름, 닉네임을 포함하지 않는다.
- `generationId`는 호출자 내부 사용자 식별자가 아니며 Runtime 연동용 식별자다.
- 일반 application log, access log, error log에 전체 요청 body를 기록하지 않는다.
- 특히 주소지와 자유 입력 응답 원문을 로그에 기록하지 않는다.
- 오류 응답과 로그에는 Question prompt, Option label, 사용자의 실제 답변을 포함하지
  않는다.
- 운영상 필요한 추적 정보는 `generationId`, `schemaVersion`, HTTP 상태,
  처리 시간과 내부 오류 코드로 제한한다.
- 저장·보존·파기 정책은 별도 개인정보 정책에 따른다.

## 8. 제공자 구현 체크리스트

Persona Runtime Server 구현자는 다음 항목을 확인한다.

- [ ] `POST /v1/personas`를 제공한다.
- [ ] `Authorization: Bearer <ai-runtime-shared-token>`을 검증한다.
- [ ] `schemaVersion=2`와 `schemaVersion=3`을 모두 지원한다.
- [ ] v3의 `value: null`을 선택 문항 미응답으로 처리한다.
- [ ] 29개 Question과 Matrix Item 구조를 파싱한다.
- [ ] `MATRIX_SINGLE_CHOICE`의 `itemValues[].selectedOption`을 처리한다.
- [ ] `MATRIX_SCALE`의 `itemValues[].scaleValue`를 처리한다.
- [ ] 최초 생성에 `201 Created`를 반환한다.
- [ ] 동일 요청 재전달에 최초와 같은 `personaId`를 반환한다.
- [ ] 응답의 `generationId`가 요청과 동일하다.
- [ ] 공백이 아니고 최대 512자인 고유 `personaId`를 반환한다.
- [ ] 동일 `generationId`와 다른 payload에 `409 IDEMPOTENCY_CONFLICT`를 반환한다.
- [ ] 중복 요청이 동시에 들어와도 Persona를 하나만 생성한다.
- [ ] 지원하지 않는 `schemaVersion`을 `400 INVALID_REQUEST`로 거절한다.
- [ ] callback, webhook 또는 polling을 요구하지 않는다.
- [ ] 전체 Survey 요청 body와 자유 입력 원문을 일반 로그에 기록하지 않는다.
- [ ] 오류 응답에 Survey 답안 원문을 포함하지 않는다.
- [ ] 처리 시간이 호출 timeout 60초 안에 들어오는지 검증한다.

## 9. 호출자 운영 설정

`vote-resource-server` 운영 환경에는 다음 설정이 필요하다.

```text
VOTE_PERSONA_ENABLED=true
VOTE_PERSONA_PROVIDER=http
VOTE_PERSONA_BASE_URL=https://<persona-runtime-host>
VOTE_AI_RUNTIME_AUTH_TOKEN=<shared-secret>
VOTE_PERSONA_REQUEST_TIMEOUT=60s
VOTE_PERSONA_MAX_ATTEMPTS=3
VOTE_PERSONA_RETRY_INITIAL_DELAY=30s
VOTE_PERSONA_RETRY_MAX_DELAY=2m
```

Survey 제출 이벤트 전달을 위해 Integration Outbox Dispatcher도 활성화되어야 한다.
