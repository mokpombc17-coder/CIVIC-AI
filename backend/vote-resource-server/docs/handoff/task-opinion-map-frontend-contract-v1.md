# Task Opinion Map frontend contract v1

Status: Frontend response, generation pipeline, and OpenRouter adapter implemented
Last updated: 2026-09-11

## Purpose

완료된 Task 결과 화면에 현재 사용자의 선택을 기준으로 다음 두 설명을
제공한다.

- 같은 선택을 한 사람들은 어떤 이유를 들었는가
- 다른 선택을 한 사람들은 어떤 이유를 들었는가

백엔드는 현재 사용자가 선택한 항목에 대응하는 설명만 반환한다. 프론트는
LLM의 전체 선택지별 출력이나 내부 option key를 해석하지 않는다.

## Endpoint

기존 사용자 결과 조회 API를 확장한다.

```http
GET /api/v1/me/tasks/{taskId}/result
Authorization: Bearer <user-access-token>
Accept: application/json
```

기존 응답 필드는 변경하거나 제거하지 않는다. 최상위 응답에
`opinionMap` 필드만 추가한다.

기존 API와 동일하게 다음 경우에는 `404 TASK_RESULT_NOT_FOUND`를 반환한다.

- 현재 사용자의 Task 제출본이 없음
- Task 결과가 아직 확정되지 않음

Opinion Map 생성 상태는 HTTP 상태를 바꾸지 않는다. Task 결과가 존재하면
`opinionMap.status`와 관계없이 `200 OK`를 반환한다.

## Response addition

```json
{
  "taskId": "00000000-0000-0000-0000-000000000001",
  "resultVersion": 1,
  "options": [],
  "mySubmission": {},
  "opinionMap": {
    "status": "AVAILABLE",
    "sameChoice": {
      "status": "AVAILABLE",
      "body": "같은 선택을 한 참여자들은 검증된 절차가 필요하다고 설명했습니다."
    },
    "otherChoices": {
      "status": "NO_RESPONSES",
      "body": null
    }
  }
}
```

위 예시에서 생략한 기존 필드는 실제 응답에서 그대로 유지된다.

## TypeScript reference

```typescript
type OpinionMapResponse = {
  status: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  sameChoice: OpinionMapArea | null;
  otherChoices: OpinionMapArea | null;
};

type OpinionMapArea = {
  status: "AVAILABLE" | "NO_RESPONSES" | "INSUFFICIENT_REASON";
  body: string | null;
};
```

`opinionMap`은 Task 결과 조회가 성공하면 항상 존재한다.

## Top-level status

| status | 의미 | sameChoice | otherChoices |
|---|---|---|---|
| `PENDING` | 현재 resultVersion의 요약을 생성하거나 검증하는 중 | `null` | `null` |
| `AVAILABLE` | 검증된 요약 결과가 준비됨 | 객체 | 객체 |
| `UNAVAILABLE` | 현재 resultVersion의 요약을 제공할 수 없음 | `null` | `null` |

`AVAILABLE`은 두 영역 모두 본문 문자열이 있다는 의미가 아니다. 각 영역의
표시 가능 여부는 영역의 `status`로 판단한다.

Opinion Map 저장 결과가 없는 기존 종료 Task는 `UNAVAILABLE`로 반환한다.
생성 기능이 활성화된 뒤 확정되는 신규 결과에는 처리 레코드가 생성되어
`PENDING`을 거쳐 `AVAILABLE` 또는 `UNAVAILABLE`로 전환된다. 기능은 실제
LLM provider adapter가 연결되기 전까지 기본적으로 비활성화한다.

## Area status

| status | body | 프론트 처리 |
|---|---|---|
| `AVAILABLE` | 비어 있지 않은 문자열 | 전달된 `body` 표시 |
| `NO_RESPONSES` | `null` | 프론트가 정의한 응답 없음 placeholder 표시 |
| `INSUFFICIENT_REASON` | `null` | 프론트가 정의한 요약 불가 placeholder 표시 |

placeholder 문구는 API 계약에 포함하지 않는다. 문구와 노출 방식은 프론트가
관리한다.

## Selection projection

LLM 결과에는 모든 선택지의 설명이 존재하지만 사용자 API에는 현재 사용자의
선택에 해당하는 한 쌍만 노출한다.

- 사용자가 O1에 대응하는 선택지를 제출함: O1의 `sameChoice`와
  `otherChoices` 반환
- 사용자가 O2에 대응하는 선택지를 제출함: O2의 `sameChoice`와
  `otherChoices` 반환

O1, O2 같은 LLM projection key는 프론트에 노출하지 않는다. 백엔드가
`mySubmission.selectedOptionId`와 확정 결과의 선택지 순서를 검증한 뒤 알맞은
설명을 선택한다.

## State examples

### Pending

```json
{
  "opinionMap": {
    "status": "PENDING",
    "sameChoice": null,
    "otherChoices": null
  }
}
```

### Available with both bodies

```json
{
  "opinionMap": {
    "status": "AVAILABLE",
    "sameChoice": {
      "status": "AVAILABLE",
      "body": "같은 선택을 한 참여자들이 제시한 이유입니다."
    },
    "otherChoices": {
      "status": "AVAILABLE",
      "body": "다른 선택을 한 참여자들이 제시한 이유입니다."
    }
  }
}
```

### Available with an area placeholder

```json
{
  "opinionMap": {
    "status": "AVAILABLE",
    "sameChoice": {
      "status": "AVAILABLE",
      "body": "같은 선택을 한 참여자들이 제시한 이유입니다."
    },
    "otherChoices": {
      "status": "INSUFFICIENT_REASON",
      "body": null
    }
  }
}
```

### Unavailable

```json
{
  "opinionMap": {
    "status": "UNAVAILABLE",
    "sameChoice": null,
    "otherChoices": null
  }
}
```

## Frontend responsibilities

- `opinionMap.status`에 따른 loading 또는 unavailable UI를 표시한다.
- 상위 상태가 `AVAILABLE`이면 각 영역의 `status`에 따라 본문 또는
  placeholder를 표시한다.
- placeholder 문구는 프론트 리소스로 관리한다.
- `PENDING` 상태에서 자동 갱신이 필요하면 동일 endpoint를 다시 조회한다.
  polling 간격과 종료 시간은 제품 정책으로 별도 합의한다.

## Backend responsibilities

- 현재 사용자의 제출 선택에 대응하는 설명만 반환한다.
- 현재 Task Result의 `resultVersion`과 일치하며 검증을 통과한 LLM 결과만
  `AVAILABLE`로 반환한다.
- LLM provider, prompt, 내부 option key, `sourceOptionKeys`, 원문 응답 ID,
  내부 오류 메시지를 노출하지 않는다.
- 처리 중인 결과는 `PENDING`, 사용자에게 제공할 수 없는 종결 상태는
  `UNAVAILABLE`로 정규화한다.

## Frontend review checklist

- 기존 결과 응답에 `opinionMap`을 추가하는 방식에 동의하는가?
- 세 가지 상위 상태로 필요한 화면을 구분할 수 있는가?
- 세 가지 영역 상태로 본문과 placeholder를 구분할 수 있는가?
- `PENDING`에서 자동 polling이 필요한가?
- `UNAVAILABLE` 또는 영역별 placeholder를 숨길지 문구로 표시할지?
