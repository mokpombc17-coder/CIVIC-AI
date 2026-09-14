# Task Opinion Map 관리자 API 계약 v1

## 목적

관리자 페이지는 Opinion Map 생성에 최종 실패한 과업을 조회하고, 과업 단위로
수동 생성 또는 재시도를 요청한다. 두 API 모두 `vote:tasks:admin` 권한이 필요하다.

## 1. UNAVAILABLE 목록 조회

```http
GET /api/v1/admin/opinion-map-generations/unavailable?limit=20&cursor={cursor}
```

- `limit`: 선택값, 기본값 `20`, 허용 범위 `1..100`
- `cursor`: 선택값, 이전 응답의 `nextCursor`를 그대로 전달한다.
- 정렬: 가장 최근에 실패한 항목부터 내림차순
- 실제 생성 행의 상태가 `UNAVAILABLE`인 항목만 포함한다.
- 생성 이력이 없는 과거 마감 과업은 이 목록에 포함하지 않는다.

```json
{
  "items": [
    {
      "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
      "taskTitle": "우리 동네 생활 개선 과업",
      "resultVersion": 1,
      "attemptCount": 3,
      "lastErrorCode": "OPINION_MAP_OPENROUTER_TIMEOUT",
      "failedAt": "2026-09-11T12:00:00Z",
      "canRetry": true
    }
  ],
  "nextCursor": null
}
```

`canRetry`는 Opinion Map 생성 기능이 서버에서 활성화된 경우에만 `true`다.
잘못된 `cursor` 또는 `limit`에는 `400 INVALID_REQUEST`를 반환한다.

## 2. 수동 생성 또는 재시도

```http
POST /api/v1/admin/tasks/{taskId}/opinion-map-generation
Content-Length: 0
```

요청 본문은 없다. 현재 상태에 따른 동작은 다음과 같다.

| 현재 상태 | 동작 | action | HTTP |
| --- | --- | --- | --- |
| 생성 이력 없음 | 결과 manifest를 확인하거나 생성한 뒤 `PENDING` 생성 | `CREATED` | `202` |
| `UNAVAILABLE` | 실패 이력을 보존하고 시도 횟수를 `0`으로 초기화한 뒤 `PENDING` 전환 | `RETRIED` | `202` |
| `PENDING`, `PROCESSING`, `RETRY_WAIT` | 중복 생성하지 않음 | `UNCHANGED` | `200` |
| `AVAILABLE` | 재생성하지 않음 | `UNCHANGED` | `200` |

```json
{
  "taskId": "7dd2eaa5-7ef2-420a-93dc-0cb337be62ff",
  "resultVersion": 1,
  "status": "PENDING",
  "attemptCount": 0,
  "action": "RETRIED",
  "updatedAt": "2026-09-11T12:10:00Z"
}
```

`RETRIED`가 성공하면 해당 항목은 UNAVAILABLE 목록에서 즉시 빠진다. 이후 생성이
다시 최종 실패하면 새로운 `failedAt`, `attemptCount`, `lastErrorCode`로 목록에 나타난다.

오류 응답은 공통 Problem Details 형식을 사용한다.

- `404 TASK_NOT_FOUND`: 과업이 존재하지 않음
- `409 TASK_RESULT_NOT_ELIGIBLE`: 결과를 만들 수 있는 형태로 마감된 과업이 아님
- `503 OPINION_MAP_GENERATION_DISABLED`: 서버에서 생성 기능이 비활성화됨

## 프론트 연동

관리자 랜딩 페이지 진입 및 페이지 이동 시 목록 API를 호출한다. 재시도 버튼은
`canRetry=true`일 때만 활성화하고, POST가 성공하면 현재 목록을 다시 조회한다.
오류 코드의 사용자 문구는 프론트에서 결정한다.
