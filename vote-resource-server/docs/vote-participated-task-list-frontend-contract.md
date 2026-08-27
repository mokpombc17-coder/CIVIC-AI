# Vote 내 참여 과업 목록 Frontend 계약

이 문서는 사용자가 제출한 모든 Vote 과업을 진행 상태와 관계없이 누적 조회하는 Backend 계약을 고정한다.

## 1. Endpoint

```http
GET /api/v1/me/tasks/participated
    ?query={query}
    &cursor={cursor}
    &size=20
```

- 인증 필수
- 필요 scope: `vote:tasks:read`
- 응답 cache: `Cache-Control: private, no-cache`
- `size` 기본값 20, 최솟값 1, 최댓값 100
- `query` 선택값, trim 후 최대 200자
- `cursor` 선택값, 응답의 `nextCursor`를 그대로 전달

## 2. 목록 포함 정책

현재 사용자에게 `task_submissions`가 존재하는 모든 과업을 반환한다.

- 제출 완료 후 아직 진행 중인 과업
- 예약 마감 시각이 지났지만 lifecycle 처리를 기다리는 과업
- 정상 마감 또는 조기 종료된 과업
- 결과 manifest 생성을 기다리는 과업
- 결과가 확정된 과업
- 제출 이후 취소된 과업
- 비정상 또는 legacy 데이터에 제출이 남은 일정 미진행 과업

현재 사용자가 제출하지 않은 과업은 반환하지 않는다.

## 3. 검색

`query`가 있으면 trim과 소문자 정규화 후 제목 또는 설명에 해당 문자열이 포함된 과업만 반환한다.

- 대소문자를 구분하지 않는다.
- `%`, `_`도 wildcard가 아닌 일반 문자로 취급한다.
- cursor를 사용할 때는 첫 요청과 같은 검색어를 사용해야 한다.
- 다른 검색어와 cursor를 조합하면 `400 INVALID_REQUEST`를 반환한다.

## 4. 정렬과 pagination

```text
participation.submittedAt DESC
taskId DESC
```

정렬 키는 제출 이후 바뀌지 않으므로 과업 마감이나 결과 확정으로 상태가 바뀌어도 cursor 순서는 이동하지 않는다.

- 다음 페이지는 마지막 항목보다 오래된 제출부터 반환한다.
- 페이지 조회 도중 발생한 신규 제출은 진행 중인 cursor 조회에는 끼워 넣지 않는다.
- 신규 제출을 보려면 첫 페이지부터 갱신한다.
- Frontend는 `taskId`를 목록 key로 사용한다.

결과 확인 가능 항목 우선 정렬은 지원하지 않는다. 상태 기반 정렬은 결과 확정 시 항목 위치가 바뀌어 cursor 중복·누락을 만들 수 있으므로, 누적 참여 이력에서는 불변인 제출 시각을 우선한다.

## 5. 응답

```json
{
  "items": [
    {
      "taskId": "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7",
      "title": "과업 제목",
      "description": "과업 설명",
      "openedAt": "2026-08-27T00:00:00Z",
      "closesAt": "2026-08-30T00:00:00Z",
      "closedAt": "2026-08-30T00:00:01Z",
      "closureType": "DEADLINE_REACHED",
      "taskStatus": "CLOSED",
      "canSubmit": false,
      "participation": {
        "status": "SUBMITTED",
        "submissionId": "4aa0ba2e-7485-40d8-873c-49a64a1adf0c",
        "submittedAt": "2026-08-28T03:00:00Z"
      },
      "result": {
        "status": "AVAILABLE",
        "version": 1,
        "finalizedAt": "2026-08-30T00:00:01Z",
        "accessAllowed": true
      }
    }
  ],
  "nextCursor": null
}
```

`openedAt`은 정상적인 제출 과업에서는 ISO 8601 시각이다. 일정 미진행 상태인데 제출 이력이 남아 있는 비정상 또는 legacy 데이터에서는 `null`일 수 있다.

