# Vote 진행 중 과업 목록 Frontend 계약

이 문서는 Vote Frontend의 진행 중 과업 목록 연동에 사용하는 현재 Backend 계약을 고정한다.

## 1. Endpoint

```http
GET /api/v1/me/tasks
```

- 인증 필수
- 필요 scope: `vote:tasks:read`
- 요청 파라미터 없음
- 응답은 page wrapper가 아닌 JSON 배열

## 2. 포함 조건

서버 현재 시각을 `serverNow`라고 할 때 다음 조건을 모두 만족하는 과업을 반환한다.

```text
task.status == OPEN
openedAt <= serverNow < closesAt
```

사용자의 제출 여부는 목록 포함 조건이 아니다. 따라서 사용자가 과업을 제출해도 과업이 진행 중인 동안에는 같은 `taskId`가 계속 반환된다.

Frontend는 `submission.submitted`로 진행 중 과업을 분류한다.

- `false`: 참여할 과업
- `true`: 참여 완료한 진행 중 과업

`submitted=true`는 사용자 제출이 완료됐다는 뜻이며 과업이 마감됐다는 뜻이 아니다.

## 3. 제외 조건

다음 과업은 반환하지 않는다.

- `DRAFT` 또는 `SCHEDULED` 과업
- `serverNow >= closesAt`인 과업
- 정상 마감 또는 조기 종료된 과업
- 취소된 과업
- 일정 미진행으로 종료된 과업

예약 마감 시각에는 lifecycle scheduler의 상태 전환 여부와 관계없이 즉시 목록에서 제외한다.

## 4. 정렬

목록 정렬은 다음 순서를 보장한다.

```text
closesAt ASC
taskId ASC
```

마감 시각이 빠른 과업이 먼저 오며, 마감 시각이 같으면 `taskId` 오름차순으로 정렬한다.

## 5. 응답

```json
[
  {
    "taskId": "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7",
    "title": "과업 제목",
    "description": "과업 설명",
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

| 필드 | 타입 | 계약 |
|---|---|---|
| `taskId` | UUID | 과업 식별자 |
| `title` | string | 과업 제목 |
| `description` | string 또는 null | 과업 설명 |
| `openedAt` | ISO 8601 Instant | 실제 공개 시각 |
| `closesAt` | ISO 8601 Instant | 예정 마감 시각 |
| `submission.submitted` | boolean | 현재 사용자의 제출 여부 |
| `submission.submissionId` | UUID 또는 null | 제출 식별자 |
| `submission.submittedAt` | ISO 8601 Instant 또는 null | 제출 완료 시각 |

`submission`은 다음 불변식을 만족한다.

| 상태 | `submitted` | `submissionId` | `submittedAt` |
|---|---:|---|---|
| 미제출 | `false` | `null` | `null` |
| 제출 완료 | `true` | UUID | ISO 8601 Instant |

## 6. 제출 전후 상태 전환

제출 전에는 다음과 같이 반환한다.

```json
{
  "submission": {
    "submitted": false,
    "submissionId": null,
    "submittedAt": null
  }
}
```

제출 성공 후 다음 목록 조회부터 같은 과업을 다음과 같이 반환한다.

```json
{
  "submission": {
    "submitted": true,
    "submissionId": "4aa0ba2e-7485-40d8-873c-49a64a1adf0c",
    "submittedAt": "2026-08-28T03:00:00Z"
  }
}
```

이 상태는 과업이 마감되거나 조기 종료·취소될 때까지 유지된다.

## 7. 시간과 제출 일관성

- 모든 시각은 ISO 8601 절대 시각으로 반환한다.
- 목록 포함 여부와 제출 가능 여부는 클라이언트 시간이 아닌 서버 시간으로 판정한다.
- `serverNow == closesAt`부터 목록에서 제외하며 제출할 수 없다.
- 제출 요청은 과업 row lock을 획득한 뒤 서버 시각으로 과업 상태를 다시 검사한다.

## 8. 접근 제어와 오류

| HTTP | `code` | 조건 |
|---:|---|---|
| `401` | `UNAUTHENTICATED` | 인증 정보가 없거나 유효하지 않음 |
| `403` | `ACCESS_DENIED` | `vote:tasks:read` scope 없음 |

목록이 비어 있으면 `200 OK`와 빈 배열 `[]`을 반환한다.

## 9. 현재 지원하지 않는 기능

- 제목·설명 검색
- cursor 또는 offset pagination
- Persona 준비 여부를 반영한 목록 필터
- `canSubmit` 또는 제출 불가 사유
- 마감 이후 참여 내역과 결과 상태

이 API의 `submitted=false`는 “아직 제출하지 않은 진행 중 과업”을 뜻한다. Persona가 준비되지 않은 사용자의 실제 제출 가능성까지 보장하지 않는다. Frontend가 이를 `참여할 과업`으로 표시하려면 Persona-ready 상태를 선행 조건으로 보장해야 한다.

마감 이후의 참여 내역은 별도의 참여 과업 목록 계약에서 다룬다.

## 10. Frontend 분류 예시

```ts
const availableTasks = tasks.filter(
  (task) => !task.submission.submitted,
);

const submittedOpenTasks = tasks.filter(
  (task) => task.submission.submitted,
);
```