## 6. 세 가지 상태 축

### 6.1 과업 생명주기 `taskStatus`

| 값 | 의미 |
|---|---|
| `DRAFT` | 제출 이력과 함께 존재하면 비정상 또는 legacy 상태 |
| `SCHEDULED` | 제출 이력과 함께 존재하면 비정상 또는 legacy 상태 |
| `OPEN` | 진행 중이며 아직 예약 마감 시각 전 |
| `CLOSING` | 예약 마감 시각이 지났지만 lifecycle 마감 처리 전 |
| `CLOSED` | 정상 마감 또는 조기 종료 |
| `CANCELLED` | 제출 이후 취소됨 |
| `MISSED_SCHEDULE` | 일정 미진행으로 종료됨 |

`CLOSING`을 별도로 제공하므로 사용자가 제출한 과업은 예약 마감 직후에도 목록에서 사라지지 않는다.

### 6.2 참여 상태 `participation.status`

이 API의 모든 항목은 다음 값이다.

```text
SUBMITTED
```

따라서 `canSubmit`은 항상 `false`다.

### 6.3 결과 상태 `result.status`

| 값 | 의미 | `accessAllowed` |
|---|---|---:|
| `NOT_AVAILABLE` | 진행 중이라 결과 미공개 | `false` |
| `CALCULATING` | 마감 처리 또는 결과 manifest 생성 대기 | `false` |
| `AVAILABLE` | 확정 결과 조회 가능 | `true` |
| `UNAVAILABLE` | 취소 또는 일정 미진행으로 결과 미제공 | `false` |

`version`과 `finalizedAt`은 `AVAILABLE`일 때만 값이 있으며, 나머지 상태에서는 `null`이다.

## 7. Frontend 동작

| `taskStatus` | `result.status` | 권장 표시 | 동작 |
|---|---|---|---|
| `OPEN` | `NOT_AVAILABLE` | 결과 대기 | 내 응답 보기 |
| `CLOSING` | `CALCULATING` | 집계 중 | 자동 재조회 또는 새로고침 |
| `CLOSED` | `CALCULATING` | 집계 중 | 자동 재조회 또는 새로고침 |
| `CLOSED` | `AVAILABLE` | 결과 보기 | 결과 상세 API 호출 |
| `CANCELLED` | `UNAVAILABLE` | 취소됨 | 결과 버튼 비활성화 |
| `MISSED_SCHEDULE` | `UNAVAILABLE` | 결과 없음 | 결과 버튼 비활성화 |

본인의 제출 내용은 다음 API로 조회한다.

```http
GET /api/v1/me/submissions?taskId={taskId}
```

확정 결과는 `result.accessAllowed=true`일 때 다음 API로 조회한다.

```http
GET /api/v1/me/tasks/{taskId}/result
```

## 8. 오류

| HTTP | `code` | 조건 |
|---:|---|---|
| `400` | `INVALID_REQUEST` | cursor, size 또는 query가 계약에 맞지 않음 |
| `401` | `UNAUTHENTICATED` | 인증 정보가 없거나 유효하지 않음 |
| `403` | `ACCESS_DENIED` | `vote:tasks:read` scope 없음 |

조회 결과가 없으면 `200 OK`와 다음 응답을 반환한다.

```json
{
  "items": [],
  "nextCursor": null
}
```

## 9. 기존 API와의 관계

- `GET /api/v1/me/tasks`: 현재 진행 중인 과업 전체. 제출 여부로 참여 가능과 진행 중 참여를 분류한다.
- `GET /api/v1/me/tasks/participated`: 사용자가 제출한 모든 과업의 누적 이력과 결과 상태를 제공한다.
- `GET /api/v1/me/tasks/completed`: 결과가 확정된 정상 마감 과업만 제공하는 기존 호환 API다.

Frontend의 신규 내 참여 화면은 `/participated`를 사용하며 `/completed`와 진행 중 목록을 직접 합치지 않는다.

